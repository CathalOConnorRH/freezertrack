from datetime import datetime, timezone

import httpx

from app.config import Settings
from app.database import SessionLocal
from app.models.food import BarcodeCache

_mem_cache: dict[str, dict] = {}


async def lookup_barcode(barcode: str, settings: Settings) -> dict:
    mem = _mem_cache.get(barcode)
    if mem:
        age = (datetime.now(timezone.utc) - mem["cached_at"]).total_seconds()
        if age < settings.BARCODE_CACHE_TTL_SECONDS:
            return mem["result"]

    db_result = _check_db_cache(barcode, settings.BARCODE_CACHE_TTL_SECONDS)
    if db_result is not None:
        _mem_store(barcode, db_result)
        return db_result

    result = await _try_open_food_facts(barcode)
    if result:
        _store(barcode, result)
        return result

    result = await _try_upc_item_db(barcode, settings.UPC_ITEM_DB_KEY)
    if result:
        _store(barcode, result)
        return result

    if settings.BARCODE_LOOKUP_API_KEY:
        result = await _try_barcode_lookup(barcode, settings.BARCODE_LOOKUP_API_KEY)
        if result:
            _store(barcode, result)
            return result

    not_found = {"found": False}
    _store(barcode, not_found)
    return not_found


def _check_db_cache(barcode: str, ttl: int) -> dict | None:
    try:
        db = SessionLocal()
        try:
            entry = db.query(BarcodeCache).filter(BarcodeCache.barcode == barcode).first()
            if entry:
                age = (datetime.now(timezone.utc) - entry.cached_at).total_seconds()
                if age < ttl:
                    if not entry.found:
                        return {"found": False}
                    return {
                        "name": entry.name,
                        "brand": entry.brand or "",
                        "source": entry.source,
                        "found": True,
                    }
        finally:
            db.close()
    except Exception:
        pass
    return None


def _save_to_db(barcode: str, result: dict) -> None:
    try:
        db = SessionLocal()
        try:
            existing = db.query(BarcodeCache).filter(BarcodeCache.barcode == barcode).first()
            if existing:
                existing.name = result.get("name", "")
                existing.brand = result.get("brand", "")
                existing.source = result.get("source", "")
                existing.found = result.get("found", False)
                existing.cached_at = datetime.now(timezone.utc)
            else:
                entry = BarcodeCache(
                    barcode=barcode,
                    name=result.get("name", ""),
                    brand=result.get("brand", ""),
                    source=result.get("source", ""),
                    found=result.get("found", False),
                    cached_at=datetime.now(timezone.utc),
                )
                db.add(entry)
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


async def _try_open_food_facts(barcode: str) -> dict | None:
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
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
    except (httpx.HTTPError, TimeoutError):
        pass
    return None


async def _try_upc_item_db(barcode: str, api_key: str = "") -> dict | None:
    if api_key:
        url = f"https://api.upcitemdb.com/prod/v1/lookup?upc={barcode}"
        headers = {"Accept": "application/json", "user_key": api_key, "key_type": "3scale"}
    else:
        url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
        headers = {"Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
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
    except (httpx.HTTPError, TimeoutError):
        pass
    return None


async def _try_barcode_lookup(barcode: str, api_key: str) -> dict | None:
    url = f"https://api.barcodelookup.com/v3/products?barcode={barcode}&key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                products = data.get("products", [])
                if products:
                    return {
                        "name": products[0].get("title", ""),
                        "brand": products[0].get("brand", ""),
                        "source": "barcode_lookup",
                        "found": True,
                    }
    except (httpx.HTTPError, TimeoutError):
        pass
    return None


def _mem_store(barcode: str, result: dict) -> None:
    _mem_cache[barcode] = {"result": result, "cached_at": datetime.now(timezone.utc)}


def _store(barcode: str, result: dict) -> None:
    _mem_store(barcode, result)
    _save_to_db(barcode, result)


def clear_mem_cache_entry(barcode: str) -> None:
    _mem_cache.pop(barcode, None)


def store_in_mem_cache(barcode: str, result: dict) -> None:
    _mem_store(barcode, result)


def clear_cache() -> None:
    _mem_cache.clear()
    try:
        db = SessionLocal()
        try:
            db.query(BarcodeCache).delete()
            db.commit()
        finally:
            db.close()
    except Exception:
        pass
