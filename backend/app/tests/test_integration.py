from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.config import settings


def _first_item(resp):
    return resp.json()["items"][0]


def test_full_happy_path(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={"name": "Chicken Curry", "frozen_date": str(date.today()), "quantity": 2},
    )
    assert resp.status_code == 201
    data = resp.json()
    item_id = data["items"][0]["id"]
    assert data["printed"] == 1
    mock_printer.assert_called_once()

    items = client.get("/api/food").json()
    assert any(i["id"] == item_id for i in items)

    preview = client.get(f"/api/labels/{item_id}/preview")
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"

    remove_resp = client.post(f"/api/food/{item_id}/remove")
    assert remove_resp.status_code == 200

    active = client.get("/api/food").json()
    assert all(i["id"] != item_id for i in active)

    history = client.get("/api/food/history").json()
    assert any(i["id"] == item_id for i in history)


def test_barcode_lookup_and_create(client):
    off_response = MagicMock()
    off_response.status_code = 200
    off_response.json.return_value = {
        "status": 1,
        "product": {"product_name": "Heinz Baked Beans", "brands": "Heinz"},
    }

    mock_client = AsyncMock()
    mock_client.get.return_value = off_response

    with patch("app.services.barcode_service.httpx.AsyncClient") as cls:
        cls.return_value.__aenter__.return_value = mock_client
        cls.return_value.__aexit__.return_value = False

        lookup = client.get("/api/food/lookup/5000159484695")
        assert lookup.status_code == 200
        data = lookup.json()
        assert data["found"] is True
        assert data["name"] == "Heinz Baked Beans"
        assert data["brand"] == "Heinz"

    resp = client.post(
        "/api/food",
        json={"name": data["name"], "frozen_date": str(date.today()), "quantity": 1},
    )
    assert resp.status_code == 201

    items = client.get("/api/food").json()
    assert any(i["name"] == "Heinz Baked Beans" for i in items)


def test_old_item_alerts(client, monkeypatch):
    monkeypatch.setattr(settings, "ALERT_DAYS_FROZEN", 90)
    old_date = str(date.today() - timedelta(days=100))

    for i in range(3):
        client.post(
            "/api/food",
            json={"name": f"Old Item {i}", "frozen_date": old_date, "quantity": 1},
        )

    alerts = client.get("/api/ha/alerts").json()
    old_alerts = [a for a in alerts["alerts"] if a["type"] == "old_item"]
    assert len(old_alerts) == 3


def test_low_stock_alert_after_removals(client, monkeypatch):
    monkeypatch.setattr(settings, "LOW_STOCK_THRESHOLD", 5)

    ids = []
    for i in range(4):
        resp = client.post(
            "/api/food",
            json={"name": f"Item {i}", "frozen_date": str(date.today())},
        )
        ids.append(_first_item(resp)["id"])

    for item_id in ids[:2]:
        client.post(f"/api/food/{item_id}/remove")

    alerts = client.get("/api/ha/alerts").json()
    low_stock = [a for a in alerts["alerts"] if a["type"] == "low_stock"]
    assert len(low_stock) == 1
    assert low_stock[0]["current_count"] == 2


def test_batch_create_multiple_containers(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={
            "name": "Curry",
            "frozen_date": str(date.today()),
            "quantity": 2,
            "containers": 5,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["count"] == 5
    assert data["printed"] == 5
    assert mock_printer.call_count == 5

    items = client.get("/api/food").json()
    curry_items = [i for i in items if i["name"] == "Curry"]
    assert len(curry_items) == 5
    assert all(i["quantity"] == 2 for i in curry_items)
