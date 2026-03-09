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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
