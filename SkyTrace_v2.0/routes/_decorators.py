"""
SkyTrace v2.0 — 路由装饰器 (login_required, admin_required)
"""
from functools import wraps
from flask import g, jsonify, session
from services.auth_service import AuthService
from repositories.user_repo import UserRepository


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if AuthService.is_legacy_mode():
            return view(*args, **kwargs)
        if not g.get('current_user'):
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'auth_required': True
            }), 401
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if AuthService.is_legacy_mode():
            return jsonify({'success': False, 'error': 'Setup required'}), 409
        user = g.get('current_user')
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'auth_required': True
            }), 401
        if not user.get('is_admin'):
            return jsonify({'success': False, 'error': 'Admin permission required'}), 403
        return view(*args, **kwargs)
    return wrapped
