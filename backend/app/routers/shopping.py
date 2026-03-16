from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.food import FoodItem, ShoppingItem
from app.schemas.food import ShoppingItemCreate, ShoppingItemResponse

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


@router.get("", response_model=list[ShoppingItemResponse])
def list_shopping(db: Session = Depends(get_db)):
    return (
        db.query(ShoppingItem)
        .filter(ShoppingItem.completed_at.is_(None))
        .order_by(ShoppingItem.added_at.desc())
        .all()
    )


@router.post("", response_model=ShoppingItemResponse, status_code=201)
def add_shopping_item(payload: ShoppingItemCreate, db: Session = Depends(get_db)):
    item = ShoppingItem(
        name=payload.name,
        brand=payload.brand,
        quantity=payload.quantity,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/complete", response_model=ShoppingItemResponse)
def complete_shopping_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_shopping_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


@router.post("/suggest")
def suggest_items(db: Session = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recently_removed = (
        db.query(FoodItem)
        .filter(FoodItem.removed_at.isnot(None), FoodItem.removed_at >= cutoff)
        .all()
    )

    active_names = {
        row[0].lower()
        for row in db.query(FoodItem.name)
        .filter(FoodItem.removed_at.is_(None))
        .all()
    }
    shopping_names = {
        row[0].lower()
        for row in db.query(ShoppingItem.name)
        .filter(ShoppingItem.completed_at.is_(None))
        .all()
    }

    suggestions: dict[str, dict] = {}
    for item in recently_removed:
        key = item.name.lower()
        if key not in active_names and key not in shopping_names and key not in suggestions:
            suggestions[key] = {"name": item.name, "brand": item.brand}

    return list(suggestions.values())
