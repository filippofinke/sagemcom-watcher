FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-install-project --no-dev

COPY src/ ./src/
COPY README.md LICENSE ./

RUN uv sync --frozen --no-dev

ENV PYTHONPATH=/app/src \
    HISTORY_FILE=/app/data/history.json

RUN mkdir -p /app/data \
    && groupadd --system app \
    && useradd --system --gid app --home /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; \
url=f'http://127.0.0.1:{os.environ.get(\"WEB_PORT\",\"3456\")}/'; \
sys.exit(0 if urllib.request.urlopen(url, timeout=3).status==200 else 1)" || exit 1

CMD ["uv", "run", "sagemcom-watcher"]
