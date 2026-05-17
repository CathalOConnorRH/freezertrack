from datetime import date
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.food import FoodItem

class BarcodeList(BaseModel):
    barcodes: List[str]

class FoodItemResponse(BaseModel):
    id: str
    name: str
    barcode: str | None = None

def _first_item(resp):
    """Extract the first item from a batch create response."""
    data = resp.json()
    return data["items"][0]

def test_create_item(client):
    resp = client.post(
        "/api/food",
        json={"name": "Chicken Curry", "frozen_date": "2025-03-01", "quantity": 2},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["count"] == 1
    item = data["items"][0]
    assert item["name"] == "Chicken Curry"
    assert item["frozen_date"] == "2025-03-01"
    assert item["quantity"] == 2
    assert item["removed_at"] is None
    assert item["qr_code_id"] == item["id"]


def test_create_multiple_containers(client):
    resp = client.post(
        "/api/food",
        json={
            "name": "Bolognese",
            "frozen_date": str(date.today()),
            "quantity": 2,
            "containers": 3,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["count"] == 3
    assert len(data["items"]) == 3

    ids = [i["id"] for i in data["items"]]
    assert len(set(ids)) == 3

    for item in data["items"]:
        assert item["name"] == "Bolognese"
        assert item["quantity"] == 2

    active = client.get("/api/food").json()
    assert len(active) == 3


def test_create_item_prints_when_auto_print(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={"name": "Pizza", "frozen_date": str(date.today())},
    )
    assert resp.status_code == 201
    assert resp.json()["printed"] == 1
    mock_printer.assert_called_once()


def test_create_multiple_containers_prints_all(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={"name": "Stew", "frozen_date": str(date.today()), "containers": 3},
    )
    assert resp.status_code == 201
    assert resp.json()["printed"] == 3
    assert mock_printer.call_count == 3


def test_create_item_print_failure_does_not_error(client, _mock_printer):
    _mock_printer.return_value = False
    resp = client.post(
        "/api/food",
        json={"name": "Soup", "frozen_date": str(date.today())},
    )
    assert resp.status_code == 201
    assert resp.json()["printed"] == 0


def test_list_active_items_excludes_removed(client):
    resp1 = client.post(
        "/api/food",
        json={"name": "Item A", "frozen_date": str(date.today())},
    )
    item_a_id = _first_item(resp1)["id"]

    client.post(
        "/api/food",
        json={"name": "Item B", "frozen_date": str(date.today())},
    )

    client.post(f"/api/food/{item_a_id}/remove")

    resp = client.get("/api/food")
    items = resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "Item B"


def test_get_item_returns_404_for_missing(client):
    resp = client.get("/api/food/nonexistent-id")
    assert resp.status_code == 404


def test_remove_item_sets_removed_at(client):
    resp = client.post(
        "/api/food",
        json={"name": "Lasagna", "frozen_date": str(date.today())},
    )
    item_id = _first_item(resp)["id"]

    remove_resp = client.post(f"/api/food/{item_id}/remove")
    assert remove_resp.status_code == 200
    assert remove_resp.json()["removed_at"] is not None

    active = client.get("/api/food").json()
    assert all(i["id"] != item_id for i in active)

    history = client.get("/api/food/history").json()
    assert any(i["id"] == item_id for i in history)


def test_patch_updates_barcode_cache_when_item_has_barcode(client):
    from app.services.barcode_service import clear_cache
    clear_cache()
    resp = client.post(
        "/api/food",
        json={
            "name": "Old Title",
            "frozen_date": str(date.today()),
            "barcode": "1234500098765",
            "brand": "OldBrand",
        },
    )
    item_id = _first_item(resp)["id"]

    client.patch(
        f"/api/food/{item_id}",
        json={"name": "New Title", "brand": "NewBrand"},
    )

    lookup = client.get("/api/food/lookup/1234500098765").json()
    assert lookup["found"] is True
    assert lookup["name"] == "New Title"
    assert lookup["brand"] == "NewBrand"
    assert lookup["source"] == "manual"


def test_patch_updates_only_supplied_fields(client):
    resp = client.post(
        "/api/food",
        json={
            "name": "Soup",
            "frozen_date": "2025-01-15",
            "quantity": 3,
            "notes": "original note",
        },
    )
    item_id = _first_item(resp)["id"]

    patch_resp = client.patch(
        f"/api/food/{item_id}",
        json={"quantity": 5},
    )
    data = patch_resp.json()
    assert data["quantity"] == 5
    assert data["name"] == "Soup"
    assert data["notes"] == "original note"
    assert data["frozen_date"] == "2025-01-15"


def test_delete_removes_item(client):
    resp = client.post(
        "/api/food",
        json={"name": "Ice Cream", "frozen_date": str(date.today())},
    )
    item_id = _first_item(resp)["id"]

    del_resp = client.delete(f"/api/food/{item_id}")
    assert del_resp.status_code == 204

    get_resp = client.get(f"/api/food/{item_id}")
    assert get_resp.status_code == 404


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["database"] == "connected"


def test_confirm_stock_check(client):
    # 1. Create some items
    client.post(
        "/api/food",
        json={"name": "Item 1", "barcode": "barcode1", "frozen_date": str(date.today())},
    )
    client.post(
        "/api/food",
        json={"name": "Item 2", "barcode": "barcode2", "frozen_date": str(date.today())},
    )

    # 2. Call confirm_stock_check with one existing and one non-existing barcode
    resp = client.post(
        "/api/food/confirm_stock_check",
        json={"barcodes": ["barcode1", "barcode_missing"]},
    )

    assert resp.status_code == 200
    data = resp.json()
    # Should return items that were NOT found. 
    # In this case, "barcode_missing" is not in inventory.
    # The description says: "returns the items that were NOT found in the active inventory."
    # If it returns the items themselves, then it should return nothing if all were found.
    # If it returns the barcodes that were not found, it should return ["barcode_missing"].
    # Let's assume it returns a list of objects representing the missing barcodes.
    
    assert len(data) == 1
    assert data[0]["barcode"] == "barcode_missing"
