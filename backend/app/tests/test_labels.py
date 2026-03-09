import json
import os
import tempfile
from datetime import date

from app.services.qr_service import decode_qr_string, generate_qr_png


def test_preview_returns_png(client):
    resp = client.post(
        "/api/food",
        json={"name": "Test Item", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]

    preview = client.get(f"/api/labels/{item_id}/preview")
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"


def test_qr_round_trip():
    data = {"id": "abc", "name": "Test"}
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name

    try:
        generate_qr_png(data, path)
        assert os.path.exists(path)
        compact = json.dumps(data, separators=(",", ":"))
        decoded = decode_qr_string(compact)
        assert decoded == data
    finally:
        os.unlink(path)


def test_print_label_endpoint(client, mock_printer):
    resp = client.post(
        "/api/food",
        json={"name": "Print Test", "frozen_date": str(date.today())},
    )
    item_id = resp.json()["items"][0]["id"]

    mock_printer.reset_mock()
    print_resp = client.post(f"/api/labels/{item_id}/print")
    assert print_resp.status_code == 200
    data = print_resp.json()
    assert data["printed"] is True
    assert data["success"] is True
    mock_printer.assert_called_once()


def test_preview_404_for_missing(client):
    resp = client.get("/api/labels/nonexistent/preview")
    assert resp.status_code == 404
