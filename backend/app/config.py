from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./data/freezer.db"
    NIIMBOT_MAC: str = "AA:BB:CC:DD:EE:FF"
    AUTO_PRINT: bool = True
    UPC_ITEM_DB_KEY: str = ""
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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
