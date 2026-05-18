"""
SkyTrace v2.0 — Pydantic 请求验证 - 备份
"""
from pydantic import BaseModel, Field


class BackupTestInput(BaseModel):
    token: str = Field(default='')
    repo: str = Field(default='')
