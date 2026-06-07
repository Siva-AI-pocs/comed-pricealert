# --- Stage 1: build the React SPA (Vite) ----------------------------------
# Produces /app/static_spa (vite outDir is ../app/static_spa relative to the
# frontend/ workdir). Built with VITE_BASE=/ so the SPA is served at the root.
FROM node:18-slim AS frontend

# Skip Playwright's browser download — it's a devDependency we never use at
# build time, and the download is large and flaky inside Docker.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false

WORKDIR /frontend

# Install deps first (cached unless the lock file changes).
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build the SPA.
COPY frontend/ ./
RUN VITE_BASE=/ npm run build

# --- Stage 2: Python app --------------------------------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Drop in the built SPA AFTER copying app/ so it isn't clobbered by the host
# tree (where app/static_spa is gitignored and usually absent).
COPY --from=frontend /app/static_spa ./app/static_spa

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
