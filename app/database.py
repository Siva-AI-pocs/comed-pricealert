from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# connect_args only needed for SQLite; PostgreSQL doesn't use check_same_thread
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    from app import models  # noqa: F401 — ensure models are registered

    Base.metadata.create_all(bind=engine)
    # Migrate millis_utc from INTEGER to BIGINT if needed (one-time fix)
    if not settings.database_url.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                conn.execute(
                    text("ALTER TABLE price_5min ALTER COLUMN millis_utc TYPE BIGINT")
                )
                conn.commit()
        except Exception:
            pass  # Column already BIGINT or table doesn't exist yet
        # Add user_id FK to subscriptions if not present yet (one-time migration)
        try:
            with engine.connect() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE subscriptions ADD COLUMN user_id INTEGER REFERENCES users(id)"
                    )
                )
                conn.commit()
        except Exception:
            pass  # Column already exists

    # Add password-reset columns to users if not present yet (one-time migration).
    # Runs for SQLite and Postgres alike — both support ADD COLUMN, and an existing
    # DB won't get these via create_all.
    for ddl in (
        "ALTER TABLE users ADD COLUMN reset_code_hash TEXT",
        "ALTER TABLE users ADD COLUMN reset_code_expires_at TIMESTAMP",
        "ALTER TABLE subscriptions ADD COLUMN notify_negative BOOLEAN DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN name TEXT",
        "ALTER TABLE users ADD COLUMN timezone TEXT",
    ):
        try:
            with engine.connect() as conn:
                conn.execute(text(ddl))
                conn.commit()
        except Exception:
            pass  # Column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
