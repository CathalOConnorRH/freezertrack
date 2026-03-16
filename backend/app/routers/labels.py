import glob
import io
import os
import tempfile
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import FoodItemResponse
from app.services import label_image, print_service, qr_service

router = APIRouter(prefix="/api/labels", tags=["labels"])

DATA_DIR = os.environ.get("LABEL_DATA_DIR", os.path.join("data", "labels"))


def _ensure_label(item: FoodItem, force: bool = False) -> str:
    label_path = os.path.join(DATA_DIR, f"{item.id}.png")
    if not force and os.path.exists(label_path):
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


@router.get("/preview-sample")
def preview_sample(
    width: int = Query(default=None),
    height: int = Query(default=None),
    font_size: int = Query(default=None),
    show_brand: bool = Query(default=None),
    show_notes: bool = Query(default=None),
    show_category: bool = Query(default=None),
    sample_name: str = Query(default="Chicken Curry"),
    sample_brand: str = Query(default="Home Made"),
    sample_category: str = Query(default="Ready Meals"),
    sample_qty: int = Query(default=2),
    sample_notes: str = Query(default="Spicy, double portion"),
):
    orig_w = settings.LABEL_WIDTH
    orig_h = settings.LABEL_HEIGHT
    orig_fs = settings.LABEL_FONT_SIZE
    orig_sb = settings.LABEL_SHOW_BRAND
    orig_sn = settings.LABEL_SHOW_NOTES
    orig_sc = settings.LABEL_SHOW_CATEGORY

    try:
        if width is not None:
            settings.LABEL_WIDTH = width
        if height is not None:
            settings.LABEL_HEIGHT = height
        if font_size is not None:
            settings.LABEL_FONT_SIZE = font_size
        if show_brand is not None:
            settings.LABEL_SHOW_BRAND = show_brand
        if show_notes is not None:
            settings.LABEL_SHOW_NOTES = show_notes
        if show_category is not None:
            settings.LABEL_SHOW_CATEGORY = show_category

        sample_item = FoodItemResponse(
            id="sample01-preview-label",
            name=sample_name,
            brand=sample_brand,
            category=sample_category,
            barcode=None,
            frozen_date=date.today(),
            quantity=sample_qty,
            shelf_life_days=180,
            notes=sample_notes,
            photo_path=None,
            freezer_id=None,
            removed_at=None,
            qr_code_id="sample01-preview-label",
            created_at=date.today(),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            qr_path = os.path.join(tmpdir, "qr.png")
            label_path = os.path.join(tmpdir, "label.png")

            qr_data = {
                "id": sample_item.id,
                "name": sample_item.name,
                "frozen": str(sample_item.frozen_date),
                "qty": sample_item.quantity,
            }
            qr_service.generate_qr_png(qr_data, qr_path)
            label_image.compose_label(sample_item, qr_path, label_path)

            with open(label_path, "rb") as f:
                content = f.read()

        return StreamingResponse(io.BytesIO(content), media_type="image/png")
    finally:
        settings.LABEL_WIDTH = orig_w
        settings.LABEL_HEIGHT = orig_h
        settings.LABEL_FONT_SIZE = orig_fs
        settings.LABEL_SHOW_BRAND = orig_sb
        settings.LABEL_SHOW_NOTES = orig_sn
        settings.LABEL_SHOW_CATEGORY = orig_sc


@router.get("/printer/status")
def printer_status():
    return print_service.check_printer(settings.NIIMBOT_MAC)


@router.post("/invalidate")
def invalidate_label_cache():
    count = 0
    for f in glob.glob(os.path.join(DATA_DIR, "*.png")):
        os.remove(f)
        count += 1
    return {"deleted": count}


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

    label_path = _ensure_label(item, force=True)
    result = print_service.print_label(label_path, settings.NIIMBOT_MAC)
    return {"printed": True, "success": result}
