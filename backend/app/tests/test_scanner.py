from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.barcode_service import clear_cache


def test_get_scanner_mode_default(client):
    resp = client.get("/api/scanner/mode")
    assert resp.status_code == 200
    assert resp.json()["mode"] == "out"


def test_set_scanner_mode_in(client):
    resp = client.put("/api/scanner/mode", json={"mode": "in"})
    assert resp.status_code == 200
    assert resp.json()["mode"] == "in"

    resp = client.get("/api/scanner/mode")
    assert resp.json()["mode"] == "in"


def test_set_scanner_mode_out(client):
    client.put("/api/scanner/mode", json={"mode": "in"})
    resp = client.put("/api/scanner/mode", json={"mode": "out"})
    assert resp.status_code == 200
    assert resp.json()["mode"] == "out"


def test_set_scanner_mode_invalid(client):
    resp = client.put("/api/scanner/mode", json={"mode": "invalid"})
    assert resp.status_code == 400


def test_auto_categorise_assigns_categories(client):
    client.post("/api/food", json={"name": "Cod Fish Fingers", "frozen_date": str(date.today())})
    client.post("/api/food", json={"name": "Chicken Kiev", "frozen_date": str(date.today())})
    client.post("/api/food", json={"name": "Brioche Buns", "frozen_date": str(date.today())})
    client.post("/api/food", json={"name": "Mystery Item", "frozen_date": str(date.today())})

    resp = client.post("/api/scanner/auto-categorise")
    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 3

    categorised = {i["name"]: i["category"] for i in data["items"]}
    assert categorised["Cod Fish Fingers"] == "Fish"
    assert categorised["Chicken Kiev"] == "Poultry"
    assert categorised["Brioche Buns"] == "Bread"
    assert "Mystery Item" not in categorised


def test_auto_categorise_skips_already_categorised(client):
    client.post("/api/food", json={
        "name": "Salmon Fillet", "frozen_date": str(date.today()), "category": "Fish",
    })
    resp = client.post("/api/scanner/auto-categorise")
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0


def test_save_barcode_mapping(client):
    clear_cache()
    resp = client.post("/api/food/barcode", json={
        "barcode": "9999999999999",
        "name": "Manual Beans",
        "brand": "TestBrand",
    })
    assert resp.status_code == 200
    assert resp.json()["saved"] is True

    lookup = client.get("/api/food/lookup/9999999999999")
    data = lookup.json()
    assert data["found"] is True
    assert data["name"] == "Manual Beans"
    assert data["brand"] == "TestBrand"
    assert data["source"] == "manual"
    clear_cache()


def test_save_barcode_mapping_upsert(client):
    clear_cache()
    client.post("/api/food/barcode", json={
        "barcode": "8888888888888",
        "name": "Old Name",
    })
    client.post("/api/food/barcode", json={
        "barcode": "8888888888888",
        "name": "New Name",
        "brand": "NewBrand",
    })

    lookup = client.get("/api/food/lookup/8888888888888")
    data = lookup.json()
    assert data["name"] == "New Name"
    assert data["brand"] == "NewBrand"
    clear_cache()


def test_decrement_reduces_quantity(client):
    resp = client.post("/api/food", json={
        "name": "Multi Serving", "frozen_date": str(date.today()), "quantity": 3,
    })
    item_id = resp.json()["items"][0]["id"]

    dec = client.post(f"/api/food/{item_id}/decrement")
    assert dec.status_code == 200
    assert dec.json()["remaining"] == 2
    assert dec.json()["removed"] is False


def test_decrement_last_serving_removes(client):
    resp = client.post("/api/food", json={
        "name": "Single", "frozen_date": str(date.today()), "quantity": 1,
    })
    item_id = resp.json()["items"][0]["id"]

    dec = client.post(f"/api/food/{item_id}/decrement")
    assert dec.status_code == 200
    assert dec.json()["removed"] is True

    active = client.get("/api/food").json()
    assert all(i["id"] != item_id for i in active)


def test_readd_item_creates_new(client):
    resp = client.post("/api/food", json={
        "name": "Stew", "frozen_date": "2025-01-01", "quantity": 2,
    })
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    readd = client.post(f"/api/food/{item_id}/readd")
    assert readd.status_code == 200
    new_item = readd.json()
    assert new_item["name"] == "Stew"
    assert new_item["quantity"] == 2
    assert new_item["id"] != item_id
    assert new_item["frozen_date"] == str(date.today())


def test_remove_last_item_creates_shopping_entry(client):
    resp = client.post("/api/food", json={
        "name": "Unique Fish", "frozen_date": str(date.today()),
    })
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    shopping = client.get("/api/shopping").json()
    assert any(s["name"] == "Unique Fish" for s in shopping)
