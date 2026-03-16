"""Sensor platform for FreezerTrack."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import (
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)

from .const import DOMAIN
from .entity import FreezerTrackEntity

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import FreezerTrackCoordinator
    from .data import FreezerTrackConfigEntry


SENSOR_DESCRIPTIONS: tuple[SensorEntityDescription, ...] = (
    SensorEntityDescription(
        key="total_items",
        name="Total items",
        icon="mdi:fridge",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="items",
    ),
    SensorEntityDescription(
        key="oldest_item_days",
        name="Oldest item age",
        icon="mdi:clock-alert-outline",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="days",
    ),
    SensorEntityDescription(
        key="alert_count",
        name="Alert count",
        icon="mdi:alert-circle-outline",
        state_class=SensorStateClass.MEASUREMENT,
    ),
    SensorEntityDescription(
        key="categories",
        name="Categories",
        icon="mdi:tag-multiple-outline",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up FreezerTrack sensors."""
    coordinator = entry.runtime_data.coordinator
    async_add_entities(
        FreezerTrackSensor(coordinator=coordinator, description=desc)
        for desc in SENSOR_DESCRIPTIONS
    )


class FreezerTrackSensor(FreezerTrackEntity, SensorEntity):
    """FreezerTrack sensor."""

    def __init__(
        self,
        coordinator: FreezerTrackCoordinator,
        description: SensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = (
            f"{coordinator.config_entry.entry_id}_{description.key}"
        )

    @property
    def native_value(self) -> int | None:
        if not self.coordinator.data:
            return None
        state = self.coordinator.data.get("state", {})
        key = self.entity_description.key

        if key == "total_items":
            return state.get("total_items", 0)
        if key == "oldest_item_days":
            return state.get("oldest_item_days", 0)
        if key == "alert_count":
            return len(state.get("alerts", []))
        if key == "categories":
            return len(self.coordinator.data.get("categories", []))
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self.coordinator.data:
            return {}
        state = self.coordinator.data.get("state", {})
        key = self.entity_description.key

        if key == "total_items":
            return {
                "items": state.get("items", []),
                "oldest_item_days": state.get("oldest_item_days", 0),
            }
        if key == "alert_count":
            return {"alerts": state.get("alerts", [])}
        if key == "categories":
            cats = self.coordinator.data.get("categories", [])
            return {"category_list": cats}
        return {}
