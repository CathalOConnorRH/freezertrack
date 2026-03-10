from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.food import FoodItem, Freezer

router = APIRouter(prefix="/api/freezers", tags=["freezers"])


class FreezerCreate(BaseModel):
    name: str
    location: str | None = None


class FreezerUpdate(BaseModel):
    name: str | None = None
    location: str | None = None


@router.get("")
def list_freezers(db: Session = Depends(get_db)):
    freezers = db.query(Freezer).order_by(Freezer.name).all()
    result = []
    for f in freezers:
        count = (
            db.query(FoodItem)
            .filter(FoodItem.freezer_id == f.id, FoodItem.removed_at.is_(None))
            .count()
        )
        result.append({
            "id": f.id,
            "name": f.name,
            "location": f.location,
            "item_count": count,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return result


@router.post("", status_code=201)
def create_freezer(payload: FreezerCreate, db: Session = Depends(get_db)):
    freezer = Freezer(name=payload.name, location=payload.location)
    db.add(freezer)
    db.commit()
    db.refresh(freezer)
    return {"id": freezer.id, "name": freezer.name, "location": freezer.location}


@router.patch("/{freezer_id}")
def update_freezer(
    freezer_id: str, payload: FreezerUpdate, db: Session = Depends(get_db)
):
    freezer = db.query(Freezer).filter(Freezer.id == freezer_id).first()
    if not freezer:
        raise HTTPException(status_code=404, detail="Freezer not found")

    if payload.name is not None:
        freezer.name = payload.name
    if payload.location is not None:
        freezer.location = payload.location

    db.commit()
    db.refresh(freezer)
    return {"id": freezer.id, "name": freezer.name, "location": freezer.location}


@router.delete("/{freezer_id}", status_code=204)
def delete_freezer(freezer_id: str, db: Session = Depends(get_db)):
    freezer = db.query(Freezer).filter(Freezer.id == freezer_id).first()
    if not freezer:
        raise HTTPException(status_code=404, detail="Freezer not found")

    count = (
        db.query(FoodItem)
        .filter(FoodItem.freezer_id == freezer_id, FoodItem.removed_at.is_(None))
        .count()
    )
    if count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete freezer with {count} active items",
        )

    db.delete(freezer)
    db.commit()
