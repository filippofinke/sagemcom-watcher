"""Background watcher and router client for Sagemcom Watcher."""

import asyncio
import datetime
import logging
import time

import aiohttp
from sagemcom_api.client import SagemcomClient
from sagemcom_api.exceptions import BaseSagemcomException

from .config import Config
from .storage import HistoryStore
from .utils import flatten_dict

logger = logging.getLogger(__name__)


async def fetch_router_info(config: Config, store: HistoryStore, session: aiohttp.ClientSession) -> None:
    """Connects to the router, fetches 'Device' data, flattens it, and saves it.

    Args:
        config: Application configuration.
        store: Storage manager for history records.
        session: Persistent HTTP session to reuse.
    """
    logger.debug("Querying router at %s...", config.ROUTER_HOST)
    try:
        async with SagemcomClient(
            config.ROUTER_HOST,
            config.ROUTER_USERNAME,
            config.ROUTER_PASSWORD,
            config.ROUTER_ENCRYPTION,
            session=session,
        ) as client:
            await client.login()
            raw_data = await client.get_value_by_xpath("Device")
            try:
                await client.logout()
            except Exception as e:
                logger.warning("Error during logout: %s", e)
    except TimeoutError as e:
        logger.error("Timeout connecting to router at %s: %s", config.ROUTER_HOST, e)
        return
    except aiohttp.ClientError as e:
        logger.error(
            "HTTP client error connecting to router at %s: %s",
            config.ROUTER_HOST,
            e,
        )
        return
    except BaseSagemcomException as e:
        logger.error(
            "Sagemcom API error connecting to router at %s: %s",
            config.ROUTER_HOST,
            e,
        )
        return
    except Exception as e:
        logger.error("Unexpected error fetching router info: %s", e, exc_info=True)
        return

    # Process and record the data
    flat_data = flatten_dict(raw_data)
    flat_data["timestamp"] = (
        datetime.datetime.now(datetime.UTC).isoformat()
    )

    store.add_entry(flat_data)
    store.save()
    logger.info("Recorded data point from %s.", config.ROUTER_HOST)


async def background_watcher(config: Config, store: HistoryStore, session: aiohttp.ClientSession) -> None:
    """Periodic background watcher loop to fetch router info.

    Runs indefinitely until cancelled.

    Args:
        config: Application configuration.
        store: Storage manager for history records.
        session: Persistent HTTP session to reuse.
    """
    logger.info(
        "Starting background watcher loop (polling every %.1fs)...",
        config.POLL_INTERVAL_SECONDS,
    )
    while True:
        start_time = time.time()
        try:
            await fetch_router_info(config, store, session)
        except Exception as e:
            logger.error("Exception in background watcher loop: %s", e, exc_info=True)

        elapsed = time.time() - start_time
        sleep_time = max(1.0, config.POLL_INTERVAL_SECONDS - elapsed)
        await asyncio.sleep(sleep_time)
