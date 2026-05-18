"""
SkyTrace v2.0 — Pydantic 请求验证 - 认证
"""
from pydantic import BaseModel, Field, field_validator


class SetupInput(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6)
    display_name: str = Field(default='')

    @field_validator('username')
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip().lower()
        allowed = set('abcdefghijklmnopqrstuvwxyz0123456789._-')
        if any(ch not in allowed for ch in v):
            raise ValueError('Username can only contain letters, numbers, ., _, -')
        return v


class LoginInput(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class PasswordChangeInput(BaseModel):
    password: str = Field(min_length=6)


class AdminCreateUserInput(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6)
    display_name: str = Field(default='')
    is_admin: bool = Field(default=False)

    @field_validator('username')
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip().lower()
        allowed = set('abcdefghijklmnopqrstuvwxyz0123456789._-')
        if any(ch not in allowed for ch in v):
            raise ValueError('Username can only contain letters, numbers, ., _, -')
        return v
