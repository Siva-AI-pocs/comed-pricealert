"""
Shared pytest fixtures for the ComEd Price Alert test suite.

Unit/integration tests use an in-memory SQLite database (StaticPool so a
single connection is reused — required for :memory: DBs to survive across
multiple sessions).  E2E tests are tagged @pytest.mark.e2e.
"""
import os

# Force SQLite in-memory BEFORE any app module is imported so pydantic-settings
# picks it up.  Plain assignment (not setdefault) overrides shell env too.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

TEST_DATABASE_URL = "sqlite:///:memory:"


def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: live end-to-end tests against Render (requires network)")
    config.addinivalue_line("markers", "slow: intentionally slow tests")


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_engine():
    """
    Single in-memory SQLite engine shared across the test session.
    StaticPool reuses one underlying connection so the :memory: database
    survives for the lifetime of the engine (not just one connection).
    """
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from app.database import Base
    import app.models  # noqa: F401 — register all ORM models with Base
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(test_engine):
    """
    Fresh SQLAlchemy session per test.  Rows are wiped BEFORE the session is
    closed so the StaticPool connection (and its schema) stays alive.
    """
    TestingSession = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    session = TestingSession()
    yield session
    session.rollback()
    # Delete all rows while connection is still open
    from app.database import Base
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(table.delete())
    session.commit()
    session.close()


# ---------------------------------------------------------------------------
# FastAPI TestClient fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def client(db):
    """FastAPI TestClient with get_db replaced by the test DB session."""
    from app.main import app
    from app.database import get_db

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper: seed price rows
# ---------------------------------------------------------------------------

@pytest.fixture()
def seed_prices(db):
    """Returns a callable that inserts (millis_utc, price_cents) pairs."""
    from datetime import datetime, timezone
    from sqlalchemy import text

    def _seed(rows: list[tuple[int, float]]) -> None:
        for millis, price in rows:
            db.execute(
                text("""
                    INSERT INTO price_5min (millis_utc, price_cents, recorded_at)
                    VALUES (:millis, :price, :now)
                    ON CONFLICT (millis_utc) DO NOTHING
                """),
                {"millis": millis, "price": price, "now": datetime.now(timezone.utc)},
            )
        db.commit()

    return _seed
