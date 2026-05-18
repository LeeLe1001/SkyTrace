"""
SkyTrace v2.0 — 管理员路由 (/api/admin/*)
"""
from flask import Blueprint, request, jsonify, g
from services.auth_service import AuthService
from repositories.user_repo import UserRepository
from schemas.auth import AdminCreateUserInput, PasswordChangeInput
from routes._decorators import admin_required

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/api/admin/users', methods=['GET'])
@admin_required
def list_users():
    return jsonify({'success': True, 'users': UserRepository.list_users()})


@admin_bp.route('/api/admin/users', methods=['POST'])
@admin_required
def create_user():
    body = AdminCreateUserInput(**request.json)
    try:
        user = AuthService.admin_create_user(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            is_admin=body.is_admin,
        )
        return jsonify({'success': True, 'user': user})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@admin_bp.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    try:
        if not AuthService.admin_delete_user(user_id, g.current_user['id']):
            return jsonify({'success': False, 'error': 'User not found.'}), 404
        return jsonify({'success': True})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@admin_bp.route('/api/admin/users/<int:user_id>/password', methods=['PUT'])
@admin_required
def reset_password(user_id):
    body = PasswordChangeInput(**request.json)
    try:
        AuthService.admin_reset_password(user_id, body.password)
        return jsonify({'success': True})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
