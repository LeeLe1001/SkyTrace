"""
SkyTrace v2.0 — 多环境配置
"""
import os
from datetime import timedelta


class Config:
    """基础配置"""
    SECRET_KEY = os.environ.get('SKYTRACE_SECRET_KEY', 'dev-secret-change-me')
    DATA_DIR = os.environ.get('SKYTRACE_DATA_DIR', 'data')

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # 速率限制
    LOGIN_MAX_ATTEMPTS = 10
    LOGIN_WINDOW_SECONDS = 300

    # GitHub 备份默认仓库
    GITHUB_BACKUP_REPO_DEFAULT = 'LeeLe1001/SkyTrace'

    # API Base
    GITHUB_API_BASE = 'https://api.github.com'


class DevelopmentConfig(Config):
    """本地开发"""
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'SKYTRACE_DATABASE_URL',
        'sqlite:///data/skytrace.db'
    )


class TestingConfig(Config):
    """自动化测试"""
    TESTING = True
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


class ProductionConfig(Config):
    """Azure 生产环境"""
    DEBUG = False
    SESSION_COOKIE_SECURE = os.environ.get('SKYTRACE_SECURE_COOKIES', '1') == '1'
    SQLALCHEMY_DATABASE_URI = os.environ.get('SKYTRACE_DATABASE_URL')


config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
}
