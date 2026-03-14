import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import SHELF_LIFE_MAP, FoodItemResponse
from app.services.alert_service import get_alerts
from app.services.ha_service import build_ha_state

router = APIRouter(prefix="/api/ha", tags=["homeassistant"])


@router.get("/state")
def ha_state(db: Session = Depends(get_db)):
    items = db.query(FoodItem).all()
    return build_ha_state(items, settings)


@router.get("/alerts")
def ha_alerts(db: Session = Depends(get_db)):
    items = db.query(FoodItem).filter(FoodItem.removed_at.is_(None)).all()
    return {"alerts": get_alerts(items, settings)}


class ScanInPayload(BaseModel):
    name: str
    quantity: int = 1
    brand: str | None = None
    category: str | None = None
    frozen_date: date | None = None
    shelf_life_days: int | None = None
    notes: str | None = None
    freezer_id: str | None = None


@router.post("/scan-in", status_code=201)
def ha_scan_in(payload: ScanInPayload, db: Session = Depends(get_db)):
    """Add a new item to the freezer inventory from Home Assistant."""
    frozen = payload.frozen_date or date.today()
    shelf_life = payload.shelf_life_days
    if shelf_life is None and payload.category:
        shelf_life = SHELF_LIFE_MAP.get(payload.category.lower())

    item_id = str(uuid.uuid4())
    item = FoodItem(
        id=item_id,
        name=payload.name,
        brand=payload.brand,
        category=payload.category,
        frozen_date=frozen,
        quantity=payload.quantity,
        shelf_life_days=shelf_life,
        notes=payload.notes,
        freezer_id=payload.freezer_id,
        qr_code_id=item_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    all_items = db.query(FoodItem).all()
    return {
        "item": FoodItemResponse.model_validate(item).model_dump(mode="json"),
        "state": build_ha_state(all_items, settings),
    }
