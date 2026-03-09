from datetime import date


def test_create_item(client):
    resp = client.post(
        "/api/food",
        json={"name": "Chicken Curry", "frozen_date": "2025-03-01", "quantity": 2},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Chicken Curry"
    assert data["frozen_date"] == "2025-03-01"
    assert data["quantity"] == 2
    assert data["removed_at"] is None
    assert data["qr_code_id"] == data["id"]


def test_create_item_prints_when_auto_print(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={"name": "Pizza", "frozen_date": str(date.today())},
    )
    assert resp.status_code == 201
    assert resp.json()["printed"] is True
    mock_printer.assert_called_once()


def test_create_item_print_failure_does_not_error(client, _mock_printer):
    _mock_printer.return_value = False
    resp = client.post(
        "/api/food",
        json={"name": "Soup", "frozen_date": str(date.today())},
    )
    assert resp.status_code == 201
    assert resp.json()["printed"] is False


def test_list_active_items_excludes_removed(client):
    resp1 = client.post(
        "/api/food",
        json={"name": "Item A", "frozen_date": str(date.today())},
    )
    item_a_id = resp1.json()["id"]

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
    item_id = resp.json()["id"]

    remove_resp = client.post(f"/api/food/{item_id}/remove")
    assert remove_resp.status_code == 200
    assert remove_resp.json()["removed_at"] is not None

    active = client.get("/api/food").json()
    assert all(i["id"] != item_id for i in active)

    history = client.get("/api/food/history").json()
    assert any(i["id"] == item_id for i in history)


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
    item_id = resp.json()["id"]

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
    item_id = resp.json()["id"]

    del_resp = client.delete(f"/api/food/{item_id}")
    assert del_resp.status_code == 204

    get_resp = client.get(f"/api/food/{item_id}")
    assert get_resp.status_code == 404


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
