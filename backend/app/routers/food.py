import os
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem, ShoppingItem
from app.schemas.food import (
    SHELF_LIFE_MAP,
    FoodItemCreate,
    FoodItemResponse,
    FoodItemUpdate,
)
from app.services import barcode_service, label_image, print_service, qr_service

router = APIRouter(prefix="/api/food", tags=["food"])

LABEL_DIR = os.environ.get("LABEL_DATA_DIR", os.path.join("data", "labels"))
PHOTO_DIR = os.environ.get("PHOTO_DATA_DIR", os.path.join("data", "photos"))

PRESET_CATEGORIES = [
    "Meat", "Poultry", "Fish", "Vegetables", "Fruit",
    "Ready Meals", "Soups", "Bread", "Desserts", "Other",
]


@router.get("", response_model=list[FoodItemResponse])
def list_items(category: str | None = None, db: Session = Depends(get_db)):
    q = db.query(FoodItem).filter(FoodItem.removed_at.is_(None))
    if category:
        q = q.filter(FoodItem.category.ilike(category))
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
def list_grouped(category: str | None = None, db: Session = Depends(get_db)):
    q = db.query(FoodItem).filter(FoodItem.removed_at.is_(None))
    if category:
        q = q.filter(FoodItem.category.ilike(category))
    items = q.all()

    groups: dict[str, dict] = {}
    for item in items:
        key = item.name.lower()
        if key not in groups:
            groups[key] = {
                "name": item.name,
                "brand": item.brand,
                "category": item.category,
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


@router.get("/lookup/{barcode}")
async def lookup_barcode_endpoint(barcode: str):
    return await barcode_service.lookup_barcode(barcode, settings)


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
    for w in range(11, -1, -1):
        start = now - timedelta(weeks=w + 1)
        end = now - timedelta(weeks=w)
        added = sum(1 for i in all_items if start <= i.created_at < end)
        removed_count = sum(
            1 for i in removed if i.removed_at and start <= i.removed_at < end
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

    for _ in range(containers):
        item_id = str(uuid.uuid4())
        item = FoodItem(
            id=item_id,
            name=payload.name,
            brand=payload.brand,
            category=payload.category,
            frozen_date=payload.frozen_date,
            quantity=payload.quantity,
            shelf_life_days=shelf_life,
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

        created_items.append(FoodItemResponse.model_validate(item).model_dump(mode="json"))

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


@router.post("/{item_id}/photo")
async def upload_photo(item_id: str, file: UploadFile, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    photo_path = os.path.join(PHOTO_DIR, f"{item_id}.jpg")

    content = await file.read()
    img = Image.open(__import__("io").BytesIO(content))
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
    return FileResponse(item.photo_path, media_type="image/jpeg")


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
