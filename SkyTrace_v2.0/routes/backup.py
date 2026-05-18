"""
SkyTrace v2.0 — GitHub 备份路由 (/api/backup/github/*)
"""
import json
from flask import Blueprint, request, jsonify, g
from services.backup_service import BackupService
from routes._decorators import login_required

backup_bp = Blueprint('backup', __name__)


@backup_bp.route('/api/backup/github/test', methods=['POST'])
@login_required
def test_backup():
    body = request.json or {}
    try:
        token, repo = BackupService.resolve_credentials(g.current_user['id'], body)
        data = BackupService.test_connection(token, repo)
        return jsonify({
            'success': True,
            'repo': data.get('repo'),
            'visibility': data.get('visibility'),
            'path': BackupService.get_backup_path(g.current_user['username']),
        })
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@backup_bp.route('/api/backup/github/push', methods=['POST'])
@login_required
def push_backup():
    body = request.json or {}
    try:
        token, repo = BackupService.resolve_credentials(g.current_user['id'], body)
        path = BackupService.get_backup_path(g.current_user.get('username', ''))
        payload = BackupService.build_payload(g.current_user, g.current_user['id'])
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        BackupService.push(token, repo, path, content)
        return jsonify({'success': True, 'path': path, 'flights': len(payload.get('flights', []))})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@backup_bp.route('/api/backup/github/pull', methods=['POST'])
@login_required
def pull_backup():
    body = request.json or {}
    try:
        token, repo = BackupService.resolve_credentials(g.current_user['id'], body)
        path = BackupService.get_backup_path(g.current_user.get('username', ''))
        data = BackupService.pull(token, repo, path)
        from repositories.flight_repo import FlightRepository
        FlightRepository.replace_all(g.current_user['id'], data.get('flights', []))
        return jsonify({
            'success': True,
            'flights': len(data.get('flights', [])),
        })
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
