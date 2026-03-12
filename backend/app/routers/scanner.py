from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/scanner", tags=["scanner"])

_scanner_state = {
    "mode": "out",
}


class ScannerModeUpdate(BaseModel):
    mode: str


@router.get("/mode")
def get_scanner_mode():
    return _scanner_state


@router.put("/mode")
def set_scanner_mode(payload: ScannerModeUpdate):
    if payload.mode not in ("in", "out"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="mode must be 'in' or 'out'")
    _scanner_state["mode"] = payload.mode
    return _scanner_state
