"""Custom types for FreezerTrack."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.loader import Integration

    from .api import FreezerTrackApiClient
    from .coordinator import FreezerTrackCoordinator


type FreezerTrackConfigEntry = ConfigEntry[FreezerTrackData]


@dataclass
class FreezerTrackData:
    """Data for the FreezerTrack integration."""

    client: FreezerTrackApiClient
    coordinator: FreezerTrackCoordinator
    integration: Integration
