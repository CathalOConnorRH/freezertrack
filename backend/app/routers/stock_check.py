import time
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import FoodItemCreate, FoodItemResponse

router = APIRouter(prefix="/api/stock-check", tags=["stock-check"])


class StartSessionResponse(BaseModel):
    session_id: str
    total_items: int


class ScanResultItem(BaseModel):
    barcode: str | None
    found: bool
    item: dict | None = None
    progress: dict | None = None


class StockCheckStats(BaseModel):
    session_id: str
    total_inventory: int
    scanned: int
    missing: list[dict]


class BatchRequest(BaseModel):
    barcodes: list[str]


# ── In-memory session store ──────────────────────────────────────────────

_sessions: dict[str, dict] = {}


def _cleanup_old_sessions():
    """Remove sessions older than 2 hours."""
    now = time.time()
    expired = [sid for sid, s in _sessions.items() if now - s["created_at"] > 7200]
    for sid in expired:
        del _sessions[sid]


def _get_session(session_id: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Stock check session not found or expired")
    return session


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartSessionResponse)
def start_stock_check(db: Session = Depends(get_db)):
    """Start a new stock check session by loading all active inventory barcodes."""
    _cleanup_old_sessions()

    items = db.query(FoodItem).filter(
        FoodItem.removed_at.is_(None),
        FoodItem.barcode.isnot(None),
        FoodItem.barcode != "",
    ).all()

    session_id = str(uuid.uuid4())
    # Track barcodes that need to be scanned (start as all of them)
    _sessions[session_id] = {
        "total_inventory": len(items),
        "barcodes_to_scan": {item.barcode for item in items},
        "created_at": time.time(),
    }

    return StartSessionResponse(session_id=session_id, total_items=len(items))


@router.get("/{session_id}", response_model=StockCheckStats)
def get_stock_check_progress(session_id: str):
    """Get current stock check progress (called after each scan)."""
    session = _get_session(session_id)

    missing_barcode_set = set(session["barcodes_to_scan"])
    scanned_count = session["total_inventory"] - len(missing_barcode_set)

    return StockCheckStats(
        session_id=session_id,
        total_inventory=session["total_inventory"],
        scanned=scanned_count,
        missing=[{"barcode": b} for b in sorted(missing_barcode_set)],
    )


@router.post("/{session_id}/scan", response_model=ScanResultItem)
def scan_stock_check_item(
    session_id: str,
    payload: BatchRequest,
    db: Session = Depends(get_db),
):
    """Scan barcodes during a stock check session. Removes scanned barcodes from the missing list."""
    session = _get_session(session_id)

    # Remove scanned barcodes from the set (they've been physically found)
    for barcode in payload.barcodes:
        session["barcodes_to_scan"].discard(barcode)

    return ScanResultItem(
        barcode=payload.barcodes[0] if len(payload.barcodes) == 1 else None,
        found=True,
        item=None,
    )


@router.post("/{session_id}/scan-and-create", response_model=ScanResultItem)
def scan_and_create_item(
    session_id: str,
    payload: FoodItemCreate,
    db: Session = Depends(get_db),
):
    """Handle an unknown retail barcode by creating it as a new food item, then mark session progress."""
    session = _get_session(session_id)

    # Remove the scanned barcode from missing (it's now in inventory via auto-create)
    if payload.barcode:
        session["barcodes_to_scan"].discard(payload.barcode)

    item_id = str(uuid.uuid4())
    item = FoodItem(
        id=item_id,
        name=payload.name,
        brand=payload.brand,
        category=payload.category,
        barcode=payload.barcode,
        frozen_date=payload.frozen_date,
        quantity=payload.quantity,
        shelf_life_days=payload.shelf_life_days,
        notes=payload.notes,
        freezer_id=payload.freezer_id,
        qr_code_id=item_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    resp = FoodItemResponse.model_validate(item).model_dump(mode="json")
    return ScanResultItem(
        barcode=payload.barcode or None,
        found=True,
        item=resp,
    )


@router.post("/{session_id}/end")
def end_stock_check(session_id: str):
    """End a stock check session and return final stats. Invalidates the session."""
    session = _get_session(session_id)

    total_scanned = session["total_inventory"] - len(session["barcodes_to_scan"])
    missing_barcodes = sorted(list(session["barcodes_to_scan"]))

    result = {
        "session_id": session_id,
        "total_inventory": session["total_inventory"],
        "scanned": total_scanned,
        "missing_count": len(missing_barcodes),
        "missing_barcodes": missing_barcodes,
    }

    # Invalidate the session after returning results
    del _sessions[session_id]
    return result


@router.post("/{session_id}/remove-missing")
def remove_missing_items(
    session_id: str,
    payload: BatchRequest,
    db: Session = Depends(get_db),
):
    """Soft-delete food items whose barcodes are in the missing list (were never scanned)."""
    session = _get_session(session_id)

    to_remove = [b for b in payload.barcodes if b in session["barcodes_to_scan"]]
    removed_count = 0
    for barcode in to_remove:
        items = db.query(FoodItem).filter(
            FoodItem.barcode == barcode,
            FoodItem.removed_at.is_(None),
        ).all()
        for item in items:
            item.removed_at = datetime.now(timezone.utc)
            removed_count += 1

    # Remove from session's missing set too
    for b in to_remove:
        session["barcodes_to_scan"].discard(b)

    db.commit()
    return {"removed": removed_count, "barcodes": to_remove}
