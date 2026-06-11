"""Route handlers for the web application."""

import contextlib
import os

from aiohttp import web

_INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "index.html")
_INDEX_CACHE: str | None = None


def _load_index() -> str | None:
    """Reads and caches the index.html contents on first access."""
    global _INDEX_CACHE
    if _INDEX_CACHE is None and os.path.exists(_INDEX_PATH):
        with open(_INDEX_PATH, encoding="utf-8") as f:
            _INDEX_CACHE = f.read()
    return _INDEX_CACHE


async def get_index(request: web.Request) -> web.Response:
    """Serves the cached index.html UI page."""
    content = _load_index()
    if content is None:
        return web.Response(text="index.html not found", status=404)
    return web.Response(text=content, content_type="text/html")


async def get_history(request: web.Request) -> web.Response:
    """Serves the history data as a JSON object with optional range filtering."""
    store = request.app["store"]

    query = request.query
    hours_str = query.get("hours")
    start = query.get("start")
    end = query.get("end")

    hours: float | None = None
    if hours_str:
        with contextlib.suppress(ValueError):
            hours = float(hours_str)

    return web.json_response(store.get_data(start_str=start, end_str=end, hours=hours))
