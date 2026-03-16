"""FreezerTrack integration for Home Assistant."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

import voluptuous as vol
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_loaded_integration

from .api import FreezerTrackApiClient, FreezerTrackApiError
from .const import CONF_URL, DEFAULT_SCAN_INTERVAL, DOMAIN, LOGGER
from .coordinator import FreezerTrackCoordinator
from .data import FreezerTrackData

if TYPE_CHECKING:
    from .data import FreezerTrackConfigEntry

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SELECT,
]

SCAN_BARCODE_SCHEMA = vol.Schema({vol.Required("barcode"): cv.string})
ADD_ITEM_SCHEMA = vol.Schema({
    vol.Required("name"): cv.string,
    vol.Optional("barcode"): cv.string,
    vol.Optional("brand"): cv.string,
    vol.Optional("category"): cv.string,
    vol.Optional("quantity", default=1): vol.Coerce(int),
})
REMOVE_ITEM_SCHEMA = vol.Schema({vol.Required("item_id"): cv.string})


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
) -> bool:
    """Set up FreezerTrack from a config entry."""
    client = FreezerTrackApiClient(
        url=entry.data[CONF_URL],
        session=async_get_clientsession(hass),
    )

    coordinator = FreezerTrackCoordinator(
        hass=hass,
        logger=LOGGER,
        name=DOMAIN,
        update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
    )

    entry.runtime_data = FreezerTrackData(
        client=client,
        coordinator=coordinator,
        integration=async_get_loaded_integration(hass, entry.domain),
    )

    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))

    _register_services(hass, client, coordinator)

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


def _register_services(
    hass: HomeAssistant,
    client: FreezerTrackApiClient,
    coordinator: FreezerTrackCoordinator,
) -> None:
    """Register domain services once."""
    if hass.services.has_service(DOMAIN, "scan_barcode"):
        return

    async def handle_scan_barcode(call: ServiceCall) -> None:
        barcode = call.data["barcode"]
        mode = coordinator.data.get("scanner_mode", "out") if coordinator.data else "out"

        try:
            if mode == "in":
                lookup = await client.async_lookup_barcode(barcode)
                name = lookup.get("name", barcode) if lookup.get("found") else barcode
                brand = lookup.get("brand") if lookup.get("found") else None
                result = await client.async_create_item(
                    name=name, barcode=barcode, brand=brand
                )
                count = result.get("count", 1)
                msg = f"Scanned in: {name} (x{count})"
            else:
                items = await client.async_get_items_by_barcode(barcode)
                if not items:
                    lookup = await client.async_lookup_barcode(barcode)
                    search_name = (
                        lookup.get("name", barcode) if lookup.get("found") else barcode
                    )
                    items = await client.async_search_items(search_name)

                if not items:
                    msg = f"No items found for barcode {barcode}"
                    LOGGER.warning(msg)
                    hass.components.persistent_notification.async_create(
                        msg, title="FreezerTrack Scan"
                    )
                    return

                oldest = min(items, key=lambda i: i.get("frozen_date", ""))
                await client.async_remove_item(oldest["id"])
                msg = f"Scanned out: {oldest['name']}"

            LOGGER.info(msg)
            hass.components.persistent_notification.async_create(
                msg, title="FreezerTrack Scan"
            )
            await coordinator.async_request_refresh()
        except FreezerTrackApiError as exc:
            LOGGER.error("Scan barcode failed: %s", exc)
            hass.components.persistent_notification.async_create(
                f"Scan failed: {exc}", title="FreezerTrack Scan"
            )

    async def handle_add_item(call: ServiceCall) -> None:
        try:
            result = await client.async_create_item(
                name=call.data["name"],
                barcode=call.data.get("barcode"),
                brand=call.data.get("brand"),
                category=call.data.get("category"),
                quantity=call.data.get("quantity", 1),
            )
            LOGGER.info("Added item: %s (x%s)", call.data["name"], result.get("count", 1))
            await coordinator.async_request_refresh()
        except FreezerTrackApiError as exc:
            LOGGER.error("Add item failed: %s", exc)

    async def handle_remove_item(call: ServiceCall) -> None:
        try:
            await client.async_remove_item(call.data["item_id"])
            LOGGER.info("Removed item: %s", call.data["item_id"])
            await coordinator.async_request_refresh()
        except FreezerTrackApiError as exc:
            LOGGER.error("Remove item failed: %s", exc)

    hass.services.async_register(
        DOMAIN, "scan_barcode", handle_scan_barcode, schema=SCAN_BARCODE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, "add_item", handle_add_item, schema=ADD_ITEM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, "remove_item", handle_remove_item, schema=REMOVE_ITEM_SCHEMA
    )
