from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from security_utils import decrypt_secret, encrypt_secret
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from werkzeug.security import check_password_hash, generate_password_hash


DEFAULT_USER_SETTINGS = {
    "aviationstack_key": "",
    "airlabs_key": "",
    "aerodata_key": "",
    "github_backup_token": "",
    "github_backup_repo": "LeeLe1001/SkyTrace",
    "preferred_api": "auto",
    "auto_cache": True,
}

SECRET_SETTING_FIELDS = ("aviationstack_key", "airlabs_key", "aerodata_key", "github_backup_token")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    settings: Mapped["UserSetting"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    flights: Mapped[list["Flight"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSetting(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    aviationstack_key: Mapped[str] = mapped_column(Text, default="")
    airlabs_key: Mapped[str] = mapped_column(Text, default="")
    aerodata_key: Mapped[str] = mapped_column(Text, default="")
    github_backup_token: Mapped[str] = mapped_column(Text, default="")
    github_backup_repo: Mapped[str] = mapped_column(String(255), default="LeeLe1001/SkyTrace")
    preferred_api: Mapped[str] = mapped_column(String(32), default="auto")
    auto_cache: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User] = relationship(back_populates="settings")


class Flight(Base):
    __tablename__ = "flights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    flight_no: Mapped[str] = mapped_column(String(32), default="")
    airline: Mapped[str] = mapped_column(String(255), default="")
    departure: Mapped[str] = mapped_column(String(16), default="")
    arrival: Mapped[str] = mapped_column(String(16), default="")
    date: Mapped[str] = mapped_column(String(16), default="")
    dep_time: Mapped[str] = mapped_column(String(16), default="")
    arr_time: Mapped[str] = mapped_column(String(16), default="")
    dep_terminal: Mapped[str] = mapped_column(String(32), default="")
    arr_terminal: Mapped[str] = mapped_column(String(32), default="")
    dep_gate: Mapped[str] = mapped_column(String(32), default="")
    arr_gate: Mapped[str] = mapped_column(String(32), default="")
    aircraft: Mapped[str] = mapped_column(String(120), default="")
    seat: Mapped[str] = mapped_column(String(32), default="")
    cabin_class: Mapped[str] = mapped_column(String(32), default="economy")
    notes: Mapped[str] = mapped_column(Text, default="")
    stopover: Mapped[str] = mapped_column(String(16), default="")
    arr_day_offset: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
    connected_group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User] = relationship(back_populates="flights")


_ENGINE = None
_SESSION_FACTORY = None
_DATABASE_URL = None


def _run_schema_migrations(engine) -> None:
    inspector = inspect(engine)
    if "user_settings" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("user_settings")}
    statements = []
    if "github_backup_token" not in existing_columns:
        statements.append("ALTER TABLE user_settings ADD COLUMN github_backup_token TEXT DEFAULT ''")
    if "github_backup_repo" not in existing_columns:
        statements.append("ALTER TABLE user_settings ADD COLUMN github_backup_repo VARCHAR(255) DEFAULT 'LeeLe1001/SkyTrace'")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def default_database_url(data_dir: str = "data") -> str:
    env_url = os.environ.get("SKYTRACE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if env_url:
        return env_url
    db_path = Path(data_dir) / "skytrace.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.resolve().as_posix()}"


def configure_database(database_url: str | None = None) -> str:
    global _ENGINE, _SESSION_FACTORY, _DATABASE_URL

    target_url = database_url or default_database_url()
    connect_args = {"check_same_thread": False} if target_url.startswith("sqlite") else {}

    if _ENGINE is not None:
        _ENGINE.dispose()

    _ENGINE = create_engine(target_url, future=True, pool_pre_ping=True, connect_args=connect_args)
    _SESSION_FACTORY = sessionmaker(bind=_ENGINE, autoflush=False, expire_on_commit=False, future=True)
    _DATABASE_URL = target_url
    Base.metadata.create_all(_ENGINE)
    _run_schema_migrations(_ENGINE)
    return target_url


def get_database_url() -> str:
    if _DATABASE_URL is None:
        return configure_database()
    return _DATABASE_URL


def get_session():
    if _SESSION_FACTORY is None:
        configure_database()
    return _SESSION_FACTORY()


def reset_database() -> None:
    global _ENGINE
    if _ENGINE is None:
        configure_database()
    Base.metadata.drop_all(_ENGINE)
    Base.metadata.create_all(_ENGINE)


def has_users() -> bool:
    with get_session() as db:
        return db.scalar(select(User.id).limit(1)) is not None


def _normalize_username(username: str) -> str:
    return (username or "").strip().lower()


def _normalize_display_name(display_name: str, username: str) -> str:
    value = (display_name or "").strip()
    return value or username


def _validate_username(username: str) -> str:
    normalized = _normalize_username(username)
    if len(normalized) < 3 or len(normalized) > 32:
        raise ValueError("Username must be 3-32 characters.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
    if any(ch not in allowed for ch in normalized):
        raise ValueError("Username can only contain letters, numbers, ., _, -")
    return normalized


def _serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name or user.username,
        "is_admin": bool(user.is_admin),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _settings_to_dict(settings: UserSetting | None, defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    base = dict(DEFAULT_USER_SETTINGS)
    if defaults:
        base.update(defaults)
    if settings is None:
        return base
    base.update(
        {
            "aviationstack_key": decrypt_secret(settings.aviationstack_key or ""),
            "airlabs_key": decrypt_secret(settings.airlabs_key or ""),
            "aerodata_key": decrypt_secret(settings.aerodata_key or ""),
            "github_backup_token": decrypt_secret(settings.github_backup_token or ""),
            "github_backup_repo": settings.github_backup_repo or "LeeLe1001/SkyTrace",
            "preferred_api": settings.preferred_api or "auto",
            "auto_cache": bool(settings.auto_cache),
        }
    )
    return base


def _ensure_user_settings(db, user_id: int) -> UserSetting:
    settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user_id))
    if settings is None:
        settings = UserSetting(user_id=user_id)
        db.add(settings)
        db.flush()
    return settings


def list_users() -> list[dict[str, Any]]:
    with get_session() as db:
        users = db.scalars(select(User).order_by(User.created_at.asc(), User.id.asc())).all()
        return [_serialize_user(user) for user in users]


def get_user_by_id(user_id: int | None) -> dict[str, Any] | None:
    if not user_id:
        return None
    with get_session() as db:
        user = db.get(User, int(user_id))
        return _serialize_user(user) if user else None


def create_user(username: str, password: str, display_name: str = "", is_admin: bool = False) -> dict[str, Any]:
    normalized = _validate_username(username)
    password = password or ""
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")

    with get_session() as db:
        existing = db.scalar(select(User).where(User.username == normalized))
        if existing is not None:
            raise ValueError("Username already exists.")

        user = User(
            username=normalized,
            password_hash=generate_password_hash(password),
            display_name=_normalize_display_name(display_name, normalized),
            is_admin=bool(is_admin),
        )
        db.add(user)
        db.flush()
        db.add(UserSetting(user_id=user.id))
        db.commit()
        db.refresh(user)
        return _serialize_user(user)


def verify_user_credentials(username: str, password: str) -> dict[str, Any] | None:
    normalized = _normalize_username(username)
    with get_session() as db:
        user = db.scalar(select(User).where(User.username == normalized))
        if user is None or not check_password_hash(user.password_hash, password or ""):
            return None
        return _serialize_user(user)


def delete_user(user_id: int) -> bool:
    """Delete a user and all their related data."""
    with get_session() as db:
        user = db.get(User, int(user_id))
        if user is None:
            return False
        db.delete(user)
        db.commit()
        return True


def change_user_password(user_id: int, new_password: str) -> bool:
    """Change a user's password. Returns True on success."""
    if not new_password or len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    with get_session() as db:
        user = db.get(User, int(user_id))
        if user is None:
            return False
        user.password_hash = generate_password_hash(new_password)
        db.commit()
        return True


def get_user_settings(user_id: int, defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    with get_session() as db:
        settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user_id))
        return _settings_to_dict(settings, defaults)


def save_user_settings(user_id: int, new_settings: dict[str, Any], defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    with get_session() as db:
        settings = _ensure_user_settings(db, user_id)
        merged = _settings_to_dict(settings, defaults)
        for key, value in (new_settings or {}).items():
            if key not in merged:
                continue
            if isinstance(value, str) and "****" in value:
                continue
            if key in SECRET_SETTING_FIELDS:
                setattr(settings, key, encrypt_secret((value or "").strip()))
                continue
            setattr(settings, key, value)
        db.commit()
        db.refresh(settings)
        return _settings_to_dict(settings, defaults)


def _normalize_flight_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    data = dict(payload or {})
    return {
        "id": (data.get("id") or str(uuid.uuid4())[:8]).strip(),
        "flight_no": (data.get("flight_no") or "").strip(),
        "airline": (data.get("airline") or "").strip(),
        "departure": (data.get("departure") or "").strip(),
        "arrival": (data.get("arrival") or "").strip(),
        "date": (data.get("date") or "").strip(),
        "dep_time": (data.get("dep_time") or "").strip(),
        "arr_time": (data.get("arr_time") or "").strip(),
        "dep_terminal": (data.get("dep_terminal") or "").strip(),
        "arr_terminal": (data.get("arr_terminal") or "").strip(),
        "dep_gate": (data.get("dep_gate") or "").strip(),
        "arr_gate": (data.get("arr_gate") or "").strip(),
        "aircraft": (data.get("aircraft") or "").strip(),
        "seat": (data.get("seat") or "").strip(),
        "cabin_class": (data.get("class") or data.get("cabin_class") or "economy").strip() or "economy",
        "notes": (data.get("notes") or "").strip(),
        "stopover": (data.get("stopover") or "").strip(),
        "arr_day_offset": int(data.get("arr_day_offset") or 0),
        "status": (data.get("status") or "scheduled").strip() or "scheduled",
        "connected_group": (data.get("connected_group") or "").strip() or None,
    }


def _serialize_flight(flight: Flight) -> dict[str, Any]:
    return {
        "id": flight.id,
        "flight_no": flight.flight_no or "",
        "airline": flight.airline or "",
        "departure": flight.departure or "",
        "arrival": flight.arrival or "",
        "date": flight.date or "",
        "dep_time": flight.dep_time or "",
        "arr_time": flight.arr_time or "",
        "dep_terminal": flight.dep_terminal or "",
        "arr_terminal": flight.arr_terminal or "",
        "dep_gate": flight.dep_gate or "",
        "arr_gate": flight.arr_gate or "",
        "aircraft": flight.aircraft or "",
        "seat": flight.seat or "",
        "class": flight.cabin_class or "economy",
        "notes": flight.notes or "",
        "stopover": flight.stopover or "",
        "arr_day_offset": flight.arr_day_offset or 0,
        "status": flight.status or "scheduled",
        "connected_group": flight.connected_group,
    }


def list_user_flights(user_id: int) -> list[dict[str, Any]]:
    with get_session() as db:
        flights = db.scalars(
            select(Flight).where(Flight.user_id == user_id).order_by(Flight.created_at.asc(), Flight.id.asc())
        ).all()
        return [_serialize_flight(flight) for flight in flights]


def add_user_flight(user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_flight_payload(payload)
    with get_session() as db:
        flight = Flight(user_id=user_id, **normalized)
        db.add(flight)
        db.commit()
        db.refresh(flight)
        return _serialize_flight(flight)


def update_user_flight(user_id: int, flight_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    normalized = _normalize_flight_payload({**(payload or {}), "id": flight_id})
    with get_session() as db:
        flight = db.scalar(select(Flight).where(Flight.user_id == user_id, Flight.id == flight_id))
        if flight is None:
            return None
        for key, value in normalized.items():
            if key == "id":
                continue
            setattr(flight, key if key != "cabin_class" else "cabin_class", value)
        db.commit()
        db.refresh(flight)
        return _serialize_flight(flight)


def delete_user_flight(user_id: int, flight_id: str) -> bool:
    with get_session() as db:
        flight = db.scalar(select(Flight).where(Flight.user_id == user_id, Flight.id == flight_id))
        if flight is None:
            return False
        db.delete(flight)
        db.commit()
        return True


def connect_user_flights(user_id: int, flight_ids: list[str]) -> str | None:
    if len(flight_ids) < 2:
        return None
    with get_session() as db:
        flights = db.scalars(select(Flight).where(Flight.user_id == user_id)).all()
        existing_groups = {flight.connected_group for flight in flights if flight.id in flight_ids and flight.connected_group}
        if existing_groups:
            group_id = sorted(existing_groups)[0]
            for flight in flights:
                if flight.connected_group in existing_groups:
                    flight.connected_group = group_id
        else:
            group_id = str(uuid.uuid4())[:8]

        for flight in flights:
            if flight.id in flight_ids:
                flight.connected_group = group_id

        db.commit()
        return group_id


def disconnect_user_flights(user_id: int, group_id: str = "", flight_ids: list[str] | None = None) -> bool:
    target_ids = set(flight_ids or [])
    if not group_id and not target_ids:
        return False

    with get_session() as db:
        flights = db.scalars(select(Flight).where(Flight.user_id == user_id)).all()

        if target_ids:
            affected_groups = set()
            for flight in flights:
                if flight.id in target_ids and flight.connected_group:
                    affected_groups.add(flight.connected_group)
                    flight.connected_group = None
            for current_group in affected_groups:
                remaining = [flight for flight in flights if flight.connected_group == current_group]
                if len(remaining) <= 1:
                    for flight in remaining:
                        flight.connected_group = None
        else:
            for flight in flights:
                if flight.connected_group == group_id:
                    flight.connected_group = None

        db.commit()
        return True


def find_user_flight_by_number(user_id: int, flight_no: str) -> dict[str, Any] | None:
    normalized = (flight_no or "").strip().upper().replace(" ", "").replace("-", "")
    if not normalized:
        return None

    with get_session() as db:
        flights = db.scalars(select(Flight).where(Flight.user_id == user_id)).all()
        for flight in flights:
            candidate = (flight.flight_no or "").strip().upper().replace(" ", "").replace("-", "")
            if candidate == normalized:
                return _serialize_flight(flight)
    return None


def _load_json_file(filepath: str) -> dict[str, Any]:
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return {}


def bootstrap_admin_user(
    username: str,
    password: str,
    display_name: str = "",
    legacy_flights_file: str | None = None,
    legacy_settings_file: str | None = None,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if has_users():
        raise ValueError("Setup has already been completed.")

    admin = create_user(username=username, password=password, display_name=display_name, is_admin=True)
    import_legacy_data_for_user(
        user_id=admin["id"],
        legacy_flights_file=legacy_flights_file,
        legacy_settings_file=legacy_settings_file,
        defaults=defaults,
    )
    return admin


def import_legacy_data_for_user(
    user_id: int,
    legacy_flights_file: str | None = None,
    legacy_settings_file: str | None = None,
    defaults: dict[str, Any] | None = None,
) -> None:
    defaults = defaults or DEFAULT_USER_SETTINGS
    legacy_flights = _load_json_file(legacy_flights_file) if legacy_flights_file else {}
    legacy_settings = _load_json_file(legacy_settings_file) if legacy_settings_file else {}

    with get_session() as db:
        existing = db.scalar(select(Flight.id).where(Flight.user_id == user_id).limit(1))
        if existing is None:
            for raw in legacy_flights.get("flights", []):
                normalized = _normalize_flight_payload(raw)
                db.add(Flight(user_id=user_id, **normalized))

        settings = _ensure_user_settings(db, user_id)
        merged = dict(defaults)
        merged.update(legacy_settings or {})
        settings.aviationstack_key = encrypt_secret(merged.get("aviationstack_key", ""))
        settings.airlabs_key = encrypt_secret(merged.get("airlabs_key", ""))
        settings.aerodata_key = encrypt_secret(merged.get("aerodata_key", ""))
        settings.github_backup_token = encrypt_secret(merged.get("github_backup_token", ""))
        settings.github_backup_repo = merged.get("github_backup_repo", "LeeLe1001/SkyTrace")
        settings.preferred_api = merged.get("preferred_api", "auto")
        settings.auto_cache = bool(merged.get("auto_cache", True))
        db.commit()


def replace_user_flights(user_id: int, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_payloads = [_normalize_flight_payload(payload) for payload in (payloads or [])]
    with get_session() as db:
        db.query(Flight).filter(Flight.user_id == user_id).delete()
        for payload in normalized_payloads:
            db.add(Flight(user_id=user_id, **payload))
        db.commit()
        flights = db.scalars(
            select(Flight).where(Flight.user_id == user_id).order_by(Flight.created_at.asc(), Flight.id.asc())
        ).all()
        return [_serialize_flight(flight) for flight in flights]
