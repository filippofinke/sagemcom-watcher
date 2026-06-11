"""Main entry point for Sagemcom Watcher."""

import asyncio
import contextlib
import logging
import signal
import sys

import aiohttp
from aiohttp import web

from .config import Config
from .storage import HistoryStore
from .watcher import background_watcher
from .web.app import create_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("sagemcom_watcher")


async def async_main() -> None:
    """Core async orchestrator to run the background poller and web server."""
    try:
        config = Config()
    except ValueError as e:
        logger.error("Configuration error: %s", e)
        sys.exit(1)

    store = HistoryStore(config.HISTORY_FILE)
    store.load()

    timeout = aiohttp.ClientTimeout(total=120)
    session = aiohttp.ClientSession(
        headers={"User-Agent": "Python_Sagemcom"},
        timeout=timeout,
    )

    watcher_task = asyncio.create_task(background_watcher(config, store, session))

    app = create_app(config, store)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.WEB_PORT)
    await site.start()
    logger.info("Web server running at http://localhost:%d/", config.WEB_PORT)

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Windows ProactorEventLoop does not support add_signal_handler.
            signal.signal(sig, lambda *_: stop_event.set())

    try:
        await stop_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Shutting down application...")

        logger.info("Cancelling background watcher...")
        watcher_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watcher_task

        logger.info("Closing HTTP session...")
        await session.close()

        logger.info("Cleaning up web server...")
        await runner.cleanup()

        logger.info("Application shut down successfully.")


def main() -> None:
    """App entry point, wrapping the async run loop."""
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(async_main())


if __name__ == "__main__":
    main()
