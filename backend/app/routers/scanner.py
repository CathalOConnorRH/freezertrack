from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.food import FoodItem

router = APIRouter(prefix="/api/scanner", tags=["scanner"])

_scanner_state = {
    "mode": "out",
}

_last_scan = {
    "name": None,
    "barcode": None,
    "action": None,
    "timestamp": None,
}


def record_last_scan(name: str, barcode: str | None, action: str) -> None:
    """Called by the food router after a scan-in or scan-out to record the result."""
    from datetime import datetime, timezone
    _last_scan["name"] = name
    _last_scan["barcode"] = barcode
    _last_scan["action"] = action
    _last_scan["timestamp"] = datetime.now(timezone.utc).isoformat()

CATEGORY_KEYWORDS = {
    "Meat": ["mince", "beef", "steak", "lamb", "pork", "bacon", "ham", "sausage",
             "burger", "angus", "sirloin", "chuck"],
    "Poultry": ["chicken", "turkey", "duck", "kiev", "nugget", "goujons"],
    "Fish": ["fish", "cod", "haddock", "salmon", "tuna", "prawn", "shrimp",
             "fillet", "seafood", "omega"],
    "Vegetables": ["vegetable", "peas", "spinach", "broccoli", "carrot", "corn",
                   "potato", "chips", "fries", "wedges", "roast potatoes", "garlic"],
    "Fruit": ["fruit", "berry", "berries", "strawberry", "raspberry", "mango",
              "blueberry"],
    "Ready Meals": ["pizza", "lasagne", "curry", "pie", "meal", "kiev",
                    "enchilada", "burrito", "focaccia"],
    "Bread": ["bread", "roll", "bun", "brioche", "wrap", "pitta", "naan",
              "bagel", "croissant", "pastry", "dough", "base"],
    "Desserts": ["ice cream", "dessert", "cake", "cheesecake", "brownie",
                 "waffle", "pancake"],
    "Soups": ["soup", "broth", "stock"],
}


def _guess_category(name: str) -> str | None:
    lower = name.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return category
    return None


class ScannerModeUpdate(BaseModel):
    mode: str


@router.get("/mode")
def get_scanner_mode():
    return _scanner_state


@router.put("/mode")
def set_scanner_mode(payload: ScannerModeUpdate):
    if payload.mode not in ("in", "out"):
        raise HTTPException(status_code=400, detail="mode must be 'in' or 'out'")
    _scanner_state["mode"] = payload.mode
    return _scanner_state


@router.get("/last")
def get_last_scan():
    return _last_scan


@router.post("/auto-categorise")
def auto_categorise(db: Session = Depends(get_db)):
    """Assign categories to items that have none, using keyword matching."""
    items = db.query(FoodItem).filter(
        FoodItem.category.is_(None) | (FoodItem.category == "")
    ).all()
    updated = []
    for item in items:
        cat = _guess_category(item.name)
        if cat:
            item.category = cat
            updated.append({"id": item.id, "name": item.name, "category": cat})
    db.commit()
    return {"updated": len(updated), "items": updated}
