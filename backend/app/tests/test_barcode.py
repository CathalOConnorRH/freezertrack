from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.services.barcode_service import clear_cache, lookup_barcode


@pytest.fixture(autouse=True)
def _clear_barcode_cache():
    clear_cache()
    yield
    clear_cache()


def _settings(**overrides):
    defaults = {
        "DATABASE_URL": "sqlite://",
        "NIIMBOT_MAC": "AA:BB:CC:DD:EE:FF",
        "SECRET_KEY": "test",
        "UPC_ITEM_DB_KEY": "",
        "BARCODE_CACHE_TTL_SECONDS": 86400,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _make_response(status_code, json_data):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    return resp


@pytest.mark.asyncio
async def test_open_food_facts_success():
    mock_response = _make_response(200, {
        "status": 1,
        "product": {"product_name": "Heinz Beans", "brands": "Heinz"},
    })

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response

    with patch("app.services.barcode_service.httpx.AsyncClient") as cls:
        cls.return_value.__aenter__.return_value = mock_client
        cls.return_value.__aexit__.return_value = False

        result = await lookup_barcode("5000159484695", _settings())
        assert result["found"] is True
        assert result["name"] == "Heinz Beans"
        assert result["brand"] == "Heinz"
        assert result["source"] == "open_food_facts"


@pytest.mark.asyncio
async def test_fallback_to_upc_item_db():
    off_resp = _make_response(200, {"status": 0})
    upc_resp = _make_response(200, {
        "items": [{"title": "Test Product", "brand": "TestBrand"}]
    })

    async def mock_get(url, **kwargs):
        if "openfoodfacts" in url:
            return off_resp
        return upc_resp

    mock_client = AsyncMock()
    mock_client.get = mock_get

    with patch("app.services.barcode_service.httpx.AsyncClient") as cls:
        cls.return_value.__aenter__.return_value = mock_client
        cls.return_value.__aexit__.return_value = False

        result = await lookup_barcode("123456", _settings(UPC_ITEM_DB_KEY="testkey"))
        assert result["found"] is True
        assert result["name"] == "Test Product"
        assert result["source"] == "upc_item_db"


@pytest.mark.asyncio
async def test_both_fail_returns_not_found():
    fail_resp = _make_response(200, {"status": 0})
    mock_client = AsyncMock()
    mock_client.get.return_value = fail_resp

    with patch("app.services.barcode_service.httpx.AsyncClient") as cls:
        cls.return_value.__aenter__.return_value = mock_client
        cls.return_value.__aexit__.return_value = False

        result = await lookup_barcode("000000", _settings())
        assert result["found"] is False


@pytest.mark.asyncio
async def test_cache_hit_avoids_second_request():
    mock_response = _make_response(200, {
        "status": 1,
        "product": {"product_name": "Cached Item", "brands": "Brand"},
    })
    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response

    with patch("app.services.barcode_service.httpx.AsyncClient") as cls:
        cls.return_value.__aenter__.return_value = mock_client
        cls.return_value.__aexit__.return_value = False

        result1 = await lookup_barcode("999999", _settings())
        assert result1["found"] is True

        mock_client.get.reset_mock()
        result2 = await lookup_barcode("999999", _settings())
        assert result2["found"] is True
        assert result2["name"] == "Cached Item"
        mock_client.get.assert_not_called()
