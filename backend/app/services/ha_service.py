from datetime import date, timedelta

from app.config import Settings
from app.models.food import FoodItem
from app.services.alert_service import get_alerts


def build_ha_state(items: list[FoodItem], settings: Settings) -> dict:
    active_items = [i for i in items if i.removed_at is None]

    oldest_days = 0
    item_dicts = []
    for i in active_items:
        days_frozen = (date.today() - i.frozen_date).days
        if days_frozen > oldest_days:
            oldest_days = days_frozen

        expiration_date = None
        if i.shelf_life_days is not None:
            expiration_date = str(i.frozen_date + timedelta(days=i.shelf_life_days))

        item_dicts.append(
            {
                "id": i.id,
                "name": i.name,
                "brand": i.brand,
                "category": i.category,
                "frozen_date": str(i.frozen_date),
                "quantity": i.quantity,
                "days_frozen": days_frozen,
                "expiration_date": expiration_date,
                "notes": i.notes,
                "freezer_id": i.freezer_id,
            }
        )

    return {
        "total_items": len(active_items),
        "oldest_item_days": oldest_days,
        "items": item_dicts,
        "alerts": get_alerts(active_items, settings),
    }
