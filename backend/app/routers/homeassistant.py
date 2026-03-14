from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem, ShoppingItem
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


@router.post("/scan-out/{item_id}")
def ha_scan_out(item_id: str, db: Session = Depends(get_db)):
    """Scan an item out of the freezer via Home Assistant."""
    item = db.query(FoodItem).filter(FoodItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.removed_at is not None:
        raise HTTPException(status_code=400, detail="Item already removed")

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

    return {
        "success": True,
        "item_id": item.id,
        "name": item.name,
        "removed_at": item.removed_at.isoformat(),
    }
