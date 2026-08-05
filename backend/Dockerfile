FROM python:3.11-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Shell form (not exec-array) so $PORT actually expands: most container
# hosts (Railway, Render, Cloud Run) assign a dynamic port at runtime via
# this env var and route traffic to whatever the container binds -- an
# exec-array CMD with a hardcoded --port would silently ignore it and the
# platform's health check would never see the app come up. Falls back to
# 8000 for plain `docker run` / docker-compose where PORT is unset.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
