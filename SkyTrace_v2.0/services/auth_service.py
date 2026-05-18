"""
SkyTrace v2.0 — 认证服务
"""
import time
from repositories.user_repo import UserRepository


class AuthService:
    _login_attempts: dict[str, list[float]] = {}
    _max_attempts = 10
    _window_seconds = 300

    @classmethod
    def check_rate_limit(cls, key: str) -> bool:
        now = time.time()
        attempts = [t for t in cls._login_attempts.get(key, []) if now - t < cls._window_seconds]
        cls._login_attempts[key] = attempts
        return len(attempts) < cls._max_attempts

    @classmethod
    def record_attempt(cls, key: str):
        now = time.time()
        cls._login_attempts.setdefault(key, []).append(now)

    @classmethod
    def is_legacy_mode(cls) -> bool:
        return not UserRepository.has_users()

    @classmethod
    def setup_admin(cls, username: str, password: str, display_name: str = '') -> dict:
        if not cls.is_legacy_mode():
            raise ValueError('Setup has already been completed.')
        return UserRepository.create(username, password, display_name, is_admin=True)

    @classmethod
    def login(cls, username: str, password: str, client_ip: str = 'unknown') -> dict:
        if not cls.check_rate_limit(client_ip):
            raise ValueError('Too many login attempts. Please try again later.')
        user = UserRepository.verify_credentials(username, password)
        if not user:
            cls.record_attempt(client_ip)
            raise ValueError('Invalid username or password.')
        return user

    @classmethod
    def change_password(cls, user_id: int, new_password: str):
        if not new_password or len(new_password) < 6:
            raise ValueError('Password must be at least 6 characters.')
        if not UserRepository.change_password(user_id, new_password):
            raise ValueError('User not found.')

    @classmethod
    def admin_create_user(cls, username: str, password: str, display_name: str = '',
                          is_admin: bool = False) -> dict:
        return UserRepository.create(username, password, display_name, is_admin)

    @classmethod
    def admin_delete_user(cls, user_id: int, current_user_id: int) -> bool:
        if current_user_id == user_id:
            raise ValueError('Cannot delete yourself.')
        return UserRepository.delete(user_id)

    @classmethod
    def admin_reset_password(cls, user_id: int, new_password: str):
        if not UserRepository.change_password(user_id, new_password):
            raise ValueError('User not found.')
