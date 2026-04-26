from __future__ import annotations

import base64
import hashlib
import os
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


SECRET_PREFIX = "enc:v1:"


def _normalize_fernet_key(raw_key: str) -> bytes:
    candidate = (raw_key or "").strip().encode("utf-8")
    try:
        Fernet(candidate)
        return candidate
    except Exception:
        digest = hashlib.sha256(candidate).digest()
        return base64.urlsafe_b64encode(digest)


def _load_or_create_encryption_key(data_dir: str = "data") -> bytes:
    env_key = os.environ.get("SKYTRACE_ENCRYPTION_KEY")
    if env_key:
        return _normalize_fernet_key(env_key)

    key_path = Path(data_dir) / "encryption_key.txt"
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        return _normalize_fernet_key(key_path.read_text(encoding="utf-8").strip())

    generated = Fernet.generate_key()
    key_path.write_text(generated.decode("utf-8"), encoding="utf-8")
    return generated


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    return Fernet(_load_or_create_encryption_key())


def is_encrypted_secret(value: str) -> bool:
    return bool(value) and value.startswith(SECRET_PREFIX)


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    if is_encrypted_secret(value):
        return value
    token = get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{SECRET_PREFIX}{token}"


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    if not is_encrypted_secret(value):
        return value

    token = value[len(SECRET_PREFIX):]
    try:
        return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""
