"""
SkyTrace v2.0 — 数据路由 (/api/airports, /api/airlines, /api/cache/stats)
"""
import json
import os
from flask import Blueprint, request, jsonify
from time_utils import attach_airport_timezones

data_bp = Blueprint('data', __name__)

AIRPORTS_FILE = os.path.join('data', 'airports.json')
AIRLINES_FILE = os.path.join('data', 'airlines.json')
SCHEDULES_FILE = os.path.join('data', 'flight_schedules.json')


@data_bp.route('/api/airports', methods=['GET'])
def get_airports():
    data = {}
    if os.path.exists(AIRPORTS_FILE):
        with open(AIRPORTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    data = attach_airport_timezones(data)
    return jsonify(data)


@data_bp.route('/api/airports/search', methods=['GET'])
def search_airports():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({})

    data = {}
    if os.path.exists(AIRPORTS_FILE):
        with open(AIRPORTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    data = attach_airport_timezones(data)

    q = query.lower()
    results = {}
    for code, info in data.items():
        if code.startswith('_'):
            continue
        if (q in code.lower()
                or q in info.get('name', '').lower()
                or q in info.get('city', '').lower()
                or q in info.get('name_en', '').lower()
                or q in info.get('city_en', '').lower()
                or q in info.get('country', '').lower()
                or q in info.get('country_en', '').lower()):
            results[code] = info
    return jsonify(results)


@data_bp.route('/api/airlines', methods=['GET'])
def get_airlines():
    if os.path.exists(AIRLINES_FILE):
        with open(AIRLINES_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({})


@data_bp.route('/api/cache/stats', methods=['GET'])
def cache_stats():
    if os.path.exists(SCHEDULES_FILE):
        with open(SCHEDULES_FILE, 'r', encoding='utf-8') as f:
            schedules = json.load(f)
        return jsonify({'count': len(schedules)})
    return jsonify({'count': 0})
