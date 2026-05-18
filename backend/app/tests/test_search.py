from datetime import date


def test_search_items_by_name(client):
    client.post("/api/food", json={"name": "Frozen Pizza", "brand": "PizzaCo", "frozen_date": str(date.today())})

    resp = client.get("/api/food/search?q=pizza")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Frozen Pizza"


def test_search_items_by_brand(client):
    client.post("/api/food", json={"name": "Ice Cream", "brand": "DairyJoy", "frozen_date": str(date.today())})

    resp = client.get("/api/food/search?q=dairyjoy")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["brand"] == "DairyJoy"


def test_search_items_by_notes(client):
    client.post("/api/food", json={"name": "Steak", "brand": "BeefCo", "notes": "Very delicious and juicy", "frozen_date": str(date.today())})

    resp = client.get("/api/food/search?q=juicy")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Steak"


def test_search_items_ignores_removed(client):
    resp1 = client.post("/api/food", json={"name": "Active Item", "brand": "BrandA", "frozen_date": str(date.today())})
    resp2 = client.post("/api/food", json={"name": "Removed Item", "brand": "BrandB", "frozen_date": str(date.today())})

    removed_id = resp2.json()["items"][0]["id"]
    client.post(f"/api/food/{removed_id}/remove")

    resp = client.get("/api/food/search?q=item")
    assert resp.status_code == 200
    data = resp.json()
    names = [d["name"] for d in data]
    assert "Active Item" in names
    assert "Removed Item" not in names
