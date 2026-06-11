"""Utility functions for Sagemcom Watcher."""

from typing import Any


def flatten_dict(d: Any, parent_key: str = "", sep: str = "_") -> dict[str, Any]:
    """Recursively flattens a nested dictionary or list, joining nested keys with ``sep``.

    Handles nested dicts and lists.

    Args:
        d: The dictionary or list to flatten.
        parent_key: The prefix to prepend to keys (used internally for recursion).
        sep: The separator to join nested keys with.

    Returns:
        A flattened dictionary with single-level keys.
    """
    items: list[tuple[str, Any]] = []
    if isinstance(d, dict):
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, (dict, list)):
                items.extend(flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
    elif isinstance(d, list):
        for i, item in enumerate(d):
            new_key = f"{parent_key}{sep}{i}" if parent_key else str(i)
            if isinstance(item, (dict, list)):
                items.extend(flatten_dict(item, new_key, sep=sep).items())
            else:
                items.append((new_key, item))
    return dict(items)
