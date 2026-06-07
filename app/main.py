import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
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
# Built React SPA (Vite -> app/static_spa, base "/app/"). Served at /app for
# staging validation before the cutover that flips "/" to it.
STATIC_SPA = Path(__file__).parent / "static_spa"


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


# Serve the Android APK with the correct MIME type + download filename. APKs are
# ZIP archives, so when served as the StaticFiles default (text/plain) a browser
# or a content-sniffing CDN saves them as ".zip". Registered BEFORE the /static
# mount so this explicit route wins for that path.
@app.api_route("/static/downloads/pricepulse.apk", methods=["GET", "HEAD"])
def download_android_apk():
    apk = STATIC_DIR / "downloads" / "pricepulse.apk"
    if not apk.is_file():
        raise HTTPException(status_code=404, detail="APK not available")
    return FileResponse(
        apk,
        media_type="application/vnd.android.package-archive",
        filename="pricepulse.apk",
    )


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


# --- React SPA (staging at /app) ------------------------------------------
# Serves real built files (hashed assets, manifest, icons) when they exist and
# falls back to index.html for client-side routes. Guarded against path
# traversal. Does not touch /, /api, /auth, /static, /health (registered above).
def _serve_spa(full_path: str = "") -> HTMLResponse | FileResponse | PlainTextResponse:
    index = STATIC_SPA / "index.html"
    if not index.is_file():
        return PlainTextResponse("SPA not built yet", status_code=503)
    if full_path:
        candidate = (STATIC_SPA / full_path).resolve()
        if candidate.is_relative_to(STATIC_SPA.resolve()) and candidate.is_file():
            return FileResponse(candidate)
    return HTMLResponse(
        index.read_text(encoding="utf-8"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/app")
def spa_root():
    return _serve_spa()


@app.get("/app/{full_path:path}")
def spa_catch_all(full_path: str):
    return _serve_spa(full_path)
