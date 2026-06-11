"""Unit tests for utility functions."""

import unittest

from sagemcom_watcher.utils import flatten_dict


class TestFlattenDict(unittest.TestCase):
    """Test suite for the flatten_dict function."""

    def test_flat_dict_remains_unchanged(self) -> None:
        """A simple flat dictionary should remain unchanged."""
        data = {"a": 1, "b": "hello", "c": True}
        self.assertEqual(flatten_dict(data), data)

    def test_nested_dict_is_flattened(self) -> None:
        """Nested dictionaries should have their keys joined by the separator."""
        data = {"a": 1, "b": {"c": 2, "d": {"e": 3}}}
        expected = {"a": 1, "b_c": 2, "b_d_e": 3}
        self.assertEqual(flatten_dict(data), expected)

    def test_list_values_are_flattened(self) -> None:
        """Lists should have their elements flattened with index suffixes."""
        data = {
            "a": [1, 2],
            "b": [{"c": 3}, {"d": 4}],
            "c": [[5, 6]],
        }
        expected = {
            "a_0": 1,
            "a_1": 2,
            "b_0_c": 3,
            "b_1_d": 4,
            "c_0_0": 5,
            "c_0_1": 6,
        }
        self.assertEqual(flatten_dict(data), expected)

    def test_custom_separator(self) -> None:
        """Custom separator should be used to join nested keys."""
        data = {"a": {"b": 1}}
        expected = {"a/b": 1}
        self.assertEqual(flatten_dict(data, sep="/"), expected)


if __name__ == "__main__":
    unittest.main()
