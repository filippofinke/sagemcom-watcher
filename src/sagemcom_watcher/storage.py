"""Storage and history record management for Sagemcom Watcher."""

import contextlib
import datetime
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


class HistoryStore:
    """Manages reading, writing, and updating the router info history database."""

    def __init__(self, filepath: str) -> None:
        """Initializes the HistoryStore with the database file path.

        Args:
            filepath: Path to the history JSON file (metadata).
        """
        self.filepath = filepath
        self._metadata: dict[str, Any] = {"constants": {}, "promoted_constants": {}}
        self._current_day: str = ""
        self._current_history: list[dict[str, Any]] = []

    def load(self) -> None:
        """Loads existing history and metadata from the JSON file on startup.

        Performs auto-migration if the old monolithic file format is detected.
        """
        if not os.path.exists(self.filepath):
            logger.info("No history file found at %s. Starting fresh.", self.filepath)
            return

        try:
            if os.path.getsize(self.filepath) == 0:
                logger.info(
                    "History file %s is empty. Starting fresh.",
                    self.filepath,
                )
                return
            with open(self.filepath, encoding="utf-8") as f:
                loaded = json.load(f)

            if isinstance(loaded, dict) and "history" in loaded:
                logger.info("Old monolithic history file detected. Initiating migration...")
                self._migrate_old_format(loaded)
            elif isinstance(loaded, dict) and "constants" in loaded:
                self._metadata = loaded
                self._metadata.setdefault("promoted_constants", {})
                logger.info(
                    "Loaded metadata with %d constants and %d promoted constants.",
                    len(self._metadata["constants"]),
                    len(self._metadata["promoted_constants"]),
                )
            else:
                logger.warning(
                    "Invalid format in %s, starting fresh.",
                    self.filepath,
                )

            self._check_and_run_auto_prune()
        except Exception as e:
            logger.error("Error reading %s, starting fresh: %s", self.filepath, e)

    def _migrate_old_format(self, old_data: dict[str, Any]) -> None:
        """Migrates old monolithic history data to chunked daily files.

        Args:
            old_data: Loaded data dictionary in the old format.
        """
        chunks_dir = self._chunks_dir()
        os.makedirs(chunks_dir, exist_ok=True)

        history_list = old_data.get("history", [])
        logger.info("Migrating %d total history points...", len(history_list))

        grouped_history: dict[str, list[dict[str, Any]]] = {}
        for entry in history_list:
            timestamp = entry.get("timestamp")
            if timestamp:
                day = timestamp[:10]
                grouped_history.setdefault(day, []).append(entry)

        for day, entries in grouped_history.items():
            chunk_path = os.path.join(chunks_dir, f"history_{day}.json")
            try:
                with open(chunk_path, "w", encoding="utf-8") as f:
                    json.dump(entries, f, indent=2)
            except OSError as e:
                logger.error("Failed to write migrated chunk for %s: %s", day, e)

        self._metadata = {
            "constants": old_data.get("constants", {}),
            "promoted_constants": {},
        }

        backup_path = self.filepath + ".bak"
        try:
            if os.path.exists(self.filepath):
                os.rename(self.filepath, backup_path)
                logger.info("Monolithic file backed up to %s", backup_path)
        except OSError as e:
            logger.error("Failed to back up old history file: %s", e)

        self._save_metadata()
        logger.info("Migration to daily chunked files completed successfully.")

    def _chunks_dir(self) -> str:
        """Returns the directory path holding daily history chunks."""
        base_dir = os.path.dirname(os.path.abspath(self.filepath))
        return os.path.join(base_dir, "history_chunks")

    def _get_chunk_filepath(self, day: str) -> str:
        """Gets the file path for a daily history chunk."""
        chunks_dir = self._chunks_dir()
        os.makedirs(chunks_dir, exist_ok=True)
        return os.path.join(chunks_dir, f"history_{day}.json")

    def _list_chunk_files(self) -> list[str]:
        """Returns sorted chunk filenames for deterministic iteration."""
        chunks_dir = self._chunks_dir()
        if not os.path.exists(chunks_dir):
            return []
        return sorted(
            name
            for name in os.listdir(chunks_dir)
            if name.startswith("history_") and name.endswith(".json")
        )

    def _load_chunk(self, day: str) -> list[dict[str, Any]]:
        """Loads a daily history chunk from disk."""
        path = self._get_chunk_filepath(day)
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, json.JSONDecodeError) as e:
                logger.error("Failed to load history chunk for %s: %s", day, e)
        return []

    def _save_current_chunk(self) -> None:
        """Saves the current in-memory history chunk to disk atomically."""
        if not self._current_day:
            return
        path = self._get_chunk_filepath(self._current_day)
        temp_file = path + ".tmp"
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self._current_history, f, indent=2)
            os.replace(temp_file, path)
        except OSError as e:
            logger.error("Failed to save history chunk for %s: %s", self._current_day, e)
            if os.path.exists(temp_file):
                with contextlib.suppress(OSError):
                    os.remove(temp_file)

    def _save_metadata(self) -> None:
        """Saves the current metadata structure to disk atomically."""
        temp_file = self.filepath + ".tmp"
        try:
            os.makedirs(os.path.dirname(os.path.abspath(self.filepath)), exist_ok=True)
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self._metadata, f, indent=2)
            os.replace(temp_file, self.filepath)
        except OSError as e:
            logger.error("Failed to write metadata to %s: %s", self.filepath, e)
            if os.path.exists(temp_file):
                with contextlib.suppress(OSError):
                    os.remove(temp_file)

    def get_data(
        self,
        start_str: str | None = None,
        end_str: str | None = None,
        hours: float | None = None,
    ) -> dict[str, Any]:
        """Loads and returns history data filtered by start, end, or hours.

        Args:
            start_str: ISO format timestamp start boundary.
            end_str: ISO format timestamp end boundary.
            hours: Filter to last N hours.

        Returns:
            A dictionary containing constants, promoted_constants, and the
            filtered history list.
        """
        now = datetime.datetime.now(datetime.UTC)
        start_dt: datetime.datetime | None = None
        end_dt: datetime.datetime | None = None

        if hours is not None:
            start_dt = now - datetime.timedelta(hours=hours)
            end_dt = now
        else:
            if start_str:
                with contextlib.suppress(ValueError):
                    start_dt = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            if end_str:
                with contextlib.suppress(ValueError):
                    end_dt = datetime.datetime.fromisoformat(end_str.replace("Z", "+00:00"))

        chunk_dates: list[str] = []
        for name in self._list_chunk_files():
            date_part = name[8:-5]  # history_YYYY-MM-DD.json -> YYYY-MM-DD
            chunk_dates.append(date_part)

        history: list[dict[str, Any]] = []
        for date_str in chunk_dates:
            try:
                chunk_date = datetime.date.fromisoformat(date_str)
            except ValueError:
                continue

            if start_dt is not None and start_dt.date() > chunk_date:
                continue
            if end_dt is not None and end_dt.date() < chunk_date:
                continue

            chunk_history = self._load_chunk(date_str)
            for entry in chunk_history:
                entry_ts = entry.get("timestamp")
                if entry_ts:
                    try:
                        entry_dt = datetime.datetime.fromisoformat(
                            entry_ts.replace("Z", "+00:00")
                        )
                        if start_dt is not None and entry_dt < start_dt:
                            continue
                        if end_dt is not None and entry_dt > end_dt:
                            continue
                    except ValueError:
                        pass
                # Copy dict to prevent cache mutation during backfilling.
                history.append(dict(entry))

        history.sort(key=lambda x: x.get("timestamp", ""))

        return {
            "constants": self._metadata.get("constants", {}),
            "promoted_constants": self._metadata.get("promoted_constants", {}),
            "history": history,
        }

    def add_entry(self, new_entry: dict[str, Any]) -> None:
        """Adds a new history entry, separating constant and dynamic keys.

        The ``timestamp`` key is popped from ``new_entry`` as a side effect; pass
        a copy if you need to reuse the input dictionary afterwards.

        Args:
            new_entry: Flattened dictionary of the new router stats.
        """
        timestamp = new_entry.pop("timestamp", None)
        if not timestamp:
            timestamp = datetime.datetime.now(datetime.UTC).isoformat()

        entry_day = timestamp[:10]

        if entry_day != self._current_day:
            if self._current_day:
                self._save_current_chunk()
            self._current_day = entry_day
            self._current_history = self._load_chunk(entry_day)

        constants = self._metadata.setdefault("constants", {})
        promoted_constants = self._metadata.setdefault("promoted_constants", {})

        # First ever entry: store everything as constants, history gets just the timestamp.
        if not constants and not promoted_constants and not self._current_history:
            self._metadata["constants"] = dict(new_entry)
            self._current_history = [{"timestamp": timestamp}]
            self._save_metadata()
            self._save_current_chunk()
            return

        new_dynamic_entry: dict[str, Any] = {"timestamp": timestamp}
        metadata_changed = False

        for k, v in new_entry.items():
            if k in constants:
                if constants[k] != v:
                    old_val = constants.pop(k)
                    promoted_constants[k] = old_val
                    new_dynamic_entry[k] = v
                    metadata_changed = True
            else:
                if k in promoted_constants:
                    last_val = None
                    for entry in reversed(self._current_history):
                        if k in entry:
                            last_val = entry[k]
                            break
                    else:
                        last_val = promoted_constants.get(k, None)

                    if v != last_val:
                        new_dynamic_entry[k] = v
                else:
                    constants[k] = v
                    metadata_changed = True

        missing_keys = set(constants.keys()) - set(new_entry.keys())
        for k in missing_keys:
            old_val = constants.pop(k)
            promoted_constants[k] = old_val
            new_dynamic_entry[k] = None
            metadata_changed = True

        for k in promoted_constants:
            if k not in new_entry:
                last_val = None
                for entry in reversed(self._current_history):
                    if k in entry:
                        last_val = entry[k]
                        break
                else:
                    last_val = promoted_constants.get(k, None)

                if last_val is not None:
                    new_dynamic_entry[k] = None

        if metadata_changed:
            self._save_metadata()

        self._current_history.append(new_dynamic_entry)
        self._save_current_chunk()

    def save(self) -> None:
        """Saves metadata and the active current daily chunk to disk."""
        self._save_metadata()
        self._save_current_chunk()

    def _check_and_run_auto_prune(self) -> None:
        """Triggers a one-shot prune if any chunk still contains constant keys."""
        constants = self._metadata.get("constants", {})
        if not constants:
            return

        chunks_dir = self._chunks_dir()
        if not os.path.exists(chunks_dir):
            return

        needs_pruning = False
        try:
            for name in self._list_chunk_files():
                chunk_path = os.path.join(chunks_dir, name)
                with open(chunk_path, encoding="utf-8") as f:
                    chunk_records = json.load(f)
                if chunk_records:
                    first_rec = chunk_records[0]
                    if any(k in first_rec for k in constants):
                        needs_pruning = True
                    break
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Failed to check if pruning is needed: %s", e)

        if needs_pruning:
            self._auto_prune_database()

    def _auto_prune_database(self) -> None:
        """Automatically prunes constants and redundant values from chunks on startup."""
        logger.info("Unpruned database detected. Initiating automatic pruning migration...")

        constants = self._metadata.get("constants", {})
        promoted_constants = self._metadata.get("promoted_constants", {})

        chunks_dir = self._chunks_dir()
        if not os.path.exists(chunks_dir):
            return

        chunk_files = self._list_chunk_files()
        all_records: list[dict[str, Any]] = []
        chunk_data: dict[str, list[dict[str, Any]]] = {}
        for f in chunk_files:
            p = os.path.join(chunks_dir, f)
            try:
                with open(p, encoding="utf-8") as file:
                    data = json.load(file)
                chunk_data[f] = data
                all_records.extend(data)
            except (OSError, json.JSONDecodeError) as e:
                logger.error("Failed to load chunk %s for pruning: %s", f, e)

        all_keys = set(constants.keys()) | set(promoted_constants.keys())
        for r in all_records:
            all_keys.update(r.keys())
        all_keys.discard("timestamp")

        key_non_none_values: dict[str, set[Any]] = {}
        for k, v in constants.items():
            if v is not None:
                key_non_none_values[k] = {v}
        for k, v in promoted_constants.items():
            if v is not None:
                key_non_none_values[k] = {v}

        for r in all_records:
            for k, v in r.items():
                if k == "timestamp" or v is None:
                    continue
                if k not in key_non_none_values:
                    key_non_none_values[k] = {v}
                else:
                    key_non_none_values[k].add(v)

        new_constants: dict[str, Any] = {}
        new_promoted_constants: dict[str, Any] = {}

        for k in all_keys:
            vals = key_non_none_values.get(k, set())
            if len(vals) > 1:
                if k in promoted_constants:
                    fallback = promoted_constants[k]
                elif k in constants:
                    fallback = constants[k]
                else:
                    fallback = next(iter(vals), None)
                new_promoted_constants[k] = fallback
            else:
                val = next(iter(vals), None)
                new_constants[k] = val

        last_values: dict[str, Any] = {}
        global_index = 0

        for f in chunk_files:
            pruned_records: list[dict[str, Any]] = []
            for r in chunk_data.get(f, []):
                pruned_r: dict[str, Any] = {"timestamp": r["timestamp"]}
                for k in new_promoted_constants:
                    val = r.get(k, None)

                    if global_index == 0:
                        fallback = new_promoted_constants.get(k)
                        if val != fallback:
                            pruned_r[k] = val
                            last_values[k] = val
                        else:
                            last_values[k] = fallback
                    else:
                        prev_val = last_values.get(k)
                        if val != prev_val:
                            pruned_r[k] = val
                            last_values[k] = val

                pruned_records.append(pruned_r)
                global_index += 1

            p = os.path.join(chunks_dir, f)
            temp_file = p + ".tmp"
            try:
                with open(temp_file, "w", encoding="utf-8") as file:
                    json.dump(pruned_records, file, indent=2)
                os.replace(temp_file, p)
            except OSError as e:
                logger.error("Failed to save pruned chunk %s: %s", f, e)

        self._metadata = {
            "constants": new_constants,
            "promoted_constants": new_promoted_constants,
        }
        self._save_metadata()
        logger.info(
            "Automatic pruning completed: %d constants, %d promoted constants.",
            len(new_constants),
            len(new_promoted_constants),
        )
