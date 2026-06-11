"""Unit tests for storage and history management."""

import datetime
import json
import os
import shutil
import tempfile
import unittest

from sagemcom_watcher.storage import HistoryStore


class TestHistoryStore(unittest.TestCase):
    """Test suite for HistoryStore class and the dynamic constant separation algorithm."""

    def setUp(self) -> None:
        """Create a temporary directory for the history database before each test."""
        self.tmp_dir = tempfile.mkdtemp()
        self.history_path = os.path.join(self.tmp_dir, "history.json")
        self.store = HistoryStore(self.history_path)

    def tearDown(self) -> None:
        """Clean up the temporary directory after each test."""
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_empty_load(self) -> None:
        """An empty or missing file should initialize empty data structures."""
        self.store.load()
        data = self.store.get_data()
        self.assertEqual(data["constants"], {})
        self.assertEqual(data["history"], [])

    def test_first_entry_stored_as_constants(self) -> None:
        """The first entry should have all values stored in constants."""
        entry = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        self.store.add_entry(entry)

        data = self.store.get_data()
        self.assertEqual(data["constants"], {"host": "192.168.1.1", "uptime": 100})
        self.assertEqual(data["history"], [{"timestamp": "2026-06-01T12:00:00Z"}])

    def test_subsequent_matching_entry_keeps_constants(self) -> None:
        """Subsequent entries with matching values should keep them as constants."""
        entry1 = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        entry2 = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:02:30Z"}

        self.store.add_entry(entry1)
        self.store.add_entry(entry2)

        data = self.store.get_data()
        self.assertEqual(data["constants"], {"host": "192.168.1.1", "uptime": 100})
        self.assertEqual(
            data["history"],
            [
                {"timestamp": "2026-06-01T12:00:00Z"},
                {"timestamp": "2026-06-01T12:02:30Z"},
            ],
        )

    def test_value_change_promotes_to_dynamic(self) -> None:
        """When a constant value changes, it should be moved to dynamic history with a fallback."""
        entry1 = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        entry2 = {"host": "192.168.1.1", "uptime": 120, "timestamp": "2026-06-01T12:02:30Z"}

        self.store.add_entry(entry1)
        self.store.add_entry(entry2)

        data = self.store.get_data()
        self.assertEqual(data["constants"], {"host": "192.168.1.1"})
        self.assertEqual(data["promoted_constants"], {"uptime": 100})
        self.assertEqual(
            data["history"],
            [
                {"timestamp": "2026-06-01T12:00:00Z"},
                {"timestamp": "2026-06-01T12:02:30Z", "uptime": 120},
            ],
        )

    def test_missing_key_in_new_entry_promotes_to_dynamic(self) -> None:
        """A constant missing in a new entry should be promoted to dynamic with None."""
        entry1 = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        entry2 = {"host": "192.168.1.1", "timestamp": "2026-06-01T12:02:30Z"}

        self.store.add_entry(entry1)
        self.store.add_entry(entry2)

        data = self.store.get_data()
        self.assertEqual(data["constants"], {"host": "192.168.1.1"})
        self.assertEqual(data["promoted_constants"], {"uptime": 100})
        self.assertEqual(
            data["history"],
            [
                {"timestamp": "2026-06-01T12:00:00Z"},
                {"timestamp": "2026-06-01T12:02:30Z", "uptime": None},
            ],
        )

    def test_forward_fill_dynamic_recording(self) -> None:
        """Dynamic values should only be recorded in history when they change from the previous value."""
        entry1 = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        entry2 = {"host": "192.168.1.1", "uptime": 120, "timestamp": "2026-06-01T12:02:30Z"}
        entry3 = {"host": "192.168.1.1", "uptime": 120, "timestamp": "2026-06-01T12:05:00Z"}
        entry4 = {"host": "192.168.1.1", "uptime": 130, "timestamp": "2026-06-01T12:07:30Z"}
        entry5 = {"host": "192.168.1.1", "timestamp": "2026-06-01T12:10:00Z"}
        entry6 = {"host": "192.168.1.1", "timestamp": "2026-06-01T12:12:30Z"}

        for e in (entry1, entry2, entry3, entry4, entry5, entry6):
            self.store.add_entry(e)

        data = self.store.get_data()
        self.assertEqual(
            data["history"],
            [
                {"timestamp": "2026-06-01T12:00:00Z"},
                {"timestamp": "2026-06-01T12:02:30Z", "uptime": 120},
                {"timestamp": "2026-06-01T12:05:00Z"},
                {"timestamp": "2026-06-01T12:07:30Z", "uptime": 130},
                {"timestamp": "2026-06-01T12:10:00Z", "uptime": None},
                {"timestamp": "2026-06-01T12:12:30Z"},
            ],
        )

    def test_save_and_load_roundtrip(self) -> None:
        """Data can be saved to disk and loaded back correctly."""
        entry = {"host": "192.168.1.1", "uptime": 100, "timestamp": "2026-06-01T12:00:00Z"}
        self.store.add_entry(entry)
        self.store.save()

        new_store = HistoryStore(self.history_path)
        new_store.load()

        self.assertEqual(new_store.get_data(), self.store.get_data())

    def test_get_data_with_hours_filter(self) -> None:
        """Filter data by relative hours range."""
        now_ts = datetime.datetime.now(datetime.UTC)
        ts_10h_ago = (now_ts - datetime.timedelta(hours=10)).isoformat()
        ts_2h_ago = (now_ts - datetime.timedelta(hours=2)).isoformat()

        self.store.add_entry({"host": "192.168.1.1", "uptime": 10, "timestamp": ts_10h_ago})
        self.store.add_entry({"host": "192.168.1.1", "uptime": 20, "timestamp": ts_2h_ago})
        self.store.save()

        data = self.store.get_data(hours=5)
        self.assertEqual(len(data["history"]), 1)
        self.assertEqual(data["history"][0]["uptime"], 20)

    def test_get_data_with_range_filter(self) -> None:
        """Filter data by start/end ISO timestamps."""
        ts1 = "2026-06-01T10:00:00Z"
        ts2 = "2026-06-02T12:00:00Z"
        ts3 = "2026-06-03T15:00:00Z"

        self.store.add_entry({"host": "192.168.1.1", "uptime": 10, "timestamp": ts1})
        self.store.add_entry({"host": "192.168.1.1", "uptime": 20, "timestamp": ts2})
        self.store.add_entry({"host": "192.168.1.1", "uptime": 30, "timestamp": ts3})
        self.store.save()

        data = self.store.get_data(
            start_str="2026-06-02T00:00:00Z", end_str="2026-06-04T00:00:00Z"
        )
        self.assertEqual(len(data["history"]), 2)
        uptimes = [item.get("uptime") for item in data["history"]]
        self.assertEqual(sorted(uptimes), [20, 30])

    def test_migration_from_old_format(self) -> None:
        """Migrating old monolithic history JSON structure automatically on load."""
        old_data = {
            "constants": {"host": "192.168.1.1"},
            "history": [
                {"timestamp": "2026-05-01T12:00:00Z", "uptime": 100},
                {"timestamp": "2026-05-01T13:00:00Z", "uptime": 120},
                {"timestamp": "2026-05-02T12:00:00Z", "uptime": 200},
            ],
        }

        with open(self.history_path, "w", encoding="utf-8") as f:
            json.dump(old_data, f)

        migrate_store = HistoryStore(self.history_path)
        migrate_store.load()

        backup_path = self.history_path + ".bak"
        self.assertTrue(os.path.exists(backup_path))

        self.assertEqual(migrate_store._metadata["constants"], {"host": "192.168.1.1"})

        chunk_dir = os.path.join(self.tmp_dir, "history_chunks")
        self.assertTrue(os.path.exists(os.path.join(chunk_dir, "history_2026-05-01.json")))
        self.assertTrue(os.path.exists(os.path.join(chunk_dir, "history_2026-05-02.json")))

        data = migrate_store.get_data()
        self.assertEqual(len(data["history"]), 3)
        self.assertEqual(data["history"][0]["timestamp"], "2026-05-01T12:00:00Z")
        self.assertEqual(data["history"][0]["uptime"], 100)
        self.assertEqual(data["history"][2]["timestamp"], "2026-05-02T12:00:00Z")
        self.assertEqual(data["history"][2]["uptime"], 200)


if __name__ == "__main__":
    unittest.main()
