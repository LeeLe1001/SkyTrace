"""
SkyTrace v2.0 — Flask 应用工厂入口
====================================
分层架构: routes/ → services/ → repositories/ → models/

启动方式:
    python app.py                      # 开发模式 (SQLite)
    SKYTRACE_ENV=production python app.py  # 生产模式 (PostgreSQL)
"""
import os
from flask import Flask, g, send_from_directory
from config import config
from extensions import init_extensions
from routes import register_blueprints
from repositories.user_repo import UserRepository
from services.auth_service import AuthService


def create_app(config_name='development'):
    """创建并配置 Flask 应用"""
    app = Flask(__name__)

    # 配置
    env = os.environ.get('SKYTRACE_ENV', config_name)
    app.config.from_object(config.get(env, config['development']))

    # 扩展
    init_extensions(app)

    # 数据目录
    os.makedirs(app.config['DATA_DIR'], exist_ok=True)

    # 路由注册
    register_blueprints(app)

    # ---- 请求钩子 ----

    @app.before_request
    def load_current_user():
        g.current_user = None
        if AuthService.is_legacy_mode():
            return
        user_id = app.session_interface and getattr(app, '_got_session', None)
        # Use Flask session via request context
        from flask import session
        uid = session.get('user_id')
        if uid:
            g.current_user = UserRepository.get_by_id(uid)

    # ---- 静态文件 (绝对路径, 安全认证门控) ----
    _base_dir = os.path.dirname(os.path.abspath(__file__))

    @app.route('/static/<path:filename>')
    def static_files(filename):
        return send_from_directory(os.path.join(_base_dir, 'static'), filename)

    @app.route('/data/<path:filename>')
    def data_files(filename):
        return send_from_directory(os.path.join(_base_dir, 'data'), filename)

    @app.route('/')
    def index():
        from flask import session
        from auth_gate import get_secure_login_html
        uid = session.get('user_id')
        is_legacy = AuthService.is_legacy_mode()
        if is_legacy or uid:
            return send_from_directory(_base_dir, 'index.html')
        return get_secure_login_html()

    @app.route('/sw.js')
    def service_worker():
        return send_from_directory(_base_dir, 'sw.js', mimetype='application/javascript')

    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory(_base_dir, 'favicon.ico', mimetype='image/x-icon')

    @app.route('/debug')
    def debug():
        return _debug_page(), 200, {'Content-Type': 'text/html; charset=utf-8'}

    @app.after_request
    def add_cache_headers(response):
        if app.debug:
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    return app


def _debug_page():
    return '''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SkyTrace Debug</title>
<style>
body{font-family:monospace;background:#0f172a;color:#e2e8f0;padding:20px;font-size:14px;max-width:600px;margin:0 auto}
h1{color:#3b82f6} .ok{color:#22c55e} .fail{color:#ef4444}
.test{margin:8px 0;padding:8px;background:#1e293b;border-radius:6px}
button{background:#3b82f6;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin:5px}
</style></head><body>
<h1>&#9992; SkyTrace v2.0 诊断</h1>
<button onclick="runTests()">&#128269; 诊断</button>
<button onclick="clearSW()">&#128465; 清除SW+缓存</button>
<button onclick="location.href='/'">&#127968; 首页</button>
<div id="results"></div>
<script>
var r=document.getElementById('results');
function log(m,c){r.innerHTML+='<div class="test '+(c||'')+'">'+m+'</div>'}
async function runTests(){
r.innerHTML='';log('诊断中...');
if('serviceWorker' in navigator){var rs=await navigator.serviceWorker.getRegistrations();log('SW: '+rs.length,rs.length>0?'warn':'ok')}
var ns=await caches.keys();log('Caches: '+ns.length,ns.length>0?'warn':'ok');
var fs=[{u:'/static/lib/leaflet.js',n:'Leaflet'},{u:'/static/js/app.js',n:'app.js'},{u:'/api/airports',n:'airports API'},{u:'/api/flights',n:'flights API'}];
for(var f of fs){try{var s=Date.now();var x=await fetch(f.u+'?_t='+Date.now());log(f.n+': '+x.status+' ('+(Date.now()-s)+'ms)',x.ok?'ok':'fail')}catch(e){log(f.n+': ERR '+e.message,'fail')}}
log('完成')}
async function clearSW(){
if('serviceWorker' in navigator){for(var r of await navigator.serviceWorker.getRegistrations()){await r.unregister();log('SW cleared','ok')}}
for(var n of await caches.keys()){await caches.delete(n);log('Cache cleared: '+n,'ok')}
log('All cleared')}
</script></body></html>'''


# 模块级应用实例 (gunicorn 兼容)
application = create_app(os.environ.get('SKYTRACE_ENV', 'development'))

if __name__ == '__main__':
    application.run(host='0.0.0.0', port=5000)

# ---- 向后兼容层 (供测试和旧代码使用) ----
app = application
APP_VERSION = 50
FLIGHTS_FILE = os.path.join('data', 'flights.json')
SETTINGS_FILE = os.path.join('data', 'settings.json')

from services.lookup_service import norm_flight_no as normalize_flight_no, extract_airline_code
from services.lookup_service import fill_terminal, query_aviationstack, query_airlabs, query_aerodata
from services.lookup_service import cache_flight_result, find_in_local_data
from services.settings_service import SettingsService
from repositories.user_repo import UserRepository
from time_utils import resolve_flight_timeline, calculate_duration_minutes, attach_airport_timezones
from services.auth_service import AuthService

def get_active_settings():
    from flask import g
    user = g.get('current_user')
    if user:
        return SettingsService.get_for_user(user['id'])
    return SettingsService.DEFAULT

def get_flight_status_info(flight, airports_data=None):
    from datetime import datetime, timedelta
    from time_utils import UTC
    now = datetime.now(); now_utc = datetime.now(UTC)
    explicit = (flight.get('status') or '').lower() == 'completed'
    base = {'checkin_open':None,'checkin_close':None,'boarding_time':None,
            'dep_datetime':None,'arr_datetime':None,'status':'scheduled',
            'countdown':None,'progress':0}
    try:
        fd = datetime.strptime(flight['date'], '%Y-%m-%d')
    except (ValueError, KeyError):
        if explicit: b=base.copy(); b['status']='completed'; b['progress']=100; return b
        return {'status':'unknown','countdown':None}
    if not (flight.get('dep_time') or '').strip():
        b=base.copy()
        if explicit or fd.date()<now.date(): b['status']='completed'; b['progress']=100
        return b
    tl = resolve_flight_timeline(flight, airports_data=airports_data)
    if not tl:
        if explicit: b=base.copy(); b['status']='completed'; b['progress']=100; return b
        return {'status':'unknown','countdown':None}
    dl,al,du,au = tl['dep_local'],tl['arr_local'],tl['dep_utc'],tl['arr_utc']
    co=dl-timedelta(hours=24); cc=dl-timedelta(minutes=45); bt=dl-timedelta(minutes=40)
    btu=bt.astimezone(UTC); cou=co.astimezone(UTC)
    fdur=(au-du).total_seconds(); prog=0
    if du<now_utc<au and fdur>0: prog=min(100,round((now_utc-du).total_seconds()/fdur*100))
    si={'checkin_open':co.strftime('%Y-%m-%d %H:%M'),'checkin_close':cc.strftime('%Y-%m-%d %H:%M'),
        'boarding_time':bt.strftime('%Y-%m-%d %H:%M'),'dep_datetime':dl.strftime('%Y-%m-%d %H:%M'),
        'arr_datetime':al.strftime('%Y-%m-%d %H:%M'),'status':'scheduled','countdown':None,'progress':prog}
    if explicit or now_utc>au: si['status']='completed'; si['progress']=100
    elif now_utc>du: si['status']='in_flight'; si['countdown']={'key':'etaMinutes','args':[int((au-now_utc).total_seconds()//60)]}
    elif now_utc>btu: si['status']='boarding'; si['countdown']={'key':'depInMinutes','args':[int((du-now_utc).total_seconds()//60)]}
    elif now_utc>cou:
        hl=(du-now_utc).total_seconds()/3600
        if hl>=1: si['countdown']={'key':'depInHours','args':[int(hl)]}
        else: si['countdown']={'key':'depInMinutes','args':[int(hl*60)]}
    else:
        dn=now_utc.astimezone(dl.tzinfo); days=(fd.date()-dn.date()).days
        if days>0: si['countdown']={'key':'daysLeft','args':[days]}
        else:
            h=int((cou-now_utc).total_seconds()//3600)
            if h>0: si['countdown']={'key':'hoursToCheckin','args':[h]}
    return si
