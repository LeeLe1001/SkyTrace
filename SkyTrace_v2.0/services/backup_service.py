"""
SkyTrace v2.0 — GitHub 备份服务
"""
import base64
import json
import re
import urllib.request
import urllib.error
from datetime import datetime
from services.settings_service import SettingsService
from repositories.flight_repo import FlightRepository


GITHUB_API_BASE = 'https://api.github.com'


class BackupService:
    @classmethod
    def build_payload(cls, user: dict, user_id: int) -> dict:
        settings = SettingsService.get_for_user(user_id)
        return {
            'schema_version': 1,
            'exported_at': datetime.utcnow().isoformat() + 'Z',
            'user': {
                'username': user.get('username', ''),
                'display_name': user.get('display_name', ''),
            },
            'settings': {
                'preferred_api': settings.get('preferred_api', 'auto'),
                'auto_cache': bool(settings.get('auto_cache', True)),
            },
            'flights': FlightRepository.list_by_user(user_id),
        }

    @classmethod
    def get_backup_path(cls, username: str) -> str:
        safe_name = re.sub(r'[^a-zA-Z0-9._-]+', '_', username or 'user')
        return f'data/user-backups/{safe_name}.json'

    @classmethod
    def resolve_credentials(cls, user_id: int, override: dict | None = None):
        settings = SettingsService.get_for_user(user_id)
        override = override or {}
        raw_token = (override.get('token') or '').strip()
        raw_repo = (override.get('repo') or '').strip() or settings.get('github_backup_repo', '')
        token = raw_token if raw_token and '****' not in raw_token else settings.get('github_backup_token', '')
        repo = raw_repo or 'LeeLe1001/SkyTrace'
        if not token or not repo:
            raise ValueError('GitHub backup is not configured.')
        return token, repo

    @classmethod
    def test_connection(cls, token: str, repo: str) -> dict:
        data = cls._api_request(f'/repos/{repo}', token=token)
        return {
            'repo': data.get('full_name', repo),
            'visibility': data.get('visibility', ''),
        }

    @classmethod
    def push(cls, token: str, repo: str, path: str, content: str) -> dict:
        body = {
            'message': f'SkyTrace backup {datetime.utcnow().strftime("%Y-%m-%d %H:%M")} UTC',
            'content': base64.b64encode(content.encode('utf-8')).decode('ascii'),
        }

        # Check if file exists (get SHA)
        try:
            existing = cls._api_request(f'/repos/{repo}/contents/{path}', token=token)
            body['sha'] = existing.get('sha')
        except Exception:
            pass

        return cls._api_request(f'/repos/{repo}/contents/{path}', method='PUT',
                                body=body, token=token)

    @classmethod
    def pull(cls, token: str, repo: str, path: str) -> dict:
        data = cls._api_request(f'/repos/{repo}/contents/{path}', token=token)
        content = data.get('content', '')
        if content:
            decoded = base64.b64decode(content.replace('\n', '')).decode('utf-8')
            return json.loads(decoded)
        raise ValueError('No backup found.')

    @classmethod
    def _api_request(cls, path: str, method: str = 'GET', body=None,
                     token: str = '') -> dict:
        url = f'{GITHUB_API_BASE}{path}'
        req = urllib.request.Request(url, method=method or 'GET')
        req.add_header('User-Agent', 'SkyTrace/2.0')
        req.add_header('Authorization', f'Bearer {token}')
        req.add_header('Accept', 'application/vnd.github+json')

        payload = None
        if body is not None:
            payload = json.dumps(body).encode('utf-8')
            req.add_header('Content-Type', 'application/json')

        try:
            with urllib.request.urlopen(req, data=payload, timeout=20) as resp:
                raw = resp.read().decode('utf-8')
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', errors='ignore')
            try:
                data = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                data = {}
            message = data.get('message') or f'HTTP {exc.code}'
            raise ValueError(message) from exc
