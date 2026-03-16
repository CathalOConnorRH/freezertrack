from datetime import date


def test_search_by_name(client):
    client.post(
        "/api/food",
        json={"name": "Chicken Tikka Masala", "frozen_date": str(date.today())},
    )
    client.post(
        "/api/food",
        json={"name": "Beef Stew", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/food/search?q=chicken")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "Chicken Tikka Masala"


def test_search_by_brand(client):
    client.post(
        "/api/food",
        json={"name": "Fish Fingers", "brand": "Birds Eye", "frozen_date": str(date.today())},
    )
    client.post(
        "/api/food",
        json={"name": "Peas", "brand": "Green Giant", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/food/search?q=birds")
    items = resp.json()
    assert len(items) == 1
    assert items[0]["brand"] == "Birds Eye"


def test_search_excludes_removed(client):
    resp = client.post(
        "/api/food",
        json={"name": "Removed Lasagna", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    results = client.get("/api/food/search?q=lasagna").json()
    assert len(results) == 0


def test_categories_returns_presets_and_used(client):
    client.post(
        "/api/food",
        json={"name": "Curry", "category": "Custom Cat", "frozen_date": str(date.today())},
    )

    cats = client.get("/api/food/categories").json()
    assert "Custom Cat" in cats
    assert "Meat" in cats
    assert "Fish" in cats
    assert cats == sorted(cats)


def test_categories_excludes_removed_items(client):
    resp = client.post(
        "/api/food",
        json={"name": "Old", "category": "Ghost Category", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    cats = client.get("/api/food/categories").json()
    assert "Ghost Category" not in cats


def test_grouped_view(client):
    client.post(
        "/api/food",
        json={"name": "Bolognese", "frozen_date": "2025-01-01", "quantity": 2},
    )
    client.post(
        "/api/food",
        json={"name": "Bolognese", "frozen_date": "2025-02-01", "quantity": 3},
    )
    client.post(
        "/api/food",
        json={"name": "Soup", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/food/grouped")
    assert resp.status_code == 200
    groups = resp.json()
    assert len(groups) == 2

    bolognese = next(g for g in groups if g["name"] == "Bolognese")
    assert bolognese["count"] == 2
    assert bolognese["total_servings"] == 5
    assert bolognese["oldest_date"] == "2025-01-01"
    assert bolognese["newest_date"] == "2025-02-01"


def test_grouped_filter_by_category(client):
    client.post(
        "/api/food",
        json={"name": "Cod", "category": "Fish", "frozen_date": str(date.today())},
    )
    client.post(
        "/api/food",
        json={"name": "Steak", "category": "Meat", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/food/grouped?category=fish")
    groups = resp.json()
    assert len(groups) == 1
    assert groups[0]["name"] == "Cod"


def test_grouped_filter_by_freezer(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Garage"}
    ).json()

    client.post(
        "/api/food",
        json={
            "name": "Stew",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )
    client.post(
        "/api/food",
        json={"name": "Pie", "frozen_date": str(date.today())},
    )

    resp = client.get(f"/api/food/grouped?freezer_id={freezer['id']}")
    groups = resp.json()
    assert len(groups) == 1
    assert groups[0]["name"] == "Stew"
    assert groups[0]["freezer_name"] == "Garage"


def test_stats_returns_expected_fields(client):
    client.post(
        "/api/food",
        json={"name": "Item A", "frozen_date": str(date.today()), "category": "Meat"},
    )
    resp2 = client.post(
        "/api/food",
        json={"name": "Item B", "frozen_date": str(date.today())},
    )
    item_id = resp2.json()["items"][0]["id"]
    client.post(f"/api/food/{item_id}/remove")

    resp = client.get("/api/food/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_active"] == 1
    assert data["total_removed"] == 1
    assert data["total_ever"] == 2
    assert "average_age_days" in data
    assert isinstance(data["top_items"], list)
    assert isinstance(data["timeline"], list)
    assert len(data["timeline"]) == 12
    assert isinstance(data["categories"], list)


def test_stats_top_items_ordering(client):
    for _ in range(3):
        client.post(
            "/api/food",
            json={"name": "Popular", "frozen_date": str(date.today())},
        )
    client.post(
        "/api/food",
        json={"name": "Rare", "frozen_date": str(date.today())},
    )

    stats = client.get("/api/food/stats").json()
    top = stats["top_items"]
    assert top[0]["name"] == "Popular"
    assert top[0]["count"] == 3


def test_list_items_filter_by_category(client):
    client.post(
        "/api/food",
        json={"name": "Salmon", "category": "Fish", "frozen_date": str(date.today())},
    )
    client.post(
        "/api/food",
        json={"name": "Chicken", "category": "Poultry", "frozen_date": str(date.today())},
    )

    resp = client.get("/api/food?category=fish")
    items = resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "Salmon"


def test_list_items_filter_by_freezer(client):
    freezer = client.post(
        "/api/freezers", json={"name": "Upstairs"}
    ).json()

    client.post(
        "/api/food",
        json={
            "name": "In Freezer",
            "frozen_date": str(date.today()),
            "freezer_id": freezer["id"],
        },
    )
    client.post(
        "/api/food",
        json={"name": "No Freezer", "frozen_date": str(date.today())},
    )

    resp = client.get(f"/api/food?freezer_id={freezer['id']}")
    items = resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "In Freezer"


def test_create_item_with_category_auto_shelf_life(client):
    resp = client.post(
        "/api/food",
        json={"name": "Cod", "category": "Fish", "frozen_date": str(date.today())},
    )
    assert resp.status_code == 201
    item = resp.json()["items"][0]
    assert item["shelf_life_days"] == 90


def test_create_item_explicit_shelf_life_overrides_category(client):
    resp = client.post(
        "/api/food",
        json={
            "name": "Trout",
            "category": "Fish",
            "frozen_date": str(date.today()),
            "shelf_life_days": 60,
        },
    )
    item = resp.json()["items"][0]
    assert item["shelf_life_days"] == 60
