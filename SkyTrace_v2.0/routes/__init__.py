"""
SkyTrace v2.0 — 路由注册
"""
from flask import Flask


def register_blueprints(app: Flask):
    from routes.auth import auth_bp
    from routes.admin import admin_bp
    from routes.flights import flights_bp
    from routes.lookup import lookup_bp
    from routes.settings import settings_bp
    from routes.stats import stats_bp
    from routes.data import data_bp
    from routes.backup import backup_bp
    from routes.system import system_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(flights_bp)
    app.register_blueprint(lookup_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(system_bp)
