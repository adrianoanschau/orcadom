"""Grandfather-father-son classification and retention for dump object keys."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

SLOTS = ("daily", "weekly", "monthly")
DUMP_SUFFIX = ".dump.fc.age"
MANIFEST_SUFFIX = ".manifest.json"


def parse_date(value: str):
    return datetime.strptime(value, "%Y-%m-%d").date()


def iso_week_label(value: str) -> str:
    iso = parse_date(value).isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def month_label(value: str) -> str:
    return parse_date(value).strftime("%Y-%m")


def slot_label(slot: str, value: str) -> str:
    if slot == "daily":
        return parse_date(value).isoformat()
    if slot == "weekly":
        return iso_week_label(value)
    if slot == "monthly":
        return month_label(value)
    raise ValueError(f"unknown slot {slot}")


def slots_for_date(value: str) -> list[str]:
    parsed = parse_date(value)
    slots = ["daily"]
    if parsed.isoweekday() == 7:
        slots.append("weekly")
    if parsed.day == 1:
        slots.append("monthly")
    return slots


def object_key(database: str, slot: str, value: str, suffix: str) -> str:
    return f"{slot}/{database}-{slot_label(slot, value)}{suffix}"


def apply_retention(labels: list[str], keep: int) -> tuple[list[str], list[str]]:
    unique = sorted(set(labels))
    if keep <= 0:
        return [], unique
    return unique[-keep:], unique[:-keep]


def labels_from_keys(keys: list[str], database: str, slot: str, suffix: str) -> list[str]:
    prefix = f"{slot}/{database}-"
    labels: list[str] = []
    for key in keys:
        if not key.startswith(prefix) or not key.endswith(suffix):
            continue
        labels.append(key[len(prefix) : -len(suffix)])
    return labels


def _cmd_slots(args: argparse.Namespace) -> int:
    print(" ".join(slots_for_date(args.date)))
    return 0


def _cmd_key(args: argparse.Namespace) -> int:
    print(object_key(args.database, args.slot, args.date, args.suffix))
    return 0


def _cmd_retention(args: argparse.Namespace) -> int:
    keys = [line.strip() for line in sys.stdin if line.strip()]
    labels = labels_from_keys(keys, args.database, args.slot, args.suffix)
    _kept, deleted_labels = apply_retention(labels, args.keep)
    for label in deleted_labels:
        stem = f"{args.slot}/{args.database}-{label}"
        print(f"{stem}{DUMP_SUFFIX}")
        print(f"{stem}{MANIFEST_SUFFIX}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GFS helpers for Orcadom backups")
    sub = parser.add_subparsers(dest="command", required=True)

    slots = sub.add_parser("slots")
    slots.add_argument("date")
    slots.set_defaults(func=_cmd_slots)

    key = sub.add_parser("key")
    key.add_argument("database")
    key.add_argument("slot")
    key.add_argument("date")
    key.add_argument("suffix")
    key.set_defaults(func=_cmd_key)

    retention = sub.add_parser("retention")
    retention.add_argument("database")
    retention.add_argument("slot")
    retention.add_argument("keep", type=int)
    retention.add_argument("suffix")
    retention.set_defaults(func=_cmd_retention)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
