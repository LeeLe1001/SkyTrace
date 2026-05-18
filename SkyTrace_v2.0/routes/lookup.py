"""
SkyTrace v2.0 — 航班查询路由 (/api/flight/lookup, /api/flight/status)
"""
import json
import os
from flask import Blueprint, request, jsonify, g
from routes._decorators import login_required
from services.lookup_service import (
    norm_flight_no, extract_airline_code, fill_terminal,
    query_all_apis, find_in_local_data
)
from services.settings_service import SettingsService

lookup_bp = Blueprint('lookup', __name__)


@lookup_bp.route('/api/flight/lookup', methods=['GET'])
@login_required
def lookup_flight():
    raw = request.args.get('flight_no', '')
    date = request.args.get('date', '')
    flight_no = norm_flight_no(raw)

    if not flight_no or len(flight_no) < 3:
        return jsonify({'success': False, 'error': '请输入有效航班号'}), 400

    airline_code = extract_airline_code(flight_no)
    airlines_path = os.path.join('data', 'airlines.json')
    airlines = {}
    if os.path.exists(airlines_path):
        with open(airlines_path, 'r', encoding='utf-8') as f:
            airlines = json.load(f)

    result = {
        'success': True,
        'flight_no': flight_no,
        'date': date,
        'airline': airlines.get(airline_code, {}).get('name', ''),
        'airline_code': airline_code,
        'departure': '', 'arrival': '',
        'dep_time': '', 'arr_time': '',
        'dep_terminal': '', 'arr_terminal': '',
        'dep_gate': '', 'arr_gate': '',
        'aircraft': '', 'flight_status': '',
        'source': 'none',
        'api_configured': False,
    }

    settings = SettingsService.get_for_user(g.current_user['id']) if g.get('current_user') else {}
    has_api = bool(settings.get('aviationstack_key') or
                   settings.get('airlabs_key') or
                   settings.get('aerodata_key'))
    result['api_configured'] = has_api

    if has_api:
        api_result = query_all_apis(flight_no, date, settings)
        if api_result and api_result.get('departure'):
            for k, v in api_result.items():
                if v:
                    result[k] = v
            result['source'] = 'api'
            fill_terminal(result)
            return jsonify(result)

    local = find_in_local_data(flight_no, user_id=g.current_user['id'] if g.get('current_user') else None)
    if local and local.get('departure'):
        for k in ['departure', 'arrival', 'dep_time', 'arr_time',
                   'aircraft', 'dep_terminal', 'arr_terminal']:
            if local.get(k):
                result[k] = local[k]
        result['source'] = local.get('source', 'local')
        fill_terminal(result)
        return jsonify(result)

    return jsonify(result)


@lookup_bp.route('/api/flight/status', methods=['GET'])
@login_required
def flight_status():
    flight_no = norm_flight_no(request.args.get('flight_no', ''))
    date = request.args.get('date', '')
    if not flight_no:
        return jsonify({'success': False, 'error': '请输入航班号'}), 400

    settings = SettingsService.get_for_user(g.current_user['id']) if g.get('current_user') else {}
    api_result = query_all_apis(flight_no, date, settings)
    if api_result:
        return jsonify({
            'success': True,
            'flight_no': flight_no,
            'flight_status': api_result.get('flight_status', ''),
            'dep_terminal': api_result.get('dep_terminal', ''),
            'arr_terminal': api_result.get('arr_terminal', ''),
            'dep_gate': api_result.get('dep_gate', ''),
            'arr_gate': api_result.get('arr_gate', ''),
            'source': api_result.get('api_source', ''),
        })
    return jsonify({'success': False, 'error': '无法获取实时状态，请配置API密钥'})
