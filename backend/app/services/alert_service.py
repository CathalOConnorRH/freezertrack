from datetime import date

from app.config import Settings
from app.models.food import FoodItem


def get_alerts(items: list[FoodItem], settings: Settings) -> list[dict]:
    alerts: list[dict] = []
    active = [i for i in items if i.removed_at is None]

    for item in active:
        days_frozen = (date.today() - item.frozen_date).days
        if days_frozen >= settings.ALERT_DAYS_FROZEN:
            alerts.append(
                {
                    "type": "old_item",
                    "id": item.id,
                    "name": item.name,
                    "frozen_date": str(item.frozen_date),
                    "days_frozen": days_frozen,
                }
            )

    active_count = len(active)
    if active_count < settings.LOW_STOCK_THRESHOLD:
        alerts.append(
            {
                "type": "low_stock",
                "current_count": active_count,
                "threshold": settings.LOW_STOCK_THRESHOLD,
            }
        )

    return alerts
