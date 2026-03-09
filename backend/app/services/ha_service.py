from datetime import date

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
        item_dicts.append(
            {
                "id": i.id,
                "name": i.name,
                "frozen_date": str(i.frozen_date),
                "quantity": i.quantity,
                "days_frozen": days_frozen,
            }
        )

    return {
        "total_items": len(active_items),
        "oldest_item_days": oldest_days,
        "items": item_dicts,
        "alerts": get_alerts(active_items, settings),
    }
