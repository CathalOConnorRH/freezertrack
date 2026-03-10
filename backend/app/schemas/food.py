from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class FoodItemCreate(BaseModel):
    name: str
    brand: str | None = None
    frozen_date: date
    quantity: int = 1
    containers: int = 1
    notes: str | None = None
    auto_print: bool = True


class FoodItemUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    frozen_date: date | None = None
    quantity: int | None = None
    notes: str | None = None


class FoodItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    brand: str | None
    frozen_date: date
    quantity: int
    notes: str | None
    removed_at: datetime | None
    qr_code_id: str
    created_at: datetime
