from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings


def _coerce_empty_int(v: Any, default: int) -> int:
    if v is None or v == "":
        return default
    return int(v)


def _coerce_empty_bool(v: Any, default: bool) -> bool:
    if v is None or v == "":
        return default
    if isinstance(v, str):
        return v.lower() in ("true", "1", "yes")
    return bool(v)


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./data/freezer.db"
    NIIMBOT_MAC: str = "AA:BB:CC:DD:EE:FF"
    AUTO_PRINT: bool = True
    UPC_ITEM_DB_KEY: str = ""
    BARCODE_LOOKUP_API_KEY: str = ""
    BARCODE_CACHE_TTL_SECONDS: int = 86400
    ALERT_DAYS_FROZEN: int = 90
    LOW_STOCK_THRESHOLD: int = 5
    SECRET_KEY: str = "changeme"
    LABEL_WIDTH: int = 400
    LABEL_HEIGHT: int = 240
    LABEL_FONT_SIZE: int = 22
    LABEL_SHOW_NOTES: bool = False
    LABEL_SHOW_BRAND: bool = True
    LABEL_SHOW_CATEGORY: bool = False

    @field_validator("LABEL_WIDTH", mode="before")
    @classmethod
    def _width(cls, v: Any) -> int:
        return _coerce_empty_int(v, 400)

    @field_validator("LABEL_HEIGHT", mode="before")
    @classmethod
    def _height(cls, v: Any) -> int:
        return _coerce_empty_int(v, 240)

    @field_validator("LABEL_FONT_SIZE", mode="before")
    @classmethod
    def _font_size(cls, v: Any) -> int:
        return _coerce_empty_int(v, 22)

    @field_validator("LABEL_SHOW_NOTES", "LABEL_SHOW_BRAND", "LABEL_SHOW_CATEGORY", mode="before")
    @classmethod
    def _label_bools(cls, v: Any, info) -> bool:
        defaults = {"LABEL_SHOW_NOTES": False, "LABEL_SHOW_BRAND": True, "LABEL_SHOW_CATEGORY": False}
        return _coerce_empty_bool(v, defaults.get(info.field_name, False))

    @field_validator("BARCODE_CACHE_TTL_SECONDS", "ALERT_DAYS_FROZEN", "LOW_STOCK_THRESHOLD", mode="before")
    @classmethod
    def _int_fields(cls, v: Any, info) -> int:
        defaults = {"BARCODE_CACHE_TTL_SECONDS": 86400, "ALERT_DAYS_FROZEN": 90, "LOW_STOCK_THRESHOLD": 5}
        return _coerce_empty_int(v, defaults.get(info.field_name, 0))

    @field_validator("AUTO_PRINT", mode="before")
    @classmethod
    def _auto_print(cls, v: Any) -> bool:
        return _coerce_empty_bool(v, True)

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
