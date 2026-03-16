"""Select platform for FreezerTrack scanner mode."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.select import SelectEntity, SelectEntityDescription

from .const import LOGGER
from .entity import FreezerTrackEntity

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import FreezerTrackCoordinator
    from .data import FreezerTrackConfigEntry

OPTIONS_MAP = {"in": "Scan In", "out": "Scan Out"}
REVERSE_MAP = {v: k for k, v in OPTIONS_MAP.items()}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the scanner mode select."""
    async_add_entities([
        FreezerTrackScannerModeSelect(coordinator=entry.runtime_data.coordinator)
    ])


class FreezerTrackScannerModeSelect(FreezerTrackEntity, SelectEntity):
    """Select entity for FreezerTrack scanner mode."""

    entity_description = SelectEntityDescription(
        key="scanner_mode",
        name="Scanner mode",
        icon="mdi:barcode-scan",
    )

    def __init__(self, coordinator: FreezerTrackCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = (
            f"{coordinator.config_entry.entry_id}_scanner_mode"
        )
        self._attr_options = list(OPTIONS_MAP.values())

    @property
    def current_option(self) -> str | None:
        if not self.coordinator.data:
            return None
        mode = self.coordinator.data.get("scanner_mode", "out")
        return OPTIONS_MAP.get(mode, "Scan Out")

    async def async_select_option(self, option: str) -> None:
        api_mode = REVERSE_MAP.get(option, "out")
        client = self.coordinator.config_entry.runtime_data.client
        try:
            await client.async_set_scanner_mode(api_mode)
        except Exception:
            LOGGER.exception("Failed to set scanner mode")
            return
        self.coordinator.data["scanner_mode"] = api_mode
        self.async_write_ha_state()
