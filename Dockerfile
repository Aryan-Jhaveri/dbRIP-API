# ──────────────────────────────────────────────────────────────────────────────
# Dockerfile — multi-stage build for the dbRIP API
# ──────────────────────────────────────────────────────────────────────────────
#
# This produces a single self-contained image that:
#   1. Compiles the React frontend into optimized static files
#   2. Installs Python dependencies
#   3. Bakes the dbRIP CSV into a SQLite database at build time
#   4. Serves both the API (/v1/*) and the frontend (/) from one uvicorn process
#
# WHY MULTI-STAGE?
#   The Node.js build tools (npm, TypeScript compiler, Vite) are hundreds of MB
#   but are only needed at build time. By using a separate "frontend-build" stage,
#   we compile the frontend and then copy only the output (a handful of small JS/CSS
#   files) into the final Python image. The Node tools never appear in the shipped
#   image, keeping it small.
#
# BUILD:
#   docker build -t dbrip-api .
#
# RUN:
#   docker run -p 8000:8000 dbrip-api
#
# THEN:
#   open http://localhost:8000          ← React app (served as static files)
#   open http://localhost:8000/docs     ← Swagger UI
# ──────────────────────────────────────────────────────────────────────────────


# ── Stage 1: Build the React frontend ────────────────────────────────────────
#
# node:22-alpine is a minimal Linux image with Node.js pre-installed.
# "alpine" variants are much smaller (~50 MB) than the default Debian-based ones.
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

# Install npm dependencies first.
# By copying only package*.json before the source files, Docker caches this layer
# separately. If only source files change (not dependencies), npm ci is skipped
# on the next build, which is much faster.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source and compile it.
# Output lands in /frontend/dist/ — a handful of .html/.js/.css files.
COPY frontend/ .
RUN npm run build


# ── Stage 2: Python API server ───────────────────────────────────────────────
#
# python:3.13-slim is a minimal Debian-based image with Python pre-installed.
FROM python:3.13-slim

# Prevent Python from writing .pyc files (not useful in containers)
# and buffer stdout/stderr so logs appear immediately in docker logs.
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies.
# We install the "api" and "ingest" extras — everything needed to run the server
# and to load the CSV into SQLite. The "cli" and "dev" extras are not needed here.
#
# Copying pyproject.toml before source files keeps this layer cached when only
# source code changes (same caching trick as npm above).
COPY pyproject.toml .
RUN pip install --no-cache-dir ".[api,ingest]"

# Copy the Python source code.
COPY app/ app/
COPY ingest/ ingest/
COPY scripts/ scripts/
COPY data/ data/

# Copy the compiled React app from the frontend-build stage.
# FastAPI will serve these files as static files at the root URL ("/").
# They live at app/static/ — the StaticFiles mount in app/main.py looks here.
COPY --from=frontend-build /frontend/dist/ app/static/

# Bake the database at build time.
# This runs the ingest pipeline during the Docker build, so the SQLite file
# (dbrip.sqlite) is embedded in the image. No setup is needed at runtime —
# just run the container and the data is already there.
#
# Trade-off: the image is larger (~100 MB for the database), but deployment is
# completely hands-off. If the data changes, rebuild the image.
RUN python scripts/ingest.py --manifest data/manifests/dbrip_v1.yaml

# Expose the port the server listens on.
EXPOSE 8000

# Health check — Docker will mark the container "healthy" once this passes.
# The /v1/health endpoint returns {"status": "ok"} immediately.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/v1/health')"

# Start the API server.
# --host 0.0.0.0 makes it reachable from outside the container.
# --workers 1 is appropriate for SQLite (which doesn't support concurrent writes,
# though this API is read-only so multiple workers would actually be fine —
# kept at 1 to avoid any edge cases with multiple processes sharing the file).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
