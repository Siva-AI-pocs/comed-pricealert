import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.services.scheduler import create_scheduler

# Used as a cache-buster query string on static assets. Changes every container
# restart, so a redeploy invalidates stale JS/CSS in browsers and Cloudflare.
STATIC_VERSION = str(int(time.time()))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = create_scheduler()
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="ComEd Price Alert", lifespan=lifespan)

# Sliding-session refresh: re-issue the auth cookie for active users.
from app.auth.session import add_sliding_session_refresh  # noqa: E402

add_sliding_session_refresh(app)

# API routers
from app.api import (  # noqa: E402
    auth,
    decision,
    forecast,
    internal,
    prices,
    subscriptions,
    usage,
)

app.include_router(auth.router)
app.include_router(prices.router)
app.include_router(subscriptions.router)
app.include_router(decision.router)
app.include_router(internal.router)
app.include_router(usage.router)
app.include_router(forecast.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve static dashboard
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _render_with_version(filename: str) -> HTMLResponse:
    html = (STATIC_DIR / filename).read_text(encoding="utf-8")
    html = html.replace("{{STATIC_VERSION}}", STATIC_VERSION)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/")
def index():
    return _render_with_version("index.html")


@app.get("/privacy")
def privacy():
    return _render_with_version("privacy.html")


@app.get("/terms")
def terms():
    return _render_with_version("terms.html")
