"""DataUpdateCoordinator for FreezerTrack."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import FreezerTrackApiError
from .const import LOGGER

if TYPE_CHECKING:
    from .data import FreezerTrackConfigEntry


class FreezerTrackCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetches state from FreezerTrack API for all entities."""

    config_entry: FreezerTrackConfigEntry

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            client = self.config_entry.runtime_data.client
            state = await client.async_get_state()
            categories = await client.async_get_categories()
            mode_data = await client.async_get_scanner_mode()
        except FreezerTrackApiError as exc:
            raise UpdateFailed(f"Error fetching FreezerTrack data: {exc}") from exc

        return {
            "state": state,
            "categories": categories,
            "scanner_mode": mode_data.get("mode", "out"),
        }
