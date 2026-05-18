from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder


UTC = timezone.utc
TIMEZONE_FILE = Path("data") / "airport_timezones.json"
_TIMEZONE_FINDER = TimezoneFinder(in_memory=True)


def _load_timezone_map(filepath: str | Path = TIMEZONE_FILE) -> dict[str, str]:
    path = Path(filepath)
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    return {
        code: tz
        for code, tz in payload.items()
        if code and not str(code).startswith("_") and isinstance(tz, str) and tz
    }


def infer_timezone_name(airport_code: str = "", airport: dict[str, Any] | None = None) -> str:
    airport = airport or {}
    timezone_name = (airport.get("timezone") or "").strip()
    if timezone_name:
        return timezone_name

    code = (airport_code or "").strip().upper()
    if code:
        timezone_name = _load_timezone_map().get(code, "")
        if timezone_name:
            return timezone_name

    lat = airport.get("lat")
    lon = airport.get("lon")
    if lat is None or lon is None:
        return ""

    try:
        return _TIMEZONE_FINDER.timezone_at(lng=float(lon), lat=float(lat)) or ""
    except (TypeError, ValueError):
        return ""


def attach_airport_timezones(airports_data: dict[str, Any]) -> dict[str, Any]:
    timezone_map = _load_timezone_map()
    for code, airport in airports_data.items():
        if not isinstance(airport, dict) or str(code).startswith("_"):
            continue
        if airport.get("timezone"):
            continue
        timezone_name = timezone_map.get(code) or infer_timezone_name(code, airport)
        if timezone_name:
            airport["timezone"] = timezone_name
    return airports_data


def generate_airport_timezone_map(airports_data: dict[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for code, airport in airports_data.items():
        if not isinstance(airport, dict) or str(code).startswith("_"):
            continue
        timezone_name = infer_timezone_name(code, airport)
        if timezone_name:
            mapping[code] = timezone_name
    return mapping


def save_airport_timezone_map(
    airports_data: dict[str, Any],
    filepath: str | Path = TIMEZONE_FILE,
) -> dict[str, str]:
    mapping = generate_airport_timezone_map(airports_data)
    payload = {"_meta": {"generated_at": datetime.utcnow().isoformat() + "Z", "count": len(mapping)}}
    payload.update(dict(sorted(mapping.items())))

    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    return mapping


def _parse_flight_date(date_str: str) -> date | None:
    try:
        return datetime.strptime((date_str or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_clock(clock_str: str) -> time | None:
    try:
        return datetime.strptime((clock_str or "").strip(), "%H:%M").time()
    except ValueError:
        return None


def _resolve_zone(timezone_name: str) -> ZoneInfo | None:
    if not timezone_name:
        return None
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        return None


def _localize_datetime(base_date: date, clock: time, zone: ZoneInfo) -> datetime:
    return datetime.combine(base_date, clock).replace(tzinfo=zone)


def resolve_flight_timeline(
    flight: dict[str, Any],
    airports_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    airports_data = airports_data or {}
    flight_date = _parse_flight_date(flight.get("date", ""))
    dep_clock = _parse_clock(flight.get("dep_time", ""))
    arr_clock = _parse_clock(flight.get("arr_time") or flight.get("dep_time") or "")
    if flight_date is None or dep_clock is None or arr_clock is None:
        return None

    dep_airport = flight.get("dep_airport") or airports_data.get(flight.get("departure", ""), {})
    arr_airport = flight.get("arr_airport") or airports_data.get(flight.get("arrival", ""), {})
    dep_timezone_name = infer_timezone_name(flight.get("departure", ""), dep_airport)
    arr_timezone_name = infer_timezone_name(flight.get("arrival", ""), arr_airport) or dep_timezone_name
    dep_zone = _resolve_zone(dep_timezone_name)
    arr_zone = _resolve_zone(arr_timezone_name)
    if dep_zone is None or arr_zone is None:
        return None

    dep_local = _localize_datetime(flight_date, dep_clock, dep_zone)
    arr_local = _localize_datetime(flight_date, arr_clock, arr_zone)

    explicit_day_offset = int(flight.get("arr_day_offset") or (1 if flight.get("arr_next_day") else 0))
    if explicit_day_offset:
        arr_local += timedelta(days=explicit_day_offset)
    else:
        guard = 0
        dep_utc = dep_local.astimezone(UTC)
        while arr_local.astimezone(UTC) <= dep_utc and guard < 4:
            arr_local += timedelta(days=1)
            guard += 1

    return {
        "flight_date": flight_date,
        "dep_local": dep_local,
        "arr_local": arr_local,
        "dep_utc": dep_local.astimezone(UTC),
        "arr_utc": arr_local.astimezone(UTC),
        "dep_timezone": dep_timezone_name,
        "arr_timezone": arr_timezone_name,
    }


def calculate_duration_minutes(
    flight: dict[str, Any],
    airports_data: dict[str, Any] | None = None,
) -> int | None:
    timeline = resolve_flight_timeline(flight, airports_data=airports_data)
    if not timeline:
        return None

    diff = timeline["arr_utc"] - timeline["dep_utc"]
    minutes = int(round(diff.total_seconds() / 60))
    if minutes <= 0:
        return None
    return minutes
