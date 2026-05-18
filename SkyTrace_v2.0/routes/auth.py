"""
SkyTrace v2.0 — 认证路由 (/api/auth/*, /api/setup)
"""
from flask import Blueprint, request, jsonify, session, g
from services.auth_service import AuthService
from services.settings_service import SettingsService
from repositories.user_repo import UserRepository
from schemas.auth import SetupInput, LoginInput, PasswordChangeInput

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/auth/state', methods=['GET'])
def auth_state():
    user = g.get('current_user')
    legacy = AuthService.is_legacy_mode()
    return jsonify({
        'needs_setup': legacy,
        'authenticated': bool(user),
        'storage_mode': 'legacy' if legacy else 'multi_user',
        'user': user,
    })


@auth_bp.route('/api/setup', methods=['POST'])
def setup_admin():
    if not AuthService.is_legacy_mode():
        return jsonify({'success': False, 'error': 'Setup has already been completed.'}), 409

    body = SetupInput(**request.json)
    try:
        user = AuthService.setup_admin(
            username=body.username,
            password=body.password,
            display_name=body.display_name
        )
        session.permanent = True
        session['user_id'] = user['id']
        return jsonify({'success': True, 'user': user})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    if AuthService.is_legacy_mode():
        return jsonify({'success': False, 'error': 'Please finish setup first.'}), 409

    body = LoginInput(**request.json)
    client_ip = request.remote_addr or 'unknown'
    try:
        user = AuthService.login(body.username, body.password, client_ip)
        session.permanent = True
        session['user_id'] = user['id']
        return jsonify({'success': True, 'user': user})
    except ValueError as exc:
        status = 429 if 'Too many' in str(exc) else 401
        return jsonify({'success': False, 'error': str(exc)}), status


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@auth_bp.route('/api/auth/password', methods=['PUT'])
def change_own_password():
    from routes._decorators import login_required
    @login_required
    def _change():
        body = PasswordChangeInput(**request.json)
        try:
            AuthService.change_password(g.current_user['id'], body.password)
            return jsonify({'success': True})
        except ValueError as exc:
            return jsonify({'success': False, 'error': str(exc)}), 400
    return _change()
