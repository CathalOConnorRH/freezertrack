import os
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem, Freezer, ShoppingItem
from app.schemas.food import (
    SHELF_LIFE_MAP,
    FoodItemCreate,
    FoodItemResponse,
    FoodItemUpdate,
)
from app.routers.scanner import record_last_scan
from app.services import barcode_service, label_image, print_service, qr_service

router = APIRouter(prefix="/api/food", tags=["food"])

LABEL_DIR = os.environ.get("LABEL_DATA_DIR", os.path.join("data", "labels"))
PHOTO_DIR = os.environ.get("PHOTO_DATA_DIR", os.path.join("data", "photos"))

PRESET_CATEGORIES = [
    "Meat", "Poultry", "Fish", "Vegetables", "Fruit",
    "Ready Meals", "Soups", "Bread", "Desserts", "Other",
]


@router.get("", response_model=list[FoodItemResponse])
def list_items(category: str | None = None, freezer_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(FoodItem).filter(FoodItem.removed_at.is_(None))
    if category:
        q = q.filter(FoodItem.category.ilike(category))
    if freezer_id:
        q = q.filter(FoodItem.freezer_id == freezer_id)
    return q.all()


@router.get("/history", response_model=list[FoodItemResponse])
def list_history(db: Session = Depends(get_db)):
    return db.query(FoodItem).filter(FoodItem.removed_at.isnot(None)).all()


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    used = (
        db.query(FoodItem.category)
        .filter(FoodItem.removed_at.is_(None), FoodItem.category.isnot(None))
        .distinct()
        .all()
    )
    used_set = {r[0] for r in used if r[0]}
    all_cats = sorted(set(PRESET_CATEGORIES) | used_set)
    return all_cats


@router.get("/grouped")
def list_grouped(category: str | None = None, freezer_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(FoodItem).filter(FoodItem.removed_at.is_(None))
    if category:
        q = q.filter(FoodItem.category.ilike(category))
    if freezer_id:
        q = q.filter(FoodItem.freezer_id == freezer_id)
    items = q.all()

    freezer_map: dict[str | None, str] = {}
    for f in db.query(Freezer).all():
        freezer_map[f.id] = f.name

    groups: dict[str, dict] = {}
    for item in items:
        key = item.name.lower()
        if key not in groups:
            freezer_name = freezer_map.get(item.freezer_id) if item.freezer_id else None
            groups[key] = {
                "name": item.name,
                "brand": item.brand,
                "category": item.category,
                "freezer_id": item.freezer_id,
                "freezer_name": freezer_name,
                "count": 0,
                "total_servings": 0,
                "oldest_date": str(item.frozen_date),
                "newest_date": str(item.frozen_date),
                "oldest_id": item.id,
                "items": [],
            }
        g = groups[key]
        g["count"] += 1
        g["total_servings"] += item.quantity
        if str(item.frozen_date) < g["oldest_date"]:
            g["oldest_date"] = str(item.frozen_date)
            g["oldest_id"] = item.id
        if str(item.frozen_date) > g["newest_date"]:
            g["newest_date"] = str(item.frozen_date)
        g["items"].append(FoodItemResponse.model_validate(item).model_dump(mode="json"))
    return sorted(groups.values(), key=lambda g: g["newest_date"], reverse=True)


@router.get("/search", response_model=list[FoodItemResponse])
def search_items(q: str, db: Session = Depends(get_db)):
    return (
        db.query(FoodItem)
        .filter(FoodItem.removed_at.is_(None))
        .filter(
            or_(FoodItem.name.ilike(f"%{q}%"), FoodItem.brand.ilike(f"%{q}%"))
        )
        .all()
    )


@router.get("/by-barcode/{barcode}", response_model=list[FoodItemResponse])
def get_items_by_barcode(barcode: str, db: Session = Depends(get_db)):
    """Find active food items that were created from this retail barcode."""
    return (
        db.query(FoodItem)
        .filter(FoodItem.barcode == barcode, FoodItem.removed_at.is_(None))
        .order_by(FoodItem.frozen_date)
        .all()
    )


@router.get("/lookup/{barcode}")
async def lookup_barcode_endpoint(barcode: str):
    return await barcode_service.lookup_barcode(barcode, settings)


class BarcodeMapping(BaseModel):
    barcode: str
    name: str
    brand: str | None = None


@router.post("/barcode")
def save_barcode_mapping(payload: BarcodeMapping, db: Session = Depends(get_db)):
    """Save a manual barcode-to-product mapping so future scans resolve it."""
    from app.models.food import BarcodeCache

    existing = db.query(BarcodeCache).filter(BarcodeCache.barcode == payload.barcode).first()
    if existing:
        existing.name = payload.name
        existing.brand = payload.brand or ""
        existing.source = "manual"
        existing.found = True
        existing.cached_at = datetime.now(timezone.utc)
    else:
        entry = BarcodeCache(
            barcode=payload.barcode,
            name=payload.name,
            brand=payload.brand or "",
            source="manual",
            found=True,
            cached_at=datetime.now(timezone.utc),
        )
        db.add(entry)
    db.commit()
    barcode_service.store_in_mem_cache(payload.barcode, {
        "name": payload.name,
        "brand": payload.brand or "",
        "source": "manual",
        "found": True,
    })
    return {"saved": True, "barcode": payload.barcode}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    all_items = db.query(FoodItem).all()
    active = [i for i in all_items if i.removed_at is None]
    removed = [i for i in all_items if i.removed_at is not None]

    avg_age = 0
    if active:
        ages = [(date.today() - i.frozen_date).days for i in active]
        avg_age = sum(ages) / len(ages)

    name_counts: dict[str, int] = {}
    for i in all_items:
        name_counts[i.name] = name_counts.get(i.name, 0) + 1
    top_items = sorted(name_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    now = datetime.now(timezone.utc)
    weeks = []

    def _make_aware(dt):
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    for w in range(11, -1, -1):
        start = now - timedelta(weeks=w + 1)
        end_dt = now - timedelta(weeks=w)
        added = sum(1 for i in all_items if start <= _make_aware(i.created_at) < end_dt)
        removed_count = sum(
            1 for i in removed
            if i.removed_at and start <= _make_aware(i.removed_at) < end_dt
        )
        week_label = (now - timedelta(weeks=w)).strftime("%d %b")
        weeks.append({"week": week_label, "added": added, "removed": removed_count})

    cat_counts: dict[str, int] = {}
    for i in active:
        cat = i.category or "Uncategorised"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    return {
        "total_active": len(active),
        "total_removed": len(removed),
        "total_ever": len(all_items),
        "average_age_days": round(avg_age, 1),
        "top_items": [{"name": n, "count": c} for n, c in top_items],
        "timeline": weeks,
        "categories": [{"name": n, "count": c} for n, c in cat_counts.items()],
    }


@router.post("", status_code=201)
def create_item(payload: FoodItemCreate, db: Session = Depends(get_db)):
    containers = max(1, payload.containers)
    created_items = []
    printed_count = 0

    shelf_life = payload.shelf_life_days
    if shelf_life is None and payload.category:
        shelf_life = SHELF_LIFE_MAP.get(payload.category.lower())

    items = []
    for _ in range(containers):
        item_id = str(uuid.uuid4())
        item = FoodItem(
            id=item_id,
            name=payload.name,
            brand=payload.brand,
            category=payload.category,
            barcode=payload.barcode,
            frozen_date=payload.frozen_date,
            quantity=payload.quantity,
            shelf_life_days=shelf_life,
            notes=payload.notes,
            freezer_id=payload.freezer_id,
            qr_code_id=item_id,
        )
        db.add(item)
        items.append(item)

    db.commit()
    for item in items:
        db.refresh(item)

    for item in items:
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

        created_items.append(FoodItemResponse.model_validate(item).model_dump(mode="json"))

    if created_items:
        record_last_scan(
            name=created_items[0].get("name", ""),
            barcode=payload.barcode,
            action="in",
        )

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

    remaining = (
        db.query(FoodItem)
        .filter(
            FoodItem.name.ilike(item.name),
            FoodItem.removed_at.is_(None),
        )
        .count()
    )
    if remaining == 0:
        existing = (
            db.query(ShoppingItem)
            .filter(
                ShoppingItem.name.ilike(item.name),
                ShoppingItem.completed_at.is_(None),
            )
            .first()
        )
        if not existing:
            shopping = ShoppingItem(
                name=item.name,
                brand=item.brand,
                quantity=1,
                source_item_id=item.id,
            )
            db.add(shopping)
            db.commit()

    record_last_scan(name=item.name, barcode=item.barcode, action="out")
    return item


@router.post("/{item_id}/decrement")
def decrement_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.removed_at is not None:
        raise HTTPException(status_code=400, detail="Item already removed")

    removed = False
    if item.quantity <= 1:
        item.removed_at = datetime.now(timezone.utc)
        removed = True
    else:
        item.quantity -= 1

    db.commit()
    db.refresh(item)
    return {
        "item": FoodItemResponse.model_validate(item).model_dump(mode="json"),
        "remaining": item.quantity,
        "removed": removed,
    }


@router.post("/{item_id}/readd")
def readd_item(item_id: str, db: Session = Depends(get_db)):
    source = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Item not found")

    new_id = str(uuid.uuid4())
    item = FoodItem(
        id=new_id,
        name=source.name,
        brand=source.brand,
        category=source.category,
        barcode=source.barcode,
        frozen_date=date.today(),
        quantity=source.quantity,
        shelf_life_days=source.shelf_life_days,
        notes=source.notes,
        qr_code_id=new_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return FoodItemResponse.model_validate(item).model_dump(mode="json")


MAX_PHOTO_BYTES = 10 * 1024 * 1024


@router.post("/{item_id}/photo")
async def upload_photo(item_id: str, file: UploadFile, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    import io as _io

    try:
        img = Image.open(_io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    photo_path = os.path.join(PHOTO_DIR, f"{item_id}.jpg")

    img.thumbnail((800, 800))
    img = img.convert("RGB")
    img.save(photo_path, "JPEG", quality=85)

    item.photo_path = photo_path
    db.commit()
    return {"success": True, "photo_path": photo_path}


@router.get("/{item_id}/photo")
def get_photo(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item or not item.photo_path or not os.path.exists(item.photo_path):
        raise HTTPException(status_code=404, detail="Photo not found")

    real_photo = os.path.realpath(item.photo_path)
    real_dir = os.path.realpath(PHOTO_DIR)
    if not real_photo.startswith(real_dir + os.sep):
        raise HTTPException(status_code=404, detail="Photo not found")

    return FileResponse(real_photo, media_type="image/jpeg")


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
