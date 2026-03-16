"""API client for FreezerTrack."""

from __future__ import annotations

import socket
from datetime import date
from typing import Any

import aiohttp
import async_timeout


class FreezerTrackApiError(Exception):
    """General API error."""


class FreezerTrackApiConnectionError(FreezerTrackApiError):
    """Connection error."""


def _verify(response: aiohttp.ClientResponse) -> None:
    response.raise_for_status()


class FreezerTrackApiClient:
    """Async wrapper around the FreezerTrack REST API."""

    def __init__(self, url: str, session: aiohttp.ClientSession) -> None:
        self._base = url.rstrip("/")
        self._session = session

    async def _request(
        self,
        method: str,
        path: str,
        data: dict | None = None,
        params: dict | None = None,
    ) -> Any:
        try:
            async with async_timeout.timeout(10):
                resp = await self._session.request(
                    method=method,
                    url=f"{self._base}{path}",
                    json=data,
                    params=params,
                )
                _verify(resp)
                if resp.status == 204:
                    return None
                return await resp.json()
        except TimeoutError as exc:
            raise FreezerTrackApiConnectionError(
                f"Timeout connecting to FreezerTrack: {exc}"
            ) from exc
        except (aiohttp.ClientError, socket.gaierror) as exc:
            raise FreezerTrackApiConnectionError(
                f"Error connecting to FreezerTrack: {exc}"
            ) from exc

    # ── Read endpoints ────────────────────────────────────────────────────

    async def async_health_check(self) -> dict:
        return await self._request("GET", "/health")

    async def async_get_state(self) -> dict:
        return await self._request("GET", "/api/ha/state")

    async def async_get_items(self) -> list[dict]:
        return await self._request("GET", "/api/food")

    async def async_get_categories(self) -> list[str]:
        return await self._request("GET", "/api/food/categories")

    async def async_get_items_by_barcode(self, barcode: str) -> list[dict]:
        return await self._request("GET", f"/api/food/by-barcode/{barcode}")

    async def async_lookup_barcode(self, barcode: str) -> dict:
        return await self._request("GET", f"/api/food/lookup/{barcode}")

    async def async_search_items(self, query: str) -> list[dict]:
        return await self._request("GET", "/api/food/search", params={"q": query})

    async def async_get_scanner_mode(self) -> dict:
        return await self._request("GET", "/api/scanner/mode")

    # ── Write endpoints ───────────────────────────────────────────────────

    async def async_set_scanner_mode(self, mode: str) -> dict:
        return await self._request("PUT", "/api/scanner/mode", data={"mode": mode})

    async def async_create_item(
        self,
        name: str,
        barcode: str | None = None,
        brand: str | None = None,
        category: str | None = None,
        quantity: int = 1,
    ) -> dict:
        payload: dict[str, Any] = {
            "name": name,
            "frozen_date": str(date.today()),
            "quantity": quantity,
            "auto_print": True,
        }
        if barcode:
            payload["barcode"] = barcode
        if brand:
            payload["brand"] = brand
        if category:
            payload["category"] = category
        return await self._request("POST", "/api/food", data=payload)

    async def async_remove_item(self, item_id: str) -> dict:
        return await self._request("POST", f"/api/food/{item_id}/remove")
