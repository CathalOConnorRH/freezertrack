import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _tmp_label_dir(tmp_path, monkeypatch):
    label_dir = str(tmp_path / "labels")
    os.makedirs(label_dir, exist_ok=True)
    monkeypatch.setenv("LABEL_DATA_DIR", label_dir)
    import app.routers.food as food_mod
    import app.routers.labels as labels_mod

    food_mod.LABEL_DIR = label_dir
    labels_mod.DATA_DIR = label_dir


@pytest.fixture(autouse=True)
def _mock_printer():
    with patch("app.services.print_service.print_label", return_value=True) as mock:
        yield mock


@pytest.fixture()
def mock_printer(_mock_printer):
    return _mock_printer


@pytest.fixture()
def client():
    return TestClient(app)
