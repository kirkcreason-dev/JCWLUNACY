#!/usr/bin/env python3
"""
Sanity-check app-content.json before uploading it to jcwlunacy.net.

Usage:  python3 validate-content.py app-content.json

Exits 0 with "LOOKS GOOD" if the feed is safe to publish; prints every
problem and exits 1 otherwise. The Android app tolerates unknown keys and
missing optional fields, but this catches the mistakes that would actually
bite: broken JSON, missing sections, bad divisions/rarities, non-HTTPS URLs.
"""
import json
import sys

REQUIRED_TOP_KEYS = [
    "config", "ticker", "thisWeek", "stats", "news", "episodes",
    "clipsLinks", "events", "annualEvents", "roster", "merch",
    "cards", "locker", "lunatics", "about",
]
DIVISIONS = {"champion", "active", "official", "legend"}
RARITIES = {"standard", "foil", "superRare"}


def main(path: str) -> int:
    problems = []
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001 - report anything
        print(f"FATAL: not valid JSON — {exc}")
        return 1

    for key in REQUIRED_TOP_KEYS:
        if key not in data:
            problems.append(f"missing top-level key: {key}")

    def check_urls(obj, trail=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                check_urls(v, f"{trail}.{k}" if trail else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                check_urls(v, f"{trail}[{i}]")
        elif isinstance(obj, str) and obj.startswith("http://"):
            problems.append(f"non-HTTPS url at {trail}: {obj} (app blocks cleartext)")

    check_urls(data)

    for i, w in enumerate(data.get("roster", [])):
        if w.get("division") not in DIVISIONS:
            problems.append(f"roster[{i}] ({w.get('name')}): bad division {w.get('division')!r}")
        if not w.get("id") or not w.get("name"):
            problems.append(f"roster[{i}]: id and name are required")
    ids = [w.get("id") for w in data.get("roster", [])]
    dupes = {x for x in ids if ids.count(x) > 1}
    if dupes:
        problems.append(f"duplicate roster ids: {sorted(dupes)}")

    for i, c in enumerate(data.get("cards", [])):
        if c.get("rarity") not in RARITIES:
            problems.append(f"cards[{i}] ({c.get('name')}): bad rarity {c.get('rarity')!r}")

    for i, e in enumerate(data.get("events", [])):
        iso = e.get("countdownIso")
        if iso is not None and "T" not in str(iso):
            problems.append(f"events[{i}]: countdownIso should be ISO-8601 with offset, e.g. 2026-08-20T00:00:00-05:00")

    locker = data.get("locker", {})
    for key in ("packCost", "checkInReward", "gameUnlockCost"):
        if not isinstance(locker.get(key), int) or locker.get(key, -1) < 0:
            problems.append(f"locker.{key} must be a non-negative integer")

    if problems:
        print(f"{len(problems)} PROBLEM(S):")
        for p in problems:
            print(f"  ✗ {p}")
        return 1

    print(
        "LOOKS GOOD ·",
        f"{len(data.get('roster', []))} roster ·",
        f"{len(data.get('cards', []))} cards ·",
        f"{len(data.get('events', []))} events ·",
        f"{len(data.get('episodes', []))} episodes ·",
        f"contentVersion {data.get('contentVersion', 1)}",
    )
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
