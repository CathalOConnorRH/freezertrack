from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
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
