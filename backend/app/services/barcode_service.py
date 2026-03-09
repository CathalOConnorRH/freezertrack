from datetime import datetime, timezone

import httpx

from app.config import Settings

_cache: dict[str, dict] = {}


async def lookup_barcode(barcode: str, settings: Settings) -> dict:
    cached = _cache.get(barcode)
    if cached:
        age = (datetime.now(timezone.utc) - cached["cached_at"]).total_seconds()
        if age < settings.BARCODE_CACHE_TTL_SECONDS:
            return cached["result"]

    result = await _try_open_food_facts(barcode)
    if result:
        _store(barcode, result)
        return result

    if settings.UPC_ITEM_DB_KEY:
        result = await _try_upc_item_db(barcode)
        if result:
            _store(barcode, result)
            return result

    not_found = {"found": False}
    _store(barcode, not_found)
    return not_found


async def _try_open_food_facts(barcode: str) -> dict | None:
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == 1:
                    product = data.get("product", {})
                    name = product.get("product_name") or product.get(
                        "product_name_en", ""
                    )
                    brand = product.get("brands", "")
                    return {
                        "name": name,
                        "brand": brand,
                        "source": "open_food_facts",
                        "found": True,
                    }
    except httpx.HTTPError:
        pass
    return None


async def _try_upc_item_db(barcode: str) -> dict | None:
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                if items:
                    return {
                        "name": items[0].get("title", ""),
                        "brand": items[0].get("brand", ""),
                        "source": "upc_item_db",
                        "found": True,
                    }
    except httpx.HTTPError:
        pass
    return None


def _store(barcode: str, result: dict) -> None:
    _cache[barcode] = {"result": result, "cached_at": datetime.now(timezone.utc)}


def clear_cache() -> None:
    _cache.clear()
