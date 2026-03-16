from datetime import date, datetime, timezone


def test_list_shopping_empty(client):
    resp = client.get("/api/shopping")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_shopping_item(client):
    resp = client.post("/api/shopping", json={"name": "Frozen Peas"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Frozen Peas"
    assert data["quantity"] == 1
    assert data["completed_at"] is None


def test_add_shopping_item_with_brand_and_quantity(client):
    resp = client.post(
        "/api/shopping",
        json={"name": "Fish Fingers", "brand": "Birds Eye", "quantity": 3},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["brand"] == "Birds Eye"
    assert data["quantity"] == 3


def test_list_shopping_excludes_completed(client):
    resp = client.post("/api/shopping", json={"name": "Active Item"})
    item_id = resp.json()["id"]

    client.post("/api/shopping", json={"name": "Another Active"})

    client.post(f"/api/shopping/{item_id}/complete")

    items = client.get("/api/shopping").json()
    assert len(items) == 1
    assert items[0]["name"] == "Another Active"


def test_complete_shopping_item(client):
    resp = client.post("/api/shopping", json={"name": "Milk"})
    item_id = resp.json()["id"]

    complete_resp = client.post(f"/api/shopping/{item_id}/complete")
    assert complete_resp.status_code == 200
    assert complete_resp.json()["completed_at"] is not None


def test_complete_nonexistent_returns_404(client):
    resp = client.post("/api/shopping/nonexistent/complete")
    assert resp.status_code == 404


def test_delete_shopping_item(client):
    resp = client.post("/api/shopping", json={"name": "Bread"})
    item_id = resp.json()["id"]

    del_resp = client.delete(f"/api/shopping/{item_id}")
    assert del_resp.status_code == 204

    items = client.get("/api/shopping").json()
    assert all(i["id"] != item_id for i in items)


def test_delete_nonexistent_returns_404(client):
    resp = client.delete("/api/shopping/nonexistent")
    assert resp.status_code == 404


def test_suggest_returns_removed_items_not_in_stock(client):
    resp = client.post(
        "/api/food",
        json={"name": "Unique Curry", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    # Removing the last item auto-creates a shopping entry; complete it so
    # suggest can re-surface the item.
    shopping = client.get("/api/shopping").json()
    auto_entry = next(s for s in shopping if s["name"] == "Unique Curry")
    client.post(f"/api/shopping/{auto_entry['id']}/complete")

    suggestions = client.post("/api/shopping/suggest").json()
    assert any(s["name"] == "Unique Curry" for s in suggestions)


def test_suggest_excludes_items_still_in_stock(client):
    client.post(
        "/api/food",
        json={"name": "Stocked Item", "frozen_date": str(date.today())},
    )
    resp2 = client.post(
        "/api/food",
        json={"name": "Stocked Item", "frozen_date": str(date.today())},
    )
    item_id = resp2.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    suggestions = client.post("/api/shopping/suggest").json()
    assert not any(s["name"] == "Stocked Item" for s in suggestions)


def test_suggest_excludes_items_already_on_shopping_list(client):
    resp = client.post(
        "/api/food",
        json={"name": "Already Listed", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    client.post("/api/shopping", json={"name": "Already Listed"})

    suggestions = client.post("/api/shopping/suggest").json()
    assert not any(s["name"] == "Already Listed" for s in suggestions)
