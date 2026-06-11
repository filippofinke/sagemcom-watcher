"""Web application factory for Sagemcom Watcher."""

import os

from aiohttp import web

from ..config import Config
from ..storage import HistoryStore
from .routes import get_history, get_index


def create_app(config: Config, store: HistoryStore) -> web.Application:
    """Factory to create and configure the web Application.

    Args:
        config: Application configuration settings.
        store: Storage provider for reading history data.

    Returns:
        A configured web.Application instance.
    """
    app = web.Application()

    app["config"] = config
    app["store"] = store

    app.router.add_get("/", get_index)
    app.router.add_get("/api/history", get_history)

    current_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(current_dir, "static")
    app.router.add_static("/static/", static_dir, name="static")

    return app
