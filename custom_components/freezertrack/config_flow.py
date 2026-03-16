"""Config flow for FreezerTrack."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_create_clientsession

from .api import FreezerTrackApiClient, FreezerTrackApiConnectionError, FreezerTrackApiError
from .const import CONF_URL, DOMAIN, LOGGER


class FreezerTrackFlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for FreezerTrack."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Handle initial setup step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            try:
                client = FreezerTrackApiClient(
                    url=url,
                    session=async_create_clientsession(self.hass),
                )
                await client.async_health_check()
            except FreezerTrackApiConnectionError as exc:
                LOGGER.warning("Connection failed: %s", exc)
                errors["base"] = "cannot_connect"
            except FreezerTrackApiError as exc:
                LOGGER.exception("Unexpected error: %s", exc)
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(url)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="FreezerTrack",
                    data={CONF_URL: url},
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_URL,
                        default=(user_input or {}).get(CONF_URL, "http://"),
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(type=selector.TextSelectorType.URL),
                    ),
                },
            ),
            errors=errors,
        )
