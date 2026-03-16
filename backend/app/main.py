from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import admin, food, freezers, homeassistant, labels, scanner, shopping


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

app.include_router(food.router)
app.include_router(labels.router)
app.include_router(homeassistant.router)
app.include_router(admin.router)
app.include_router(shopping.router)
app.include_router(freezers.router)
app.include_router(scanner.router)


@app.get("/health")
def health():
    return {"status": "ok"}
