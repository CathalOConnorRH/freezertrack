import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import FoodItemResponse
from app.services import label_image, print_service, qr_service

router = APIRouter(prefix="/api/labels", tags=["labels"])

DATA_DIR = os.environ.get("LABEL_DATA_DIR", os.path.join("data", "labels"))


def _ensure_label(item: FoodItem) -> str:
    label_path = os.path.join(DATA_DIR, f"{item.id}.png")
    if os.path.exists(label_path):
        return label_path

    qr_path = os.path.join(DATA_DIR, f"{item.id}_qr.png")
    os.makedirs(DATA_DIR, exist_ok=True)
    qr_data = {
        "id": item.id,
        "name": item.name,
        "frozen": str(item.frozen_date),
        "qty": item.quantity,
    }
    qr_service.generate_qr_png(qr_data, qr_path)

    item_resp = FoodItemResponse.model_validate(item)
    label_image.compose_label(item_resp, qr_path, label_path)
    return label_path


@router.get("/{item_id}/preview")
def preview_label(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    label_path = _ensure_label(item)
    return FileResponse(label_path, media_type="image/png")


@router.post("/{item_id}/print")
def print_label_endpoint(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    label_path = _ensure_label(item)
    result = print_service.print_label(label_path, settings.NIIMBOT_MAC)
    return {"printed": True, "success": result}
