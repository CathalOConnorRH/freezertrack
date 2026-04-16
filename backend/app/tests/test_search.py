import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.database import Base, get_db
from app.main import app
from app.models.food import FoodItem
import uuid
from datetime import date, datetime, timezone

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(name="db")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(name="client")
def client(db: Session):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_search_items_by_name(client: TestClient, db):
    # Create a food item
    item_id = str(uuid.uuid4())
    item = FoodItem(
        id=item_id,
        name="Frozen Pizza",
        brand="PizzaCo",
        frozen_date=date.today(),
        quantity=1,
        qr_code_id=item_id,
        removed_at=None
    )
    db.add(item)
    db.commit()

    # Search by name
    response = client.get("/api/food/search?q=pizza")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Frozen Pizza"

def test_search_items_by_brand(client: TestClient, db):
    # Create a food item
    item_id = str(uuid.uuid4())
    item = FoodItem(
        id=item_id,
        name="Ice Cream",
        brand="DairyJoy",
        frozen_date=date.today(),
        quantity=1,
        qr_code_id=item_id,
        removed_at=None
    )
    db.add(item)
    db.commit()

    # Search by brand
    response = client.get("/api/food/search?q=dairyjoy")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["brand"] == "DairyJoy"

def test_search_items_by_notes(client: TestClient, db):
    # Create a food item
    item_id = str(uuid.uuid4())
    item = FoodItem(
        id=item_id,
        name="Steak",
        brand="BeefCo",
        frozen_date=date.today(),
        quantity=1,
        notes="Very delicious and juicy",
        qr_code_id=item_id,
        removed_at=None
    )
    db.add(item)
    db.commit()

    # Search by notes
    response = client.get("/api/food/search?q=juicy")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Steak"

def test_search_items_ignores_removed(client: TestClient, db):
    # Create an active food item
    item1_id = str(uuid.uuid4())
    item1 = FoodItem(
        id=item1_id,
        name="Active Item",
        brand="BrandA",
        frozen_date=date.today(),
        quantity=1,
        qr_code_id=item1_id,
        removed_at=None
    )
    db.add(item1)

    # Create a removed food item
    item2_id = str(uuid.uuid4())
    item2 = FoodItem(
        id=item2_id,
        name="Removed Item",
        brand="BrandB",
        frozen_date=date.today(),
        quantity=1,
        qr_code_id=item2_id,
        removed_at=datetime.now(timezone.utc)
    )
    db.add(item2)
    db.commit()

    # Search for "Item"
    response = client.get("/api/food/search?q=item")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Active Item"
