import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import FoodItemCreate, FoodItemResponse, FoodItemUpdate
from app.services import barcode_service, label_image, print_service, qr_service

router = APIRouter(prefix="/api/food", tags=["food"])

LABEL_DIR = os.environ.get("LABEL_DATA_DIR", os.path.join("data", "labels"))


@router.get("", response_model=list[FoodItemResponse])
def list_items(db: Session = Depends(get_db)):
    return db.query(FoodItem).filter(FoodItem.removed_at.is_(None)).all()


@router.get("/history", response_model=list[FoodItemResponse])
def list_history(db: Session = Depends(get_db)):
    return db.query(FoodItem).filter(FoodItem.removed_at.isnot(None)).all()


@router.get("/search", response_model=list[FoodItemResponse])
def search_items(q: str, db: Session = Depends(get_db)):
    return (
        db.query(FoodItem)
        .filter(FoodItem.removed_at.is_(None))
        .filter(FoodItem.name.ilike(f"%{q}%"))
        .all()
    )


@router.get("/lookup/{barcode}")
async def lookup_barcode_endpoint(barcode: str):
    return await barcode_service.lookup_barcode(barcode, settings)


@router.post("", status_code=201)
def create_item(payload: FoodItemCreate, db: Session = Depends(get_db)):
    containers = max(1, payload.containers)
    created_items = []
    printed_count = 0

    for _ in range(containers):
        item_id = str(uuid.uuid4())
        item = FoodItem(
            id=item_id,
            name=payload.name,
            frozen_date=payload.frozen_date,
            quantity=payload.quantity,
            notes=payload.notes,
            qr_code_id=item_id,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        if payload.auto_print and settings.AUTO_PRINT:
            os.makedirs(LABEL_DIR, exist_ok=True)
            qr_path = os.path.join(LABEL_DIR, f"{item.id}_qr.png")
            label_path = os.path.join(LABEL_DIR, f"{item.id}.png")
            qr_data = {
                "id": item.id,
                "name": item.name,
                "frozen": str(item.frozen_date),
                "qty": item.quantity,
            }
            qr_service.generate_qr_png(qr_data, qr_path)
            item_resp = FoodItemResponse.model_validate(item)
            label_image.compose_label(item_resp, qr_path, label_path)
            if print_service.print_label(label_path, settings.NIIMBOT_MAC):
                printed_count += 1

        created_items.append(FoodItemResponse.model_validate(item).model_dump())

    return {
        "items": created_items,
        "count": len(created_items),
        "printed": printed_count,
    }


@router.get("/{item_id}", response_model=FoodItemResponse)
def get_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.patch("/{item_id}", response_model=FoodItemResponse)
def update_item(
    item_id: str, payload: FoodItemUpdate, db: Session = Depends(get_db)
):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/remove", response_model=FoodItemResponse)
def remove_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.removed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
