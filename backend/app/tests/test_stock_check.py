from datetime import date


def _create_item(client, name="Test Item", barcode="barcode1", frozen_date=None):
    """Helper to create a food item with an optional barcode."""
    payload = {"name": name, "frozen_date": frozen_date or str(date.today())}
    if barcode:
        payload["barcode"] = barcode
    resp = client.post("/api/food", json=payload)
    return resp.json()["items"][0]


# ── Start session ────────────────────────────────────────────────────────

def test_start_session_loads_inventory(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")
    _create_item(client, barcode="CCC")

    resp = client.post("/api/stock-check/start")
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["total_items"] == 3


def test_start_session_excludes_items_without_barcodes(client):
    _create_item(client, barcode="BBB")
    client.post(
        "/api/food",
        json={"name": "No barcode item", "frozen_date": str(date.today())},
    )

    resp = client.post("/api/stock-check/start")
    assert resp.json()["total_items"] == 1


# ── Scan items ───────────────────────────────────────────────────────────

def test_scan_removes_barcodes_from_missing(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")
    _create_item(client, barcode="CCC")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    # Scan just "AAA"
    resp = client.post(f"/api/stock-check/{session_id}/scan", json={"barcodes": ["AAA"]})
    assert resp.status_code == 200

    stats = client.get(f"/api/stock-check/{session_id}").json()
    assert stats["scanned"] == 1
    assert stats["total_inventory"] == 3
    barcodes_missing = [m["barcode"] for m in stats["missing"]]
    assert "AAA" not in barcodes_missing


def test_scan_multiple_barcodes(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    resp = client.post(f"/api/stock-check/{session_id}/scan", json={"barcodes": ["AAA", "BBB"]})
    assert resp.status_code == 200

    stats = client.get(f"/api/stock-check/{session_id}").json()
    assert stats["scanned"] == 2


def test_scan_unknown_barcode_does_not_fail(client):
    _create_item(client, barcode="AAA")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    # Scan a barcode that's not in inventory — should not error
    resp = client.post(f"/api/stock-check/{session_id}/scan", json={"barcodes": ["UNKNOWN123"]})
    assert resp.status_code == 200


# ── Scan and create unknown items ────────────────────────────────────────

def test_scan_and_create_adds_unknown_barcode(client):
    _create_item(client, barcode="AAA")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    # Create a new item from an unknown barcode
    create_resp = client.post(
        f"/api/stock-check/{session_id}/scan-and-create",
        json={
            "name": "New Product",
            "barcode": "XYZ789",
            "frozen_date": str(date.today()),
            "quantity": 1,
        },
    )
    assert create_resp.status_code == 200
    data = create_resp.json()
    assert data["found"] is True
    assert data["item"]["name"] == "New Product"

    # Verify the item now exists in inventory
    all_items = client.get("/api/food").json()
    assert any(i["barcode"] == "XYZ789" for i in all_items)


# ── End session ──────────────────────────────────────────────────────────

def test_end_session_returns_missing_barcodes(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")
    _create_item(client, barcode="CCC")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    # Only scan "AAA" and "BBB" — leave "CCC" missing
    client.post(f"/api/stock-check/{session_id}/scan", json={"barcodes": ["AAA", "BBB"]})

    end_resp = client.post(f"/api/stock-check/{session_id}/end")
    assert end_resp.status_code == 200
    data = end_resp.json()
    assert data["scanned"] == 2
    assert data["missing_count"] == 1
    assert "CCC" in data["missing_barcodes"]


def test_end_session_invalidates_session(client):
    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    client.post(f"/api/stock-check/{session_id}/end")

    # Session should be gone now
    get_resp = client.get(f"/api/stock-check/{session_id}")
    assert get_resp.status_code == 404


# ── Remove missing ───────────────────────────────────────────────────────

def test_remove_missing_soft_deletes_items(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    # Remove "AAA" from missing without scanning it
    remove_resp = client.post(
        f"/api/stock-check/{session_id}/remove-missing",
        json={"barcodes": ["AAA"]},
    )
    assert remove_resp.status_code == 200
    data = remove_resp.json()
    assert data["removed"] == 1
    assert "AAA" in data["barcodes"]

    # Verify it's been soft-deleted (removed_at is set)
    all_active = client.get("/api/food").json()
    assert not any(i["barcode"] == "AAA" for i in all_active)


def test_remove_missing_updates_session(client):
    _create_item(client, barcode="AAA")
    _create_item(client, barcode="BBB")

    resp = client.post("/api/stock-check/start")
    session_id = resp.json()["session_id"]

    client.post(
        f"/api/stock-check/{session_id}/remove-missing",
        json={"barcodes": ["AAA"]},
    )

    stats = client.get(f"/api/stock-check/{session_id}").json()
    assert "AAA" not in [m["barcode"] for m in stats["missing"]]


# ── 404 handling ─────────────────────────────────────────────────────────

def test_stock_check_404_on_invalid_session(client):
    resp = client.get("/api/stock-check/nonexistent-session")
    assert resp.status_code == 404
