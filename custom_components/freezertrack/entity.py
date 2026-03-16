"""Base entity for FreezerTrack."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN
from .coordinator import FreezerTrackCoordinator


class FreezerTrackEntity(CoordinatorEntity[FreezerTrackCoordinator]):
    """Base class for FreezerTrack entities."""

    _attr_attribution = ATTRIBUTION
    _attr_has_entity_name = True

    def __init__(self, coordinator: FreezerTrackCoordinator) -> None:
        """Initialise the entity."""
        super().__init__(coordinator)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.config_entry.entry_id)},
            name="FreezerTrack",
            manufacturer="FreezerTrack",
            configuration_url=coordinator.config_entry.data.get("url"),
        )
