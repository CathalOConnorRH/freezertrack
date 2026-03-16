import csv
import io
import json
from datetime import date


def test_get_config(client):
    resp = client.get("/api/admin/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "settings" in data
    assert "NIIMBOT_MAC" in data["settings"]


def test_update_config_rejects_non_editable_key(client):
    resp = client.patch(
        "/api/admin/config",
        json={"settings": {"DATABASE_URL": "sqlite:///hacked.db"}},
    )
    assert resp.status_code == 400


def test_export_csv(client):
    client.post(
        "/api/food",
        json={"name": "Export Test", "frozen_date": str(date.today()), "quantity": 2},
    )

    resp = client.get("/api/admin/export/csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    content = resp.text
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    assert rows[0][0] == "id"
    assert rows[0][1] == "name"
    assert len(rows) >= 2
    assert rows[1][1] == "Export Test"


def test_export_csv_active_only(client):
    resp1 = client.post(
        "/api/food",
        json={"name": "Active", "frozen_date": str(date.today())},
    )
    resp2 = client.post(
        "/api/food",
        json={"name": "Removed", "frozen_date": str(date.today())},
    )
    item_id = resp2.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    resp = client.get("/api/admin/export/csv?active_only=true")
    content = resp.text
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    names = [r[1] for r in rows[1:]]
    assert "Active" in names
    assert "Removed" not in names


def test_export_json(client):
    client.post(
        "/api/food",
        json={"name": "JSON Test", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/admin/export/json")
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]

    data = json.loads(resp.text)
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["name"] == "JSON Test"


def test_export_json_active_only(client):
    resp1 = client.post(
        "/api/food",
        json={"name": "Keep", "frozen_date": str(date.today())},
    )
    resp2 = client.post(
        "/api/food",
        json={"name": "Remove", "frozen_date": str(date.today())},
    )
    item_id = resp2.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    resp = client.get("/api/admin/export/json?active_only=true")
    data = json.loads(resp.text)
    names = [d["name"] for d in data]
    assert "Keep" in names
    assert "Remove" not in names


def test_update_status(client):
    resp = client.get("/api/admin/update/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "running" in data
    assert data["running"] is False
