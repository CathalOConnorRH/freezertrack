from datetime import date, timedelta

from app.config import settings


def test_ha_scan_in_creates_item(client):
    resp = client.post("/api/ha/scan-in", json={"name": "Peas", "quantity": 2})
    assert resp.status_code == 201
    data = resp.json()
    assert data["item"]["name"] == "Peas"
    assert data["item"]["quantity"] == 2
    assert data["item"]["frozen_date"] == str(date.today())
    assert data["state"]["total_items"] == 1


def test_ha_scan_in_with_all_fields(client):
    payload = {
        "name": "Salmon Fillet",
        "quantity": 3,
        "brand": "FishCo",
        "category": "Fish",
        "frozen_date": "2025-06-01",
        "notes": "wild caught",
    }
    resp = client.post("/api/ha/scan-in", json=payload)
    assert resp.status_code == 201
    item = resp.json()["item"]
    assert item["name"] == "Salmon Fillet"
    assert item["brand"] == "FishCo"
    assert item["category"] == "Fish"
    assert item["frozen_date"] == "2025-06-01"
    assert item["quantity"] == 3
    assert item["shelf_life_days"] == 90  # from SHELF_LIFE_MAP["fish"]
    assert item["notes"] == "wild caught"


def test_ha_scan_in_defaults_frozen_date_to_today(client):
    resp = client.post("/api/ha/scan-in", json={"name": "Mince"})
    assert resp.status_code == 201
    assert resp.json()["item"]["frozen_date"] == str(date.today())


def test_ha_scan_in_appears_in_ha_state(client):
    client.post("/api/ha/scan-in", json={"name": "Chicken", "quantity": 1})
    client.post("/api/ha/scan-in", json={"name": "Beef", "quantity": 2})

    state = client.get("/api/ha/state").json()
    assert state["total_items"] == 2
    names = [i["name"] for i in state["items"]]
    assert "Chicken" in names
    assert "Beef" in names


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
