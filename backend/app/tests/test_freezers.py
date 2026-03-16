from datetime import date


def test_list_freezers_empty(client):
    resp = client.get("/api/freezers")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_freezer(client):
    resp = client.post(
        "/api/freezers",
        json={"name": "Garage Freezer", "location": "Garage"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Garage Freezer"
    assert data["location"] == "Garage"
    assert "id" in data


def test_create_freezer_without_location(client):
    resp = client.post("/api/freezers", json={"name": "Kitchen"})
    assert resp.status_code == 201
    assert resp.json()["location"] is None


def test_list_freezers_includes_item_count(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Main"}
    ).json()

    client.post(
        "/api/food",
        json={
            "name": "Chicken",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )
    client.post(
        "/api/food",
        json={
            "name": "Beef",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )

    freezers = client.get("/api/freezers").json()
    assert len(freezers) == 1
    assert freezers[0]["item_count"] == 2


def test_list_freezers_item_count_excludes_removed(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Basement"}
    ).json()

    resp = client.post(
        "/api/food",
        json={
            "name": "Removed Item",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    freezers = client.get("/api/freezers").json()
    assert freezers[0]["item_count"] == 0


def test_update_freezer(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Old Name"}
    ).json()

    resp = client.patch(
        f"/api/freezers/{freezer['id']}",
        json={"name": "New Name", "location": "Utility Room"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["location"] == "Utility Room"


def test_update_freezer_partial(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Original", "location": "Kitchen"}
    ).json()

    resp = client.patch(
        f"/api/freezers/{freezer['id']}",
        json={"location": "Pantry"},
    )
    assert resp.json()["name"] == "Original"
    assert resp.json()["location"] == "Pantry"


def test_update_nonexistent_returns_404(client):
    resp = client.patch(
        "/api/freezers/nonexistent", json={"name": "Nope"}
    )
    assert resp.status_code == 404


def test_delete_empty_freezer(client):
    freezer = client.post(
        "/api/freezers", json={"name": "To Delete"}
    ).json()

    resp = client.delete(f"/api/freezers/{freezer['id']}")
    assert resp.status_code == 204

    freezers = client.get("/api/freezers").json()
    assert len(freezers) == 0


def test_delete_freezer_with_active_items_blocked(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Full Freezer"}
    ).json()

    client.post(
        "/api/food",
        json={
            "name": "Salmon",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )

    resp = client.delete(f"/api/freezers/{freezer['id']}")
    assert resp.status_code == 400
    assert "active items" in resp.json()["detail"].lower()


def test_delete_freezer_with_only_removed_items_allowed(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Cleared Freezer"}
    ).json()

    resp = client.post(
        "/api/food",
        json={
            "name": "Old Fish",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    resp = client.delete(f"/api/freezers/{freezer['id']}")
    assert resp.status_code == 204


def test_delete_nonexistent_returns_404(client):
    resp = client.delete("/api/freezers/nonexistent")
    assert resp.status_code == 404
