"""
SkyTrace v2.0 — 设置路由 (/api/settings/*)
"""
import json
import os
from flask import Blueprint, request, jsonify, g
from services.settings_service import SettingsService
from services.lookup_service import query_aviationstack, query_airlabs, query_aerodata
from schemas.settings import SettingsInput, ApiTestInput
from routes._decorators import login_required

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/api/settings', methods=['GET'])
@login_required
def get_settings():
    if not g.get('current_user'):
        return jsonify(SettingsService.DEFAULT)
    return jsonify(SettingsService.get_safe(g.current_user['id']))


@settings_bp.route('/api/settings', methods=['POST'])
@login_required
def save_settings():
    if not g.get('current_user'):
        # Legacy: save to settings.json
        new = request.json or {}
        path = os.path.join('data', 'settings.json')
        current = {}
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                current = json.load(f)
        for k, v in new.items():
            if isinstance(v, str) and '****' in v:
                continue
            current[k] = v
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
        return jsonify({'success': True})

    new = SettingsInput(**request.json).model_dump()
    SettingsService.save_for_user(g.current_user['id'], new)
    return jsonify({'success': True})


@settings_bp.route('/api/settings/test', methods=['POST'])
@login_required
def test_api():
    body = ApiTestInput(**request.json)
    test_fn = 'CZ3101'
    result = None

    if body.api == 'aviationstack':
        result = query_aviationstack(test_fn, '', body.key)
    elif body.api == 'airlabs':
        result = query_airlabs(test_fn, '', body.key)
    elif body.api == 'aerodata':
        result = query_aerodata(test_fn, '', body.key)

    if result and result.get('departure'):
        return jsonify({'success': True, 'message': f'✅ 连接成功！查到 {test_fn} 航班信息'})
    elif result:
        return jsonify({'success': True, 'message': '✅ API连接成功 (测试航班暂无数据)'})
    elif result is None:
        return jsonify({'success': False, 'message': '❌ 连接失败，请检查密钥是否正确'})
    return jsonify({'success': False, 'message': '❌ 连接失败'})
