from datetime import date, timedelta

from app.config import settings


def test_ha_state_item_fields(client):
    frozen_date = date.today() - timedelta(days=10)
    client.post("/api/food", json={
        "name": "Chicken",
        "brand": "Tesco",
        "category": "Poultry",
        "frozen_date": str(frozen_date),
        "quantity": 2,
        "shelf_life_days": 180,
        "notes": "Marinated",
    })

    state = client.get("/api/ha/state").json()
    assert state["total_items"] == 1
    item = state["items"][0]
    assert item["name"] == "Chicken"
    assert item["brand"] == "Tesco"
    assert item["category"] == "Poultry"
    assert item["quantity"] == 2
    assert item["days_frozen"] == 10
    assert item["notes"] == "Marinated"
    expected_expiry = str(frozen_date + timedelta(days=180))
    assert item["expiration_date"] == expected_expiry


def test_ha_state_expiration_date_none_when_no_shelf_life(client):
    client.post("/api/food", json={
        "name": "Mystery Meat",
        "frozen_date": str(date.today()),
    })

    state = client.get("/api/ha/state").json()
    item = state["items"][0]
    assert item["expiration_date"] is None


def test_ha_state_counts_active_items(client):
    client.post("/api/food", json={"name": "Fresh", "frozen_date": str(date.today() - timedelta(days=7))})
    client.post("/api/food", json={"name": "Old", "frozen_date": str(date.today() - timedelta(days=100))})
    resp3 = client.post("/api/food", json={"name": "Removed", "frozen_date": str(date.today())})
    client.post(f"/api/food/{resp3.json()['items'][0]['id']}/remove")

    state = client.get("/api/ha/state").json()
    assert state["total_items"] == 2
    item_names = [i["name"] for i in state["items"]]
    assert "Removed" not in item_names
    assert "Fresh" in item_names
    assert "Old" in item_names


def test_ha_state_has_old_item_alert(client):
    client.post("/api/food", json={"name": "Fresh", "frozen_date": str(date.today() - timedelta(days=7))})
    client.post("/api/food", json={"name": "Old", "frozen_date": str(date.today() - timedelta(days=100))})

    state = client.get("/api/ha/state").json()
    old_alerts = [a for a in state["alerts"] if a["type"] == "old_item"]
    assert len(old_alerts) == 1
    assert old_alerts[0]["name"] == "Old"
    assert old_alerts[0]["days_frozen"] >= 100


def test_low_stock_alert(client, monkeypatch):
    monkeypatch.setattr(settings, "LOW_STOCK_THRESHOLD", 5)
    client.post("/api/food", json={"name": "Item1", "frozen_date": str(date.today())})
    client.post("/api/food", json={"name": "Item2", "frozen_date": str(date.today())})

    alerts_resp = client.get("/api/ha/alerts").json()
    low_stock = [a for a in alerts_resp["alerts"] if a["type"] == "low_stock"]
    assert len(low_stock) == 1
    assert low_stock[0]["current_count"] == 2
    assert low_stock[0]["threshold"] == 5


def test_boundary_exactly_at_threshold(client, monkeypatch):
    monkeypatch.setattr(settings, "ALERT_DAYS_FROZEN", 90)
    client.post("/api/food", json={"name": "Boundary", "frozen_date": str(date.today() - timedelta(days=90))})

    alerts_resp = client.get("/api/ha/alerts").json()
    old_alerts = [a for a in alerts_resp["alerts"] if a["type"] == "old_item"]
    assert len(old_alerts) == 1
    assert old_alerts[0]["name"] == "Boundary"


def test_boundary_one_below_threshold(client, monkeypatch):
    monkeypatch.setattr(settings, "ALERT_DAYS_FROZEN", 90)
    client.post("/api/food", json={"name": "NotYet", "frozen_date": str(date.today() - timedelta(days=89))})

    alerts_resp = client.get("/api/ha/alerts").json()
    old_alerts = [a for a in alerts_resp["alerts"] if a["type"] == "old_item"]
    assert len(old_alerts) == 0


def test_ha_scan_out_removes_item(client):
    resp = client.post("/api/food", json={"name": "Pizza", "frozen_date": str(date.today())})
    item_id = resp.json()["items"][0]["id"]

    scan_resp = client.post(f"/api/ha/scan-out/{item_id}")
    assert scan_resp.status_code == 200
    data = scan_resp.json()
    assert data["success"] is True
    assert data["item_id"] == item_id
    assert data["name"] == "Pizza"
    assert "removed_at" in data

    state = client.get("/api/ha/state").json()
    assert state["total_items"] == 0


def test_ha_scan_out_not_found(client):
    resp = client.post("/api/ha/scan-out/nonexistent-id")
    assert resp.status_code == 404


def test_ha_scan_out_already_removed(client):
    resp = client.post("/api/food", json={"name": "Soup", "frozen_date": str(date.today())})
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/ha/scan-out/{item_id}")

    resp2 = client.post(f"/api/ha/scan-out/{item_id}")
    assert resp2.status_code == 400


def test_ha_scan_out_adds_to_shopping_list(client):
    resp = client.post("/api/food", json={"name": "Steak", "frozen_date": str(date.today())})
    item_id = resp.json()["items"][0]["id"]

    client.post(f"/api/ha/scan-out/{item_id}")

    shopping = client.get("/api/shopping").json()
    names = [s["name"] for s in shopping]
    assert "Steak" in names
