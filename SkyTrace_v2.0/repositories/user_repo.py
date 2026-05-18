from extensions import db
from models.user import User
from models.settings import UserSetting
from werkzeug.security import generate_password_hash, check_password_hash
from security_utils import encrypt_secret, decrypt_secret

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


class UserRepository:
    @staticmethod
    def has_users() -> bool:
        return db.session.scalar(db.select(User.id).limit(1)) is not None

    @staticmethod
    def list_users() -> list[dict]:
        users = db.session.scalars(
            db.select(User).order_by(User.created_at.asc(), User.id.asc())
        ).all()
        return [UserRepository._serialize(u) for u in users]

    @staticmethod
    def get_by_id(user_id: int) -> dict | None:
        user = db.session.get(User, int(user_id))
        return UserRepository._serialize(user) if user else None

    @staticmethod
    def get_by_username(username: str) -> dict | None:
        user = db.session.scalar(
            db.select(User).where(User.username == username.strip().lower())
        )
        return UserRepository._serialize(user) if user else None

    @staticmethod
    def verify_credentials(username: str, password: str) -> dict | None:
        user = db.session.scalar(
            db.select(User).where(User.username == username.strip().lower())
        )
        if not user or not check_password_hash(user.password_hash, password or ''):
            return None
        return UserRepository._serialize(user)

    @staticmethod
    def create(username: str, password: str, display_name: str = '', is_admin: bool = False) -> dict:
        normalized = username.strip().lower()
        if len(normalized) < 3 or len(normalized) > 32:
            raise ValueError('Username must be 3-32 characters.')
        allowed = set('abcdefghijklmnopqrstuvwxyz0123456789._-')
        if any(ch not in allowed for ch in normalized):
            raise ValueError('Username can only contain letters, numbers, ., _, -')
        if len(password or '') < 6:
            raise ValueError('Password must be at least 6 characters.')

        existing = db.session.scalar(db.select(User).where(User.username == normalized))
        if existing:
            raise ValueError('Username already exists.')

        user = User(
            username=normalized,
            password_hash=generate_password_hash(password),
            display_name=(display_name or '').strip() or normalized,
            is_admin=bool(is_admin),
        )
        db.session.add(user)
        db.session.flush()
        db.session.add(UserSetting(user_id=user.id))
        db.session.commit()
        return UserRepository._serialize(user)

    @staticmethod
    def delete(user_id: int) -> bool:
        user = db.session.get(User, int(user_id))
        if not user:
            return False
        db.session.delete(user)
        db.session.commit()
        return True

    @staticmethod
    def change_password(user_id: int, new_password: str) -> bool:
        if not new_password or len(new_password) < 6:
            raise ValueError('Password must be at least 6 characters.')
        user = db.session.get(User, int(user_id))
        if not user:
            return False
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        return True

    @staticmethod
    def _serialize(user: User) -> dict:
        return {
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name or user.username,
            'is_admin': bool(user.is_admin),
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }


class SettingsRepository:
    @staticmethod
    def get(user_id: int) -> dict:
        settings = db.session.scalar(
            db.select(UserSetting).where(UserSetting.user_id == user_id)
        )
        return SettingsRepository._to_dict(settings)

    @staticmethod
    def save(user_id: int, new_settings: dict) -> dict:
        settings = db.session.scalar(
            db.select(UserSetting).where(UserSetting.user_id == user_id)
        )
        if not settings:
            settings = UserSetting(user_id=user_id)
            db.session.add(settings)
            db.session.flush()

        for key, value in (new_settings or {}).items():
            if key not in DEFAULT_USER_SETTINGS:
                continue
            if isinstance(value, str) and '****' in value:
                continue
            if key in SECRET_SETTING_FIELDS:
                setattr(settings, key, encrypt_secret((value or '').strip()))
            else:
                setattr(settings, key, value)
        db.session.commit()
        return SettingsRepository._to_dict(settings)

    @staticmethod
    def ensure_exists(user_id: int):
        settings = db.session.scalar(
            db.select(UserSetting).where(UserSetting.user_id == user_id)
        )
        if not settings:
            settings = UserSetting(user_id=user_id)
            db.session.add(settings)
            db.session.flush()
        return settings

    @staticmethod
    def _to_dict(settings: UserSetting | None) -> dict:
        base = dict(DEFAULT_USER_SETTINGS)
        if not settings:
            return base
        base.update({
            'aviationstack_key': decrypt_secret(settings.aviationstack_key or ''),
            'airlabs_key': decrypt_secret(settings.airlabs_key or ''),
            'aerodata_key': decrypt_secret(settings.aerodata_key or ''),
            'github_backup_token': decrypt_secret(settings.github_backup_token or ''),
            'github_backup_repo': settings.github_backup_repo or 'LeeLe1001/SkyTrace',
            'preferred_api': settings.preferred_api or 'auto',
            'auto_cache': bool(settings.auto_cache),
        })
        return base
