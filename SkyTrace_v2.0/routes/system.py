"""
SkyTrace v2.0 — 系统路由 (/api/health, /api/version, /api/weather, /api/logo-proxy)
"""
import hashlib
import os
import urllib.request
from flask import Blueprint, jsonify, request, send_from_directory, current_app

system_bp = Blueprint('system', __name__)

APP_VERSION = 50
LOGO_CACHE_DIR = os.path.join('static', 'img', 'airlines', 'cache')


@system_bp.route('/api/health')
def health():
    try:
        from extensions import db
        db.session.execute(db.text('SELECT 1'))
        db_ok = True
    except Exception:
        db_ok = False

    return jsonify({
        'status': 'ok' if db_ok else 'degraded',
        'version': APP_VERSION,
        'database': 'connected' if db_ok else 'error',
    })


@system_bp.route('/api/version')
def version():
    return jsonify({'version': APP_VERSION})


@system_bp.route('/api/weather')
def weather():
    lat = request.args.get('lat', '')
    lon = request.args.get('lon', '')
    if not lat or not lon:
        return jsonify({'error': 'lat and lon required'}), 400
    try:
        url = f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true'
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'SkyTrace/2.0')
        with urllib.request.urlopen(req, timeout=10) as resp:
            import json as _json
            data = _json.loads(resp.read().decode())
            return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/logo-proxy')
def logo_proxy():
    url = request.args.get('url', '')
    if not url or not url.startswith('http'):
        return '', 400

    ext = '.svg' if '.svg' in url else '.png'
    filename = hashlib.md5(url.encode()).hexdigest() + ext
    cache_path = os.path.join(LOGO_CACHE_DIR, filename)
    mimetype = 'image/svg+xml' if ext == '.svg' else 'image/png'

    if os.path.exists(cache_path):
        return send_from_directory(LOGO_CACHE_DIR, filename, mimetype=mimetype)

    try:
        os.makedirs(LOGO_CACHE_DIR, exist_ok=True)
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'SkyTrace/2.0')
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            with open(cache_path, 'wb') as f:
                f.write(data)
        return send_from_directory(LOGO_CACHE_DIR, filename, mimetype=mimetype)
    except Exception:
        return '', 404
