"""
SkyTrace v2.0 — 设置服务
"""
from repositories.user_repo import SettingsRepository
from security_utils import encrypt_secret, decrypt_secret


class SettingsService:
    DEFAULT = {
        "aviationstack_key": "",
        "airlabs_key": "",
        "aerodata_key": "",
        "github_backup_token": "",
        "github_backup_repo": "LeeLe1001/SkyTrace",
        "preferred_api": "auto",
        "auto_cache": True,
    }

    SENSITIVE_FIELDS = {'aviationstack_key', 'airlabs_key', 'aerodata_key', 'github_backup_token'}

    @classmethod
    def get_for_user(cls, user_id: int) -> dict:
        return SettingsRepository.get(user_id)

    @classmethod
    def save_for_user(cls, user_id: int, new_settings: dict) -> dict:
        return SettingsRepository.save(user_id, new_settings)

    @classmethod
    def get_safe(cls, user_id: int) -> dict:
        """返回掩码后的设置（前端用）"""
        settings = cls.get_for_user(user_id)
        safe = {}
        for k, v in settings.items():
            if k in cls.SENSITIVE_FIELDS and v:
                safe[k] = cls._mask(v)
                safe[k + '_set'] = True
            elif k in cls.SENSITIVE_FIELDS:
                safe[k] = ''
                safe[k + '_set'] = False
            else:
                safe[k] = v
        return safe

    @classmethod
    def _mask(cls, value: str) -> str:
        if not value:
            return ''
        return value[:4] + '****' + value[-4:] if len(value) > 8 else '****'
