"""Binary sensor platform for FreezerTrack."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)

from .entity import FreezerTrackEntity

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import FreezerTrackCoordinator
    from .data import FreezerTrackConfigEntry


BINARY_SENSOR_DESCRIPTIONS: tuple[BinarySensorEntityDescription, ...] = (
    BinarySensorEntityDescription(
        key="low_stock",
        name="Low stock",
        icon="mdi:fridge-alert-outline",
        device_class=BinarySensorDeviceClass.PROBLEM,
    ),
    BinarySensorEntityDescription(
        key="old_items",
        name="Old items",
        icon="mdi:clock-alert",
        device_class=BinarySensorDeviceClass.PROBLEM,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up FreezerTrack binary sensors."""
    coordinator = entry.runtime_data.coordinator
    async_add_entities(
        FreezerTrackBinarySensor(coordinator=coordinator, description=desc)
        for desc in BINARY_SENSOR_DESCRIPTIONS
    )


class FreezerTrackBinarySensor(FreezerTrackEntity, BinarySensorEntity):
    """FreezerTrack binary sensor."""

    def __init__(
        self,
        coordinator: FreezerTrackCoordinator,
        description: BinarySensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = (
            f"{coordinator.config_entry.entry_id}_{description.key}"
        )

    @property
    def is_on(self) -> bool | None:
        if not self.coordinator.data:
            return None
        alerts = self.coordinator.data.get("state", {}).get("alerts", [])
        key = self.entity_description.key

        if key == "low_stock":
            return any(a["type"] == "low_stock" for a in alerts)
        if key == "old_items":
            return any(a["type"] == "old_item" for a in alerts)
        return False

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self.coordinator.data:
            return {}
        alerts = self.coordinator.data.get("state", {}).get("alerts", [])
        key = self.entity_description.key

        if key == "low_stock":
            alert = next((a for a in alerts if a["type"] == "low_stock"), None)
            if alert:
                return {
                    "current_count": alert.get("current_count"),
                    "threshold": alert.get("threshold"),
                }
            return {}
        if key == "old_items":
            old = [a for a in alerts if a["type"] == "old_item"]
            return {
                "count": len(old),
                "items": [
                    {"name": a["name"], "days_frozen": a["days_frozen"]} for a in old
                ],
            }
        return {}
