from datetime import date, datetime, timedelta

from pydantic import BaseModel, ConfigDict, Field, computed_field

DEFAULT_SHELF_LIFE_DAYS = 180

SHELF_LIFE_MAP = {
    "meat": 120,
    "poultry": 180,
    "fish": 90,
    "vegetables": 240,
    "fruit": 240,
    "bread": 90,
    "ready meals": 90,
    "soups": 120,
    "desserts": 180,
    "other": 180,
}


class FoodItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=50)
    frozen_date: date
    quantity: int = Field(default=1, ge=1, le=999)
    containers: int = Field(default=1, ge=1, le=50)
    shelf_life_days: int | None = Field(default=None, ge=1, le=3650)
    freezer_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)
    auto_print: bool = True


class FoodItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=50)
    frozen_date: date | None = None
    quantity: int | None = Field(default=None, ge=1, le=999)
    shelf_life_days: int | None = Field(default=None, ge=1, le=3650)
    notes: str | None = Field(default=None, max_length=500)


class FoodItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    brand: str | None
    category: str | None
    barcode: str | None
    frozen_date: date
    quantity: int
    shelf_life_days: int | None
    notes: str | None
    photo_path: str | None
    freezer_id: str | None
    removed_at: datetime | None
    qr_code_id: str
    created_at: datetime

    @computed_field
    @property
    def expiry_date(self) -> date | None:
        days = self.shelf_life_days or DEFAULT_SHELF_LIFE_DAYS
        return self.frozen_date + timedelta(days=days)

    @computed_field
    @property
    def days_until_expiry(self) -> int:
        exp = self.expiry_date
        if exp is None:
            return 999
        return (exp - date.today()).days

    @computed_field
    @property
    def has_photo(self) -> bool:
        return self.photo_path is not None


class ShoppingItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    quantity: int = Field(default=1, ge=1, le=999)


class ShoppingItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    brand: str | None
    quantity: int
    added_at: datetime
    completed_at: datetime | None
    source_item_id: str | None
