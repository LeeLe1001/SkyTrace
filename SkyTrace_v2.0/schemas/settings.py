"""
SkyTrace v2.0 — Pydantic 请求验证 - 设置
"""
from pydantic import BaseModel, Field


class SettingsInput(BaseModel):
    aviationstack_key: str = Field(default='')
    airlabs_key: str = Field(default='')
    aerodata_key: str = Field(default='')
    github_backup_token: str = Field(default='')
    github_backup_repo: str = Field(default='LeeLe1001/SkyTrace')
    preferred_api: str = Field(default='auto')
    auto_cache: bool = Field(default=True)


class ApiTestInput(BaseModel):
    api: str = Field(min_length=1)
    key: str = Field(min_length=1)
