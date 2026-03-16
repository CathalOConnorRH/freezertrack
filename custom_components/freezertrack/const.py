"""Constants for FreezerTrack."""

from logging import Logger, getLogger

LOGGER: Logger = getLogger(__package__)

DOMAIN = "freezertrack"
CONF_URL = "url"
DEFAULT_SCAN_INTERVAL = 300
ATTRIBUTION = "Data provided by FreezerTrack"
