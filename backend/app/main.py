import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine, get_db
from app.routers import admin, food, freezers, homeassistant, labels, scanner, shopping

logger = logging.getLogger("freezertrack")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="FreezerTrack", lifespan=lifespan)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s %s %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": [
                {"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]}
                for e in exc.errors()
            ],
        },
    )


@app.exception_handler(Exception)
async def global_error_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(food.router)
app.include_router(labels.router)
app.include_router(homeassistant.router)
app.include_router(admin.router)
app.include_router(shopping.router)
app.include_router(freezers.router)
app.include_router(scanner.router)


@app.get("/health")
def health(db=Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "database": "connected" if db_ok else "error",
    }
