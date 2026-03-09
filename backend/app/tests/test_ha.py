from datetime import date, timedelta

from app.config import settings


def test_ha_state_counts_active_items(client):
    client.post("/api/food", json={"name": "Fresh", "frozen_date": str(date.today() - timedelta(days=7))})
    client.post("/api/food", json={"name": "Old", "frozen_date": str(date.today() - timedelta(days=100))})
    resp3 = client.post("/api/food", json={"name": "Removed", "frozen_date": str(date.today())})
    client.post(f"/api/food/{resp3.json()['id']}/remove")

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
