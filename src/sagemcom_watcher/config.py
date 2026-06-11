"""Configuration management for Sagemcom Watcher."""

import logging
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv
from sagemcom_api.enums import EncryptionMethod

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Config:
    """Application configuration loaded from environment variables."""

    ROUTER_HOST: str = field(
        default_factory=lambda: os.getenv("ROUTER_HOST", "192.168.1.1")
    )
    ROUTER_USERNAME: str = field(
        default_factory=lambda: Config._get_required_env("ROUTER_USERNAME")
    )
    ROUTER_PASSWORD: str = field(
        default_factory=lambda: Config._get_required_env("ROUTER_PASSWORD")
    )
    ROUTER_ENCRYPTION: EncryptionMethod = field(
        default_factory=lambda: Config._parse_encryption(
            os.getenv("ROUTER_ENCRYPTION", "SHA512")
        )
    )
    WEB_PORT: int = field(
        default_factory=lambda: int(os.getenv("WEB_PORT", "3456"))
    )
    HISTORY_FILE: str = field(
        default_factory=lambda: os.getenv("HISTORY_FILE", "data/history.json")
    )
    POLL_INTERVAL_SECONDS: float = field(
        default_factory=lambda: float(os.getenv("POLL_INTERVAL_SECONDS", "60.0"))
    )

    @staticmethod
    def _get_required_env(key: str) -> str:
        """Retrieves a required environment variable or raises ValueError."""
        value = os.getenv(key)
        if not value:
            raise ValueError(f"Required environment variable '{key}' is not set.")
        return value

    @staticmethod
    def _parse_encryption(method_str: str) -> EncryptionMethod:
        """Parses a string representation to an EncryptionMethod enum."""
        sanitized = method_str.upper().strip()
        if sanitized == "SHA512":
            return EncryptionMethod.SHA512
        if sanitized == "MD5":
            return EncryptionMethod.MD5

        try:
            return EncryptionMethod(sanitized)
        except ValueError:
            logger.warning(
                "Unknown ROUTER_ENCRYPTION value %r, falling back to SHA512.",
                method_str,
            )
            return EncryptionMethod.SHA512
