import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    PlainTextResponse,
    RedirectResponse,
)
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
# Built React SPA (Vite -> app/static_spa, base "/" after cutover). Served at the
# site root; falls back to the legacy static dashboard when not built (dev/CI).
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


app = FastAPI(title="VoltMint", lifespan=lifespan)

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
@app.api_route("/static/downloads/voltmint.apk", methods=["GET", "HEAD"])
def download_android_apk():
    apk = STATIC_DIR / "downloads" / "voltmint.apk"
    if not apk.is_file():
        raise HTTPException(status_code=404, detail="APK not available")
    return FileResponse(
        apk,
        media_type="application/vnd.android.package-archive",
        filename="voltmint.apk",
    )


# Serve static dashboard
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _render_with_version(filename: str) -> HTMLResponse:
    html = (STATIC_DIR / filename).read_text(encoding="utf-8")
    html = html.replace("{{STATIC_VERSION}}", STATIC_VERSION)
    return HTMLResponse(
        content=html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )


def _spa_built() -> bool:
    return (STATIC_SPA / "index.html").is_file()


@app.get("/")
def index():
    # New React SPA is the default UI. Fall back to the legacy static dashboard
    # only when the SPA hasn't been built (local dev / CI without a frontend build).
    if _spa_built():
        return _serve_spa()
    return _render_with_version("index.html")


@app.get("/privacy")
def privacy():
    return _render_with_version("privacy.html")


@app.get("/terms")
def terms():
    return _render_with_version("terms.html")


# --- React SPA (served at the site root) ----------------------------------
# Serves real built files (hashed assets, manifest, icons) when they exist and
# falls back to index.html for client-side routes. Guarded against path
# traversal. Does not touch /api, /auth, /static, /health, /privacy, /terms
# (all registered above; explicit routes win over the catch-all below).
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


# Legacy staging paths (/app, /app/*) now redirect to the root, where the SPA
# lives after the cutover. Permanent so browsers/Cloudflare update bookmarks.
@app.get("/app")
def spa_root_redirect():
    return RedirectResponse("/", status_code=301)


@app.get("/app/{full_path:path}")
def spa_app_redirect(full_path: str):
    return RedirectResponse(f"/{full_path}", status_code=301)


# Root catch-all — MUST stay the last route. Serves SPA assets and falls back to
# index.html for client-side routes. API/auth paths are excluded so their real
# JSON 404s aren't masked by the HTML shell.
@app.get("/{full_path:path}")
def spa_root_catch_all(full_path: str):
    if full_path.startswith(("api/", "auth/")) or full_path in (
        "health",
        "favicon.ico",
    ):
        return PlainTextResponse("Not Found", status_code=404)
    if not _spa_built():
        return PlainTextResponse("Not Found", status_code=404)
    return _serve_spa(full_path)
