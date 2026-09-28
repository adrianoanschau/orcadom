import unittest

from gfs import (
    DUMP_SUFFIX,
    apply_retention,
    iso_week_label,
    labels_from_keys,
    object_key,
    slots_for_date,
)


class SlotsForDateTest(unittest.TestCase):
    def test_weekday_is_daily_only(self) -> None:
        # Monday
        self.assertEqual(slots_for_date("2026-09-28"), ["daily"])

    def test_sunday_is_daily_and_weekly(self) -> None:
        self.assertEqual(slots_for_date("2026-09-27"), ["daily", "weekly"])

    def test_first_of_month_is_daily_and_monthly(self) -> None:
        # Tuesday 1 Sep 2026
        self.assertEqual(slots_for_date("2026-09-01"), ["daily", "monthly"])

    def test_sunday_first_promotes_all_slots(self) -> None:
        # Sunday 1 Feb 2026
        self.assertEqual(slots_for_date("2026-02-01"), ["daily", "weekly", "monthly"])


class ObjectKeyTest(unittest.TestCase):
    def test_daily_uses_iso_date(self) -> None:
        self.assertEqual(
            object_key("orcadom_db", "daily", "2026-09-28", DUMP_SUFFIX),
            "daily/orcadom_db-2026-09-28.dump.fc.age",
        )

    def test_weekly_uses_iso_week(self) -> None:
        self.assertEqual(iso_week_label("2026-09-27"), "2026-W39")
        self.assertEqual(
            object_key("orcadom_db", "weekly", "2026-09-27", DUMP_SUFFIX),
            "weekly/orcadom_db-2026-W39.dump.fc.age",
        )

    def test_monthly_uses_year_month(self) -> None:
        self.assertEqual(
            object_key("orcadom_db", "monthly", "2026-09-01", DUMP_SUFFIX),
            "monthly/orcadom_db-2026-09.dump.fc.age",
        )


class RetentionTest(unittest.TestCase):
    def test_keeps_the_newest_n(self) -> None:
        labels = [f"2026-09-{day:02d}" for day in range(1, 29)]
        kept, deleted = apply_retention(labels, 7)
        self.assertEqual(kept, [f"2026-09-{day:02d}" for day in range(22, 29)])
        self.assertEqual(len(deleted), 21)
        self.assertEqual(deleted[0], "2026-09-01")

    def test_keep_zero_deletes_all(self) -> None:
        kept, deleted = apply_retention(["2026-09-01", "2026-09-02"], 0)
        self.assertEqual(kept, [])
        self.assertEqual(deleted, ["2026-09-01", "2026-09-02"])

    def test_retention_keys_include_manifest(self) -> None:
        keys = [
            "daily/orcadom_db-2026-09-01.dump.fc.age",
            "daily/orcadom_db-2026-09-01.manifest.json",
            "daily/orcadom_db-2026-09-02.dump.fc.age",
            "daily/orcadom_db-2026-09-02.manifest.json",
            "daily/orcadom_db-2026-09-03.dump.fc.age",
            "daily/orcadom_db-2026-09-03.manifest.json",
        ]
        labels = labels_from_keys(keys, "orcadom_db", "daily", DUMP_SUFFIX)
        kept, deleted = apply_retention(labels, 2)
        self.assertEqual(kept, ["2026-09-02", "2026-09-03"])
        self.assertEqual(deleted, ["2026-09-01"])


if __name__ == "__main__":
    unittest.main()
