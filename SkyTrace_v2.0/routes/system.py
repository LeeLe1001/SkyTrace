"""
SkyTrace v2.0 — System routes
"""
import hashlib
import os
import urllib.request
from flask import Blueprint, jsonify, request, send_from_directory, Response, g

system_bp = Blueprint('system', __name__)
LOGO_CACHE_DIR = os.path.join('static', 'img', 'airlines', 'cache')

@system_bp.route('/api/health')
def health():
    try:
        from extensions import db
        db.session.execute(db.text('SELECT 1'))
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({'status': 'ok' if db_ok else 'degraded', 'version': 50, 'database': 'connected' if db_ok else 'error'})

@system_bp.route('/api/version')
def version():
    return jsonify({'version': 50})

@system_bp.route('/api/weather')
def weather():
    lat = request.args.get('lat', '')
    lon = request.args.get('lon', '')
    if not lat or not lon:
        return jsonify({'error': 'lat and lon required'}), 400
    try:
        url = 'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current_weather=true' % (lat, lon)
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'SkyTrace/2.0')
        with urllib.request.urlopen(req, timeout=10) as resp:
            import json as _json
            return jsonify(_json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@system_bp.route('/api/events')
def sse_stream():
    from services.sse_broker import generate_sse_events
    user_id = g.current_user['id'] if g.get('current_user') else None
    if not user_id:
        def noop():
            import time
            while True:
                yield ': keepalive %d\n\n' % int(time.time())
        return Response(noop(), mimetype='text/event-stream')
    return Response(generate_sse_events(user_id), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

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
