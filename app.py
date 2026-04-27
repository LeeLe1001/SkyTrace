"""
SkyTrace - 涓汉鑸梾绠＄悊绯荤粺
Flask 鍚庣涓荤▼搴?v2.0

鏀寔澶欰PI婧愯埅鐝煡璇?
- AviationStack (鍏嶈垂500娆?鏈?: https://aviationstack.com/
- AirLabs (鍏嶈垂1000娆?鏈?: https://airlabs.co/
- AeroDataBox (RapidAPI鍏嶈垂鐗?: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
"""

from flask import Flask, g, jsonify, request, send_from_directory, session
import base64
import json
import os
import math
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
import secrets
import uuid
import urllib.request
import urllib.error
import re
import time

from storage import (
    DEFAULT_USER_SETTINGS,
    add_user_flight,
    bootstrap_admin_user,
    configure_database,
    connect_user_flights,
    create_user,
    delete_user_flight,
    disconnect_user_flights,
    find_user_flight_by_number,
    get_database_url,
    get_user_by_id,
    get_user_settings,
    has_users as storage_has_users,
    list_user_flights,
    list_users,
    replace_user_flights,
    save_user_settings,
    update_user_flight,
    verify_user_credentials,
    change_user_password,
    delete_user,
)
from time_utils import UTC, attach_airport_timezones, calculate_duration_minutes, resolve_flight_timeline

app = Flask(__name__)

# ==================== 閰嶇疆 ====================
DATA_DIR = 'data'
FLIGHTS_FILE = os.path.join(DATA_DIR, 'flights.json')
AIRPORTS_FILE = os.path.join(DATA_DIR, 'airports.json')
AIRLINES_FILE = os.path.join(DATA_DIR, 'airlines.json')
SCHEDULES_FILE = os.path.join(DATA_DIR, 'flight_schedules.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
LOGO_CACHE_DIR = os.path.join('static', 'img', 'airlines', 'cache')

DEFAULT_SETTINGS = dict(DEFAULT_USER_SETTINGS)
GITHUB_API_BASE = 'https://api.github.com'
GITHUB_BACKUP_REPO_DEFAULT = DEFAULT_SETTINGS.get('github_backup_repo', 'LeeLe1001/SkyTrace')


def _load_or_create_secret_key():
    env_key = os.environ.get('SKYTRACE_SECRET_KEY')
    if env_key:
        return env_key

    key_path = Path(DATA_DIR) / 'secret_key.txt'
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        return key_path.read_text(encoding='utf-8').strip()

    secret_key = secrets.token_hex(32)
    key_path.write_text(secret_key, encoding='utf-8')
    return secret_key


app.secret_key = _load_or_create_secret_key()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SKYTRACE_SECURE_COOKIES', '1') == '1'

# Brute-force protection for login endpoints (in-memory, resets on restart)
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_MAX_ATTEMPTS = 10
_LOGIN_WINDOW_SECONDS = 300


def _check_login_rate_limit(key: str) -> bool:
    now = time.time()
    attempts = _LOGIN_ATTEMPTS.get(key, [])
    attempts = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[key] = attempts
    return len(attempts) < _LOGIN_MAX_ATTEMPTS


def _record_login_attempt(key: str):
    now = time.time()
    _LOGIN_ATTEMPTS.setdefault(key, []).append(now)

configure_database()

# ==================== 鑸珯妤艰嚜鍔ㄨˉ鍏?====================
# 宸茬煡鑸徃鍦ㄥ悇鏈哄満鐨勫父鐢ㄨ埅绔欐ゼ鏄犲皠 (API杩斿洖绌烘椂鍏滃簳)
# 鏍煎紡: { 鏈哄満IATA: { 鑸徃IATA: 鑸珯妤肩紪鍙?} }
AIRLINE_TERMINAL_MAP = {
    # ====== 涓浗澶ч檰 ======
    'PEK': {'CA': '3', 'ZH': '3', 'MU': '2', 'FM': '2', 'CZ': '2', 'MF': '2',
            'SC': '2', 'NH': '3', 'SQ': '3', 'LH': '3', 'BA': '3', 'AF': '2',
            'HU': '1', 'GS': '1', 'JD': '2', 'CX': '3', '3U': '2', 'SU': '2'},
    'PVG': {'MU': '1', 'FM': '1', 'CZ': '1', 'CA': '2', 'NH': '2', 'SQ': '2',
            'AF': '2', 'LH': '2', 'BA': '2', 'KE': '1', 'OZ': '1'},
    'SHA': {'MU': '1', 'FM': '1', 'CZ': '1', 'CA': '2', 'HU': '2', 'SC': '2',
            '9C': '2', '3U': '2', 'HO': '1'},
    'CTU': {'MU': '2', 'CA': '1', 'CZ': '1', '3U': '1', 'ZH': '1', 'EU': '2',
            'HU': '1', 'SC': '1', '9C': '1', 'GJ': '1', 'HO': '1', 'MI': '2',
            'NS': '2', 'TV': '2'},
    'TFU': {# T1: 鍥介檯鑸嚎 + 宸濊埅/鎴愰兘鑸┖
            '3U': '1', 'EU': '1', 'QR': '1', 'KE': '1', 'CX': '1', 'TG': '1',
            'SQ': '1', 'MU': '1',
            # T2: 澶ч儴鍒嗗浗鍐呰埅绾?
            'CA': '2', 'CZ': '2', 'ZH': '2', 'HU': '2', 'SC': '2',
            'GJ': '2', 'TV': '2', 'MF': '2', 'GS': '2', '9C': '2', 'HO': '2'},
    'CAN': {'CZ': '2', 'MU': '2', 'CA': '1', 'ZH': '1', 'HU': '1', 'SC': '1',
            '9C': '1'},
    'SZX': {'CA': '3', 'CZ': '3', 'MU': '3', 'ZH': '3', '3U': '3', 'HU': '3'},
    'XMN': {'MF': '3', 'MU': '3', 'CZ': '3', 'CA': '3'},
    'FOC': {'MF': '1', 'CZ': '1', 'MU': '1'},
    'HGH': {'MF': '4', 'GJ': '1', 'CA': '1', 'MU': '1', 'CZ': '3', 'HU': '3'},
    'HFE': {'CA': '1', 'MU': '1'},
    'KMG': {'CA': '2', 'MU': '2', 'CZ': '2', 'HU': '2', '3U': '2'},
    'HRB': {'HU': '2', 'SC': '2', 'CZ': '2', 'CA': '2', 'MU': '2'},
    'TSN': {'HU': '2', 'SC': '2', 'CA': '2', 'CZ': '2', 'MU': '2'},
    'TYN': {'MU': '2', 'Y7': '2', 'CA': '2', 'CZ': '2', 'HU': '2'},
    'XNN': {'CA': '2', 'MU': '2', 'TV': '2', 'CZ': '2'},
    'YNT': {'CZ': '2', 'MU': '2', 'SC': '2'},
    'SHE': {'3U': '3', 'CZ': '3', 'MU': '3', 'CA': '3', 'SC': '3'},
    # ====== 涓滀簹 ======
    'HKG': {'CX': '1', 'KA': '1', 'HX': '1', 'CA': '1', 'MU': '1', 'CZ': '1',
            'SQ': '1', 'QR': '1', 'NH': '1', 'JL': '1', 'BA': '1'},
    'NRT': {'NH': '1', 'CA': '1', 'MU': '1', 'CZ': '1', 'JL': '2', 'ZH': '1'},
    'HND': {'NH': '3', 'CA': '3', 'MU': '3', 'CZ': '3'},
    'ICN': {'KE': '2', 'OZ': '1', 'CA': '1', 'MU': '1', 'CZ': '1', 'AA': '1',
            'AS': '1', 'MF': '1', 'SQ': '1', 'DL': '1', 'MH': '1'},
    'TPE': {'JX': '1', 'CI': '1', 'BR': '2', 'MU': '1', 'CA': '2', 'CZ': '1'},
    # ====== 涓滃崡浜?======
    'SIN': {'SQ': '3', 'NH': '1', 'CA': '2', 'MU': '1', 'CZ': '1', 'CX': '4',
            'MI': '2', 'MH': '1', 'TG': '1'},
    # ====== 涓笢/闈炴床 ======
    'CAI': {'MS': '3', 'QR': '2', 'VF': '2', 'NP': '2', 'AF': '2', 'BA': '2'},
    'CMN': {'AT': '1', 'AF': '1'},
    # ====== 娆ф床 ======
    'CDG': {'AF': '2E', 'MU': '2E', 'CA': '2E', 'CZ': '2E', 'AZ': '1'},
    'ORY': {'AT': '4'},
    'FCO': {'AZ': '1', 'AT': '3'},
    'MAD': {'IB': '4', 'QR': '1', 'AT': '1', 'BA': '4', 'AA': '4'},
    'BCN': {'QR': '1', 'IB': '1', 'BA': '1'},
    'SVO': {'SU': 'D', 'S7': 'D', 'AF': 'E', 'KE': 'D'},
    # ====== 婢虫床 ======
    'SYD': {'CA': '1', 'MF': '1', 'MH': '1', 'CZ': '1', 'SQ': '1',
            'VA': '2', 'JQ': '2', 'QF': '3'},
    'MEL': {'CZ': '2', 'MF': '2', 'MH': '2', 'SQ': '2', 'CA': '2',
            'VA': '3', 'JQ': '4', 'QF': '1'},
    # ====== 鍖楃編 ======
    'DFW': {'AA': 'C', 'KE': 'D', 'AS': 'E', 'QR': 'D'},
    'JFK': {'AA': '8', 'DL': '4', 'BA': '7', 'CX': '8'},
    'LAX': {'MU': 'B', 'DL': '3', 'AA': '4', 'CX': 'B', 'SQ': 'B'},
    'IAH': {'UA': 'C', 'AA': 'A'},
    'LGA': {'AA': 'C', 'DL': 'C', 'UA': 'A'},
}

# 宸茬煡鐨勫崟鑸珯妤兼満鍦猴紙鏃犺埅绔欐ゼ缂栧彿鎴栦粎鏈変竴涓埅绔欐ゼ锛?
# 杩欎簺鏈哄満鐨勮埅绔欐ゼ鏄剧ず涓?MAIN
SINGLE_TERMINAL_AIRPORTS = {
    # ====== 涓浗澶ч檰 ======
    'PKX',   # 鍖椾含澶у叴
    'DZH',   # 杈惧窞
    'XFN',   # 瑗勯槼
    'HUZ',   # 鎯犲窞
    'KWE',   # 璐甸槼榫欐礊鍫?
    'SJW',   # 鐭冲搴勬瀹?
    'SYX',   # 涓変簹鍑ゅ嚢
    # ====== 涓滀簹 ======
    'NGO',   # 鍚嶅彜灞嬩腑閮?
    'ITM',   # 澶ч槳浼婁腹
    'KMJ',   # 鐔婃湰
    'GMP',   # 棣栧皵閲戞郸 (鍥介檯鑸珯妤?
    'MFM',   # 婢抽棬
    # ====== 涓滃崡浜?======
    'KBV',   # 鐢茬背
    'HKT',   # 鏅悏
    'BKK',   # 鏇艰胺绱犱竾閭ｆ櫘 (鍗曡埅绔欐ゼ澶фゼ)
    'KUL',   # 鍚夐殕鍧LIA (涓绘ゼ)
    # ====== 涓笢 ======
    'DOH',   # 澶氬搱鍝堥┈寰峰浗闄?(鍗曡埅绔欐ゼ)
    'IST',   # 浼婃柉鍧﹀竷灏旀柊鏈哄満 (鍗曡埅绔欐ゼ)
    'SAW',   # 浼婃柉鍧﹀竷灏旇惃姣斿搱鏍煎厠鐞?
    # ====== 闈炴床 ======
    'LXR',   # 鍗㈠厠绱?
    'HRG',   # 璧皵鏍艰揪
    # ====== 淇勭綏鏂?涓簹 ======
    'VVO',   # 娴峰弬宕?
    'KJA',   # 鍏嬫媺鏂浜氬皵鏂厠
    'DME',   # 鑾柉绉戝鑾澃澶氭矁
    'LED',   # 鍦ｅ郊寰楀牎鏅皵绉戞矁
    'TAS',   # 濉斾粈骞?
    # ====== 婢虫床 ======
    'OOL',   # 榛勯噾娴峰哺
    'HBA',   # 闇嶅反鐗?
    'ADL',   # 闃垮痉鑾卞痉
    'BNE',   # 甯冮噷鏂彮
    # ====== 娆ф床 ======
    'OPO',   # 娉㈠皵鍥?
    # ====== 鍖楃編 ======
    'LAS',   # 鎷夋柉缁村姞鏂?
    'AUS',   # 濂ユ柉姹€
    'SEA',   # 瑗块泤鍥?濉旂椹?
    'DTW',   # 搴曠壒寰?
    'PHX',   # 鍑ゅ嚢鍩?
}


def fill_terminal(flight_data):
    """涓虹己澶辫埅绔欐ゼ淇℃伅鐨勮埅鐝ˉ鍏呭凡鐭ユ暟鎹?""
    airline_code = extract_airline_code(flight_data.get('flight_no', ''))
    dep = flight_data.get('departure', '')
    arr = flight_data.get('arrival', '')

    # 1. 鍗曡埅绔欐ゼ鏈哄満: 濉厖 MAIN
    if not flight_data.get('dep_terminal') and dep in SINGLE_TERMINAL_AIRPORTS:
        flight_data['dep_terminal'] = 'MAIN'
    if not flight_data.get('arr_terminal') and arr in SINGLE_TERMINAL_AIRPORTS:
        flight_data['arr_terminal'] = 'MAIN'

    # 2. 澶氳埅绔欐ゼ鏈哄満: 鎸夎埅鍙告槧灏勮ˉ鍏?
    if not flight_data.get('dep_terminal') and dep in AIRLINE_TERMINAL_MAP:
        terminal = AIRLINE_TERMINAL_MAP[dep].get(airline_code, '')
        if terminal:
            flight_data['dep_terminal'] = terminal

    if not flight_data.get('arr_terminal') and arr in AIRLINE_TERMINAL_MAP:
        terminal = AIRLINE_TERMINAL_MAP[arr].get(airline_code, '')
        if terminal:
            flight_data['arr_terminal'] = terminal

    # 3. 鍏滃簳: 浠嶇劧娌℃湁鑸珯妤间俊鎭殑, 榛樿濉?MAIN
    if not flight_data.get('dep_terminal'):
        flight_data['dep_terminal'] = 'MAIN'
    if not flight_data.get('arr_terminal'):
        flight_data['arr_terminal'] = 'MAIN'

    return flight_data


# ==================== 宸ュ叿鍑芥暟 ====================
def load_json(filepath):
    """鍔犺浇JSON鏂囦欢"""
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_json(filepath, data):
    """淇濆瓨JSON鏂囦欢"""
    d = os.path.dirname(filepath)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_settings():
    """鑾峰彇璁剧疆锛堝悎骞堕粯璁ゅ€硷級"""
    settings = load_json(SETTINGS_FILE)
    return {**DEFAULT_SETTINGS, **settings}


def load_airports_data():
    return attach_airport_timezones(load_json(AIRPORTS_FILE))


def is_legacy_mode():
    return not storage_has_users()


def get_current_user():
    return getattr(g, 'current_user', None)


def get_current_user_id():
    user = get_current_user()
    return user.get('id') if user else None


def get_active_settings():
    if is_legacy_mode():
        return get_settings()

    user_id = get_current_user_id()
    if not user_id:
        return dict(DEFAULT_SETTINGS)
    return get_user_settings(user_id, DEFAULT_SETTINGS)


def _mask_secret(value: str) -> str:
    if not value:
        return ''
    return value[:4] + '****' + value[-4:] if len(value) > 8 else '****'


def _normalize_repo_name(repo_name: str) -> str:
    return (repo_name or '').strip()


def _get_current_backup_path() -> str:
    user = get_current_user() or {}
    username = re.sub(r'[^a-zA-Z0-9._-]+', '_', user.get('username', '') or 'user')
    return f'data/user-backups/{username}.json'


def _build_backup_payload() -> dict:
    user = get_current_user() or {}
    settings = get_active_settings()
    return {
        'schema_version': 1,
        'exported_at': datetime.utcnow().isoformat() + 'Z',
        'user': {
            'username': user.get('username', ''),
            'display_name': user.get('display_name', ''),
        },
        'settings': {
            'preferred_api': settings.get('preferred_api', 'auto'),
            'auto_cache': bool(settings.get('auto_cache', True)),
        },
        'flights': list_user_flights(get_current_user_id()) if not is_legacy_mode() else load_json(FLIGHTS_FILE).get('flights', []),
    }


def _github_api_request(path, method='GET', body=None, token=''):
    req = urllib.request.Request(f'{GITHUB_API_BASE}{path}', method=method or 'GET')
    req.add_header('User-Agent', 'SkyTrace/2.0')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    payload = None
    if body is not None:
        payload = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data=payload, timeout=20) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='ignore')
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {}
        message = data.get('message') or f'HTTP {exc.code}'
        raise ValueError(message) from exc


def _resolve_backup_credentials(override=None):
    settings = get_active_settings()
    override = override or {}
    raw_token = (override.get('token') or '').strip()
    raw_repo = _normalize_repo_name(override.get('repo') or '')
    token = settings.get('github_backup_token', '')
    repo = settings.get('github_backup_repo', GITHUB_BACKUP_REPO_DEFAULT) or GITHUB_BACKUP_REPO_DEFAULT

    if raw_token and '****' not in raw_token:
        token = raw_token
    if raw_repo:
        repo = raw_repo

    if not token or not repo:
        raise ValueError('GitHub backup is not configured.')
    return token, repo


def base64_encode_utf8(content: str) -> str:
    return base64.b64encode(content.encode('utf-8')).decode('ascii')


def decode_github_base64(content: str) -> str:
    normalized = (content or '').replace('\n', '')
    return base64.b64decode(normalized).decode('utf-8')


@app.before_request
def load_current_user():
    g.current_user = None
    if is_legacy_mode():
        return

    user_id = session.get('user_id')
    if user_id:
        g.current_user = get_user_by_id(user_id)


def _set_logged_in_user(user):
    session.permanent = True
    session['user_id'] = user['id']


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if is_legacy_mode():
            return view(*args, **kwargs)
        if not get_current_user():
            return jsonify({'success': False, 'error': 'Authentication required', 'auth_required': True}), 401
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if is_legacy_mode():
            return jsonify({'success': False, 'error': 'Setup required'}), 409
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Authentication required', 'auth_required': True}), 401
        if not user.get('is_admin'):
            return jsonify({'success': False, 'error': 'Admin permission required'}), 403
        return view(*args, **kwargs)

    return wrapped


def normalize_flight_no(flight_no):
    """鏍囧噯鍖栬埅鐝彿: 鍘荤┖鏍?妯潬, 杞ぇ鍐?""
    return re.sub(r'[\s\-]', '', flight_no.upper().strip())


def extract_airline_code(flight_no):
    """浠庤埅鐝彿鎻愬彇鑸┖鍏徃浠ｇ爜 (2瀛楃)"""
    fn = normalize_flight_no(flight_no)
    match = re.match(r'^([A-Z0-9]{2})', fn)
    return match.group(1) if match else ''


def haversine_distance(lat1, lon1, lat2, lon2):
    """璁＄畻涓ょ偣闂寸殑澶у渾璺濈锛堝叕閲岋級"""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_flight_status_info(flight, airports_data=None):
    """鏍规嵁鑸彮淇℃伅璁＄畻鐘舵€佸拰鎻愰啋銆?

    鑸彮璁板綍閲屽瓨鍦ㄥ皯閲忓彧鏈夋棩鏈熴€佹病鏈夋椂鍒荤殑鍘嗗彶鏁版嵁銆傛棫瀹炵幇浼氱洿鎺ヨ繑鍥?
    ``unknown``锛屽鑷村湴鍥炬妸杩欎簺鍘嗗彶鑸彮褰撲綔 upcoming銆傝繖閲屼紭鍏堝皧閲嶆樉寮?
    ``status=completed``锛屽苟鍦ㄧ己澶辨椂鍒绘椂閫€鍖栦负鍩轰簬鏃ユ湡鐨勭姸鎬佸垽鏂€?
    """
    now = datetime.now()
    now_utc = datetime.now(UTC)
    explicit_completed = (flight.get('status') or '').lower() == 'completed'
    base_status = {
        'checkin_open': None,
        'checkin_close': None,
        'boarding_time': None,
        'dep_datetime': None,
        'arr_datetime': None,
        'status': 'scheduled',
        'countdown': None,
        'progress': 0,
    }

    try:
        flight_date = datetime.strptime(flight['date'], '%Y-%m-%d')
    except (ValueError, KeyError):
        if explicit_completed:
            status_info = base_status.copy()
            status_info['status'] = 'completed'
            status_info['progress'] = 100
            return status_info
        return {'status': 'unknown', 'countdown': None}

    dep_time_str = (flight.get('dep_time') or '').strip()
    if not dep_time_str:
        status_info = base_status.copy()
        if explicit_completed or flight_date.date() < now.date():
            status_info['status'] = 'completed'
            status_info['progress'] = 100
        else:
            days_left = (flight_date.date() - now.date()).days
            if days_left > 0:
                status_info['countdown'] = {'key': 'daysLeft', 'args': [days_left]}
        return status_info

    timeline = resolve_flight_timeline(flight, airports_data=airports_data)
    if not timeline:
        if explicit_completed:
            status_info = base_status.copy()
            status_info['status'] = 'completed'
            status_info['progress'] = 100
            return status_info
        return {'status': 'unknown', 'countdown': None}

    dep_local = timeline['dep_local']
    arr_local = timeline['arr_local']
    dep_utc = timeline['dep_utc']
    arr_utc = timeline['arr_utc']
    dep_now = now_utc.astimezone(dep_local.tzinfo)

    checkin_open = dep_local - timedelta(hours=24)
    checkin_close = dep_local - timedelta(minutes=45)
    boarding_time = dep_local - timedelta(minutes=40)
    checkin_open_utc = checkin_open.astimezone(UTC)
    boarding_time_utc = boarding_time.astimezone(UTC)

    flight_duration = (arr_utc - dep_utc).total_seconds()
    progress = 0
    if dep_utc < now_utc < arr_utc and flight_duration > 0:
        elapsed = (now_utc - dep_utc).total_seconds()
        progress = min(100, round(elapsed / flight_duration * 100))

    status_info = {
        'checkin_open': checkin_open.strftime('%Y-%m-%d %H:%M'),
        'checkin_close': checkin_close.strftime('%Y-%m-%d %H:%M'),
        'boarding_time': boarding_time.strftime('%Y-%m-%d %H:%M'),
        'dep_datetime': dep_local.strftime('%Y-%m-%d %H:%M'),
        'arr_datetime': arr_local.strftime('%Y-%m-%d %H:%M'),
        'status': 'scheduled',
        'countdown': None,
        'progress': progress,
    }

    if explicit_completed or now_utc > arr_utc:
        status_info['status'] = 'completed'
        status_info['progress'] = 100
    elif now_utc > dep_utc:
        status_info['status'] = 'in_flight'
        remaining = int((arr_utc - now_utc).total_seconds() // 60)
        status_info['countdown'] = {'key': 'etaMinutes', 'args': [remaining]}
    elif now_utc > boarding_time_utc:
        status_info['status'] = 'boarding'
        minutes_to_dep = int((dep_utc - now_utc).total_seconds() // 60)
        status_info['countdown'] = {'key': 'depInMinutes', 'args': [minutes_to_dep]}
    elif now_utc > checkin_open_utc:
        status_info['status'] = 'checkin_open'
        hours_left = (dep_utc - now_utc).total_seconds() / 3600
        if hours_left >= 1:
            status_info['countdown'] = {'key': 'depInHours', 'args': [int(hours_left)]}
        else:
            status_info['countdown'] = {'key': 'depInMinutes', 'args': [int(hours_left * 60)]}
    else:
        days_left = (flight_date.date() - dep_now.date()).days
        if days_left > 0:
            status_info['countdown'] = {'key': 'daysLeft', 'args': [days_left]}
        else:
            hours = int((checkin_open_utc - now_utc).total_seconds() // 3600)
            if hours > 0:
                status_info['countdown'] = {'key': 'hoursToCheckin', 'args': [hours]}

    return status_info


# ==================== 澶欰PI鑸彮鏌ヨ绯荤粺 ====================

def _http_get_json(url, headers=None, timeout=10):
    """閫氱敤 HTTP GET 杩斿洖 JSON"""
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SkyTrace/2.0')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def query_aviationstack(flight_no, date, api_key):
    """AviationStack API (鍏嶈垂鐗?500娆?鏈? 浠匟TTP)"""
    if not api_key:
        return None
    try:
        url = f"http://api.aviationstack.com/v1/flights?access_key={api_key}&flight_iata={flight_no}"
        if date:
            url += f"&flight_date={date}"
        data = _http_get_json(url)
        items = data.get('data') or []
        if items:
            f = items[0]
            dep = f.get('departure') or {}
            arr = f.get('arrival') or {}
            ac = f.get('aircraft') or {}
            return {
                'departure': dep.get('iata', ''),
                'arrival': arr.get('iata', ''),
                'dep_time': (dep.get('scheduled') or '')[11:16],
                'arr_time': (arr.get('scheduled') or '')[11:16],
                'dep_terminal': dep.get('terminal', ''),
                'arr_terminal': arr.get('terminal', ''),
                'dep_gate': dep.get('gate', ''),
                'arr_gate': arr.get('gate', ''),
                'aircraft': ac.get('iata', ''),
                'flight_status': f.get('flight_status', ''),
                'api_source': 'AviationStack',
            }
    except Exception as e:
        print(f"[AviationStack] 鏌ヨ澶辫触: {e}")
    return None


def query_airlabs(flight_no, date, api_key):
    """AirLabs API (鍏嶈垂鐗?1000娆?鏈? HTTPS)"""
    if not api_key:
        return None
    try:
        url = f"https://airlabs.co/api/v9/flights?api_key={api_key}&flight_iata={flight_no}"
        data = _http_get_json(url)
        items = data.get('response') or []
        if items:
            f = items[0]
            return {
                'departure': f.get('dep_iata', ''),
                'arrival': f.get('arr_iata', ''),
                'dep_time': (f.get('dep_time_utc') or (f.get('dep_time') or ''))[11:16],
                'arr_time': (f.get('arr_time_utc') or (f.get('arr_time') or ''))[11:16],
                'dep_terminal': f.get('dep_terminal', ''),
                'arr_terminal': f.get('arr_terminal', ''),
                'dep_gate': f.get('dep_gate', ''),
                'arr_gate': f.get('arr_gate', ''),
                'aircraft': f.get('aircraft_icao', ''),
                'flight_status': f.get('status', ''),
                'api_source': 'AirLabs',
            }
    except Exception as e:
        print(f"[AirLabs] 鏌ヨ澶辫触: {e}")
    return None


def query_aerodata(flight_no, date, api_key):
    """AeroDataBox via RapidAPI (鍏嶈垂鐗堟湁闄愭鏁?"""
    if not api_key:
        return None
    try:
        search_date = date or datetime.now().strftime('%Y-%m-%d')
        url = f"https://aerodatabox.p.rapidapi.com/flights/number/{flight_no}/{search_date}T00:00/{search_date}T23:59"
        headers = {
            'X-RapidAPI-Key': api_key,
            'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        }
        data = _http_get_json(url, headers=headers)
        if data and isinstance(data, list) and len(data) > 0:
            f = data[0]
            dep = f.get('departure') or {}
            arr = f.get('arrival') or {}
            dep_airport = dep.get('airport') or {}
            arr_airport = arr.get('airport') or {}
            dep_sched = (dep.get('scheduledTime') or {}).get('local', '') or ''
            arr_sched = (arr.get('scheduledTime') or {}).get('local', '') or ''
            ac = f.get('aircraft') or {}
            return {
                'departure': dep_airport.get('iata', ''),
                'arrival': arr_airport.get('iata', ''),
                'dep_time': dep_sched[11:16] if len(dep_sched) > 16 else '',
                'arr_time': arr_sched[11:16] if len(arr_sched) > 16 else '',
                'dep_terminal': dep.get('terminal', ''),
                'arr_terminal': arr.get('terminal', ''),
                'dep_gate': dep.get('gate', ''),
                'arr_gate': arr.get('gate', ''),
                'aircraft': ac.get('model', ''),
                'flight_status': f.get('status', ''),
                'api_source': 'AeroDataBox',
            }
    except urllib.error.HTTPError as e:
        body = ''
        try: body = e.read().decode()
        except: pass
        print(f"[AeroDataBox] HTTP {e.code}: {body}")
    except Exception as e:
        print(f"[AeroDataBox] 鏌ヨ澶辫触: {e}")
    return None


def query_all_apis(flight_no, date, settings=None):
    """鎸変紭鍏堢骇渚濇灏濊瘯鎵€鏈夊凡閰嶇疆鐨?API"""
    settings = settings or get_active_settings()
    preferred = settings.get('preferred_api', 'auto')

    apis = [
        ('aerodata', query_aerodata, settings.get('aerodata_key', '')),
        ('airlabs', query_airlabs, settings.get('airlabs_key', '')),
        ('aviationstack', query_aviationstack, settings.get('aviationstack_key', '')),
    ]

    # 浼樺厛浣跨敤鐢ㄦ埛鎸囧畾鐨?API
    if preferred != 'auto':
        apis.sort(key=lambda x: 0 if x[0] == preferred else 1)

    for name, query_fn, key in apis:
        if key:
            result = query_fn(flight_no, date, key)
            if result and result.get('departure'):
                # 鑷姩缂撳瓨鍒版湰鍦?
                cache_flight_result(flight_no, result)
                return result
    return None


def cache_flight_result(flight_no, result):
    """灏?API 鏌ヨ缁撴灉缂撳瓨鍒版湰鍦版椂鍒昏〃"""
    try:
        schedules = load_json(SCHEDULES_FILE)
        fn = normalize_flight_no(flight_no)
        schedules[fn] = {
            'departure': result.get('departure', ''),
            'arrival': result.get('arrival', ''),
            'dep_time': result.get('dep_time', ''),
            'arr_time': result.get('arr_time', ''),
            'aircraft': result.get('aircraft', ''),
            'dep_terminal': result.get('dep_terminal', ''),
            'arr_terminal': result.get('arr_terminal', ''),
            'cached_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'source': result.get('api_source', 'api'),
        }
        save_json(SCHEDULES_FILE, schedules)
    except Exception as e:
        print(f"[缂撳瓨] 鍐欏叆澶辫触: {e}")


def find_in_local_data(flight_no):
    """浠庢湰鍦版椂鍒昏〃缂撳瓨 + 鐢ㄦ埛鍘嗗彶璁板綍涓煡鎵?""
    fn = normalize_flight_no(flight_no)

    # 1. 鏈湴鏃跺埢琛ㄧ紦瀛?
    schedules = load_json(SCHEDULES_FILE)
    if fn in schedules:
        entry = schedules[fn]
        if isinstance(entry, dict) and entry.get('departure'):
            return {
                'departure': entry.get('departure', ''),
                'arrival': entry.get('arrival', ''),
                'dep_time': entry.get('dep_time', ''),
                'arr_time': entry.get('arr_time', ''),
                'aircraft': entry.get('aircraft', ''),
                'dep_terminal': entry.get('dep_terminal', ''),
                'arr_terminal': entry.get('arr_terminal', ''),
                'source': 'schedule',
            }

    # 2. 鐢ㄦ埛鐨勫巻鍙茶埅鐝褰?
    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        for flight in data.get('flights', []):
            if normalize_flight_no(flight.get('flight_no', '')) == fn:
                return {
                    'departure': flight.get('departure', ''),
                    'arrival': flight.get('arrival', ''),
                    'dep_time': flight.get('dep_time', ''),
                    'arr_time': flight.get('arr_time', ''),
                    'aircraft': flight.get('aircraft', ''),
                    'dep_terminal': flight.get('dep_terminal', ''),
                    'arr_terminal': flight.get('arr_terminal', ''),
                    'source': 'history',
                }
    else:
        user_id = get_current_user_id()
        if user_id:
            flight = find_user_flight_by_number(user_id, fn)
            if flight:
                return {
                    'departure': flight.get('departure', ''),
                    'arrival': flight.get('arrival', ''),
                    'dep_time': flight.get('dep_time', ''),
                    'arr_time': flight.get('arr_time', ''),
                    'aircraft': flight.get('aircraft', ''),
                    'dep_terminal': flight.get('dep_terminal', ''),
                    'arr_terminal': flight.get('arr_terminal', ''),
                    'source': 'history',
                }

    return None


# ==================== Logo 浠ｇ悊缂撳瓨 ====================

@app.route('/api/logo-proxy')
def logo_proxy():
    """Proxy and cache remote airline logos to local disk"""
    import hashlib
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


# ==================== 椤甸潰璺敱 ====================

APP_VERSION = 49

@app.route('/api/version')
def get_app_version():
    return jsonify({'version': APP_VERSION})

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.after_request
def add_cache_headers(response):
    """Prevent aggressive caching during development"""
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/sw.js')
def service_worker():
    """Serve SW from root scope for PWA"""
    return send_from_directory('.', 'sw.js', mimetype='application/javascript')


@app.route('/favicon.ico')
def favicon():
    return send_from_directory('.', 'favicon.ico', mimetype='image/x-icon')


@app.route('/debug')
def debug_page():
    """绾唴鑱旇瘖鏂〉闈?- 涓嶄緷璧栦换浣曞閮ㄨ祫婧?""
    return '''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SkyTrace Debug</title>
<style>
body{font-family:monospace;background:#0f172a;color:#e2e8f0;padding:20px;font-size:14px;max-width:600px;margin:0 auto;}
h1{color:#3b82f6;font-size:18px;}
.ok{color:#22c55e;} .fail{color:#ef4444;} .warn{color:#f59e0b;}
.test{margin:8px 0;padding:8px;background:#1e293b;border-radius:6px;}
button{background:#3b82f6;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;margin:5px;}
button:hover{background:#2563eb;}
#results{margin-top:20px;}
</style></head><body>
<h1>鉁堬笍 SkyTrace 璇婃柇宸ュ叿</h1>
<button onclick="runTests()">馃攳 寮€濮嬭瘖鏂?/button>
<button onclick="clearSW()">馃棏锔?娓呴櫎SW+缂撳瓨</button>
<button onclick="location.href='/'">馃彔 鍥炲埌棣栭〉</button>
<div id="results"></div>
<script>
var results = document.getElementById('results');
function log(msg, cls) { results.innerHTML += '<div class="test ' + (cls||'') + '">' + msg + '</div>'; }

async function runTests() {
    results.innerHTML = '';
    log('鈴?寮€濮嬭瘖鏂?..');

    // 1. Service Worker 鐘舵€?
    if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        log('Service Worker 鏁伴噺: ' + regs.length, regs.length > 0 ? 'warn' : 'ok');
        regs.forEach(function(r) { log('  SW scope: ' + r.scope + ', active: ' + (r.active ? r.active.scriptURL : 'none')); });
    } else { log('Service Worker: 涓嶆敮鎸?, 'warn'); }

    // 2. Cache Storage
    var cacheNames = await caches.keys();
    log('缂撳瓨鏁伴噺: ' + cacheNames.length, cacheNames.length > 0 ? 'warn' : 'ok');
    cacheNames.forEach(function(n) { log('  缂撳瓨: ' + n); });

    // 3. 娴嬭瘯鍏抽敭璧勬簮
    var files = [
        {url: '/static/lib/leaflet.js', name: 'Leaflet.js'},
        {url: '/static/lib/arc.js', name: 'arc.js'},
        {url: '/static/lib/html2canvas.min.js', name: 'html2canvas'},
        {url: '/static/js/app.js', name: 'app.js'},
        {url: '/static/js/i18n.js', name: 'i18n.js'},
        {url: '/static/css/style.css', name: 'style.css'},
        {url: '/api/airports', name: 'airports API'},
        {url: '/api/flights', name: 'flights API'},
    ];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
            var start = Date.now();
            var resp = await fetch(f.url + '?_t=' + Date.now());
            var elapsed = Date.now() - start;
            var size = parseInt(resp.headers.get('content-length') || '0');
            if (!size) { var blob = await resp.clone().blob(); size = blob.size; }
            var sizeStr = size > 1024 ? (size/1024).toFixed(0) + 'KB' : size + 'B';
            log(f.name + ': ' + resp.status + ' (' + sizeStr + ', ' + elapsed + 'ms)', resp.ok ? 'ok' : 'fail');
        } catch(e) { log(f.name + ': 鉂?' + e.message, 'fail'); }
    }

    // 4. 娴嬭瘯澶栭儴鍦板浘鐡︾墖
    try {
        var start2 = Date.now();
        var tileResp = await fetch('https://a.basemaps.cartocdn.com/dark_all/3/4/3.png');
        log('鍦板浘鐡︾墖 (CartoDB): ' + tileResp.status + ' (' + (Date.now()-start2) + 'ms)', tileResp.ok ? 'ok' : 'fail');
    } catch(e) { log('鍦板浘鐡︾墖 (CartoDB): 鉂?鏃犳硶杩炴帴 - ' + e.message, 'fail'); }

    log('鉁?璇婃柇瀹屾垚');
}

async function clearSW() {
    results.innerHTML = '';
    // 娉ㄩ攢鎵€鏈?SW
    if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        for (var r of regs) { await r.unregister(); log('宸叉敞閿€ SW: ' + r.scope, 'ok'); }
    }
    // 娓呴櫎鎵€鏈夌紦瀛?
    var names = await caches.keys();
    for (var n of names) { await caches.delete(n); log('宸插垹闄ょ紦瀛? ' + n, 'ok'); }
    log('鉁?鎵€鏈?SW 鍜岀紦瀛樺凡娓呴櫎! 鐜板湪鍙互鍥炲埌棣栭〉浜?, 'ok');
}
</script></body></html>''', 200, {'Content-Type': 'text/html; charset=utf-8'}


# ==================== API 璺敱: 璁よ瘉 & 鍒濆鍖?====================

@app.route('/api/auth/state', methods=['GET'])
def auth_state():
    user = get_current_user()
    legacy_mode = is_legacy_mode()
    return jsonify({
        'needs_setup': legacy_mode,
        'authenticated': bool(user),
        'storage_mode': 'legacy' if legacy_mode else 'multi_user',
        'user': user,
    })


@app.route('/api/setup', methods=['POST'])
def setup_admin_account():
    if not is_legacy_mode():
        return jsonify({'success': False, 'error': 'Setup has already been completed.'}), 409

    body = request.json or {}
    username = body.get('username', '')
    password = body.get('password', '')
    display_name = body.get('display_name', '')

    try:
        user = bootstrap_admin_user(
            username=username,
            password=password,
            display_name=display_name,
            legacy_flights_file=FLIGHTS_FILE,
            legacy_settings_file=SETTINGS_FILE,
            defaults=DEFAULT_SETTINGS,
        )
        _set_logged_in_user(user)
        return jsonify({'success': True, 'user': user})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@app.route('/api/auth/login', methods=['POST'])
def login():
    if is_legacy_mode():
        return jsonify({'success': False, 'error': 'Please finish setup first.'}), 409

    client_ip = request.remote_addr or 'unknown'
    if not _check_login_rate_limit(client_ip):
        return jsonify({'success': False, 'error': 'Too many login attempts. Please try again later.'}), 429

    body = request.json or {}
    user = verify_user_credentials(body.get('username', ''), body.get('password', ''))
    if not user:
        _record_login_attempt(client_ip)
        return jsonify({'success': False, 'error': 'Invalid username or password.'}), 401

    _set_logged_in_user(user)
    return jsonify({'success': True, 'user': user})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_admin_users():
    return jsonify({'success': True, 'users': list_users()})


@app.route('/api/admin/users', methods=['POST'])
@admin_required
def create_admin_user():
    body = request.json or {}
    try:
        user = create_user(
            username=body.get('username', ''),
            password=body.get('password', ''),
            display_name=body.get('display_name', ''),
            is_admin=bool(body.get('is_admin')),
        )
        return jsonify({'success': True, 'user': user})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_admin_user(user_id):
    current = get_current_user()
    if current and current.get('id') == user_id:
        return jsonify({'success': False, 'error': 'Cannot delete yourself.'}), 400
    if not delete_user(user_id):
        return jsonify({'success': False, 'error': 'User not found.'}), 404
    return jsonify({'success': True})


@app.route('/api/admin/users/<int:user_id>/password', methods=['PUT'])
@admin_required
def reset_user_password(user_id):
    body = request.json or {}
    new_password = body.get('password', '')
    try:
        if not change_user_password(user_id, new_password):
            return jsonify({'success': False, 'error': 'User not found.'}), 404
        return jsonify({'success': True})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400


@app.route('/api/auth/password', methods=['PUT'])
@login_required
def change_own_password():
    body = request.json or {}
    new_password = body.get('password', '')
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters.'}), 400
    change_user_password(get_current_user_id(), new_password)
    return jsonify({'success': True})


# ==================== API 璺敱: 鏈哄満 & 鑸┖鍏徃 ====================

@app.route('/api/airports', methods=['GET'])
def get_airports():
    return jsonify(load_airports_data())


@app.route('/api/airports/search', methods=['GET'])
def search_airports():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({})

    airports = load_airports_data()
    q = query.lower()
    results = {}
    for code, info in airports.items():
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


@app.route('/api/airlines', methods=['GET'])
def get_airlines():
    return jsonify(load_json(AIRLINES_FILE))


# ==================== API 璺敱: 鑸彮鏅鸿兘鏌ヨ ====================

@app.route('/api/flight/lookup', methods=['GET'])
@login_required
def lookup_flight():
    """
    鏅鸿兘鑸彮鏌ヨ 鈥?澶氱骇 fallback:
      1. 鍦ㄧ嚎 API (AviationStack / AirLabs / AeroDataBox)
      2. 鏈湴鏃跺埢琛ㄧ紦瀛?
      3. 鐢ㄦ埛鍘嗗彶鑸彮
    """
    raw = request.args.get('flight_no', '')
    date = request.args.get('date', '')
    flight_no = normalize_flight_no(raw)

    if not flight_no or len(flight_no) < 3:
        return jsonify({'success': False, 'error': '璇疯緭鍏ユ湁鏁堣埅鐝彿'}), 400

    airline_code = extract_airline_code(flight_no)
    airlines = load_json(AIRLINES_FILE)

    result = {
        'success': True,
        'flight_no': flight_no,
        'date': date,
        'airline': airlines.get(airline_code, {}).get('name', ''),
        'airline_code': airline_code,
        'departure': '',
        'arrival': '',
        'dep_time': '',
        'arr_time': '',
        'dep_terminal': '',
        'arr_terminal': '',
        'dep_gate': '',
        'arr_gate': '',
        'aircraft': '',
        'flight_status': '',
        'source': 'none',
        'api_configured': False,
    }

    # 妫€鏌ユ槸鍚︽湁鍙敤鐨?API
    settings = get_active_settings()
    has_api = bool(settings.get('aviationstack_key') or
                   settings.get('airlabs_key') or
                   settings.get('aerodata_key'))
    result['api_configured'] = has_api

    # --- Level 1: API鏌ヨ ---
    if has_api:
        api_result = query_all_apis(flight_no, date, settings=settings)
        if api_result and api_result.get('departure'):
            for k, v in api_result.items():
                if v:
                    result[k] = v
            result['source'] = 'api'
            # 鑷姩琛ュ叏缂哄け鐨勮埅绔欐ゼ
            fill_terminal(result)
            return jsonify(result)

    # --- Level 2 & 3: 鏈湴鏁版嵁 ---
    local = find_in_local_data(flight_no)
    if local and local.get('departure'):
        for k in ['departure', 'arrival', 'dep_time', 'arr_time', 'aircraft',
                   'dep_terminal', 'arr_terminal']:
            if local.get(k):
                result[k] = local[k]
        result['source'] = local.get('source', 'local')
        # 鑷姩琛ュ叏缂哄け鐨勮埅绔欐ゼ
        fill_terminal(result)
        return jsonify(result)

    return jsonify(result)


@app.route('/api/flight/status', methods=['GET'])
@login_required
def get_flight_live_status():
    """鑾峰彇鑸彮瀹炴椂鐘舵€侊紙闇€閰嶇疆API锛?""
    flight_no = normalize_flight_no(request.args.get('flight_no', ''))
    date = request.args.get('date', '')

    if not flight_no:
        return jsonify({'success': False, 'error': '璇疯緭鍏ヨ埅鐝彿'}), 400

    api_result = query_all_apis(flight_no, date, settings=get_active_settings())
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

    return jsonify({'success': False, 'error': '鏃犳硶鑾峰彇瀹炴椂鐘舵€侊紝璇烽厤缃瓵PI瀵嗛挜'})


# ==================== API 璺敱: 璁剧疆绠＄悊 ====================

@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings_api():
    """鑾峰彇璁剧疆锛圓PI key 鎵撶爜鏄剧ず锛?""
    settings = get_active_settings()
    safe = {}
    sensitive_fields = {'aviationstack_key', 'airlabs_key', 'aerodata_key', 'github_backup_token'}
    for k, v in settings.items():
        if k in sensitive_fields and v:
            safe[k] = _mask_secret(v)
            safe[k + '_set'] = True
        elif k in sensitive_fields:
            safe[k] = ''
            safe[k + '_set'] = False
        else:
            safe[k] = v
    return jsonify(safe)


@app.route('/api/settings', methods=['POST'])
@login_required
def save_settings_api():
    """淇濆瓨璁剧疆"""
    new = request.json or {}
    if is_legacy_mode():
        current = get_settings()
        for k, v in new.items():
            if isinstance(v, str) and '****' in v:
                continue  # 涓嶈鐩栨墦鐮佸€?
            current[k] = v
            current[k] = v
        save_json(SETTINGS_FILE, current)
    else:
        save_user_settings(get_current_user_id(), new, DEFAULT_SETTINGS)
    return jsonify({'success': True})


@app.route('/api/settings/test', methods=['POST'])
@login_required
def test_api_connection():
    """娴嬭瘯 API 杩炴帴"""
    try:
        body = request.json or {}
        api_name = body.get('api', '')
        api_key = body.get('key', '')

        if not api_key or '****' in api_key:
            return jsonify({'success': False, 'message': '璇疯緭鍏ユ湁鏁堢殑API瀵嗛挜'})

        # 鐢ㄤ竴涓父瑙佽埅鐝彿鍋氭祴璇?
        test_fn = 'CZ3101'
        result = None
        if api_name == 'aviationstack':
            result = query_aviationstack(test_fn, '', api_key)
        elif api_name == 'airlabs':
            result = query_airlabs(test_fn, '', api_key)
        elif api_name == 'aerodata':
            result = query_aerodata(test_fn, '', api_key)

        if result and result.get('departure'):
            return jsonify({'success': True, 'message': f'鉁?杩炴帴鎴愬姛锛佹煡鍒?{test_fn} 鑸彮淇℃伅'})
        elif result:
            return jsonify({'success': True, 'message': '鉁?API杩炴帴鎴愬姛 (娴嬭瘯鑸彮鏆傛棤鏁版嵁)'})
        elif result is None:
            return jsonify({'success': False, 'message': '鉂?杩炴帴澶辫触锛岃妫€鏌ュ瘑閽ユ槸鍚︽纭紙璇︽儏瑙佹帶鍒跺彴锛?})
        else:
            return jsonify({'success': False, 'message': '鉂?杩炴帴澶辫触锛岃妫€鏌ュ瘑閽ユ槸鍚︽纭?})
    except Exception as e:
        print(f'[API Test] 寮傚父: {e}')
        return jsonify({'success': False, 'message': f'鉂?娴嬭瘯寮傚父: {e}'})


# ==================== API 璺敱: 鑸彮 CRUD ====================

@app.route('/api/backup/github/test', methods=['POST'])
@login_required
def test_github_backup():
    try:
        body = request.json or {}
        token, repo = _resolve_backup_credentials(body)
        data = _github_api_request(f'/repos/{repo}', 'GET', None, token)
        return jsonify({
            'success': True,
            'repo': data.get('full_name', repo),
            'visibility': data.get('visibility', ''),
            'path': _get_current_backup_path(),
        })
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@app.route('/api/backup/github/push', methods=['POST'])
@login_required
def push_github_backup():
    try:
        body = request.json or {}
        token, repo = _resolve_backup_credentials(body)
        payload = _build_backup_payload()
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        backup_path = _get_current_backup_path()

        sha = None
        try:
            existing = _github_api_request(f'/repos/{repo}/contents/{backup_path}', 'GET', None, token)
            sha = existing.get('sha')
        except ValueError:
            sha = None

        request_body = {
            'message': f"backup: sync {payload['user']['username']} ({len(payload['flights'])} flights) via SkyTrace",
            'content': base64_encode_utf8(content),
        }
        if sha:
            request_body['sha'] = sha

        _github_api_request(f'/repos/{repo}/contents/{backup_path}', 'PUT', request_body, token)

        if not is_legacy_mode():
            save_user_settings(get_current_user_id(), {
                'github_backup_token': token,
                'github_backup_repo': repo,
            }, DEFAULT_SETTINGS)
        return jsonify({
            'success': True,
            'repo': repo,
            'path': backup_path,
            'flight_count': len(payload['flights']),
        })
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@app.route('/api/backup/github/pull', methods=['POST'])
@login_required
def pull_github_backup():
    try:
        body = request.json or {}
        token, repo = _resolve_backup_credentials(body)
        backup_path = _get_current_backup_path()
        file = _github_api_request(f'/repos/{repo}/contents/{backup_path}', 'GET', None, token)
        content = decode_github_base64(file.get('content', ''))
        payload = json.loads(content)
        flights = payload.get('flights', [])
        settings = payload.get('settings', {})

        if not isinstance(flights, list):
            raise ValueError('Backup payload is invalid.')

        if is_legacy_mode():
            save_json(FLIGHTS_FILE, {'flights': flights})
            current = get_settings()
            for key in ('preferred_api', 'auto_cache'):
                if key in settings:
                    current[key] = settings[key]
            save_json(SETTINGS_FILE, current)
        else:
            replace_user_flights(get_current_user_id(), flights)
            safe_settings = {key: settings[key] for key in ('preferred_api', 'auto_cache') if key in settings}
            if safe_settings:
                save_user_settings(get_current_user_id(), safe_settings, DEFAULT_SETTINGS)
            save_user_settings(get_current_user_id(), {
                'github_backup_token': token,
                'github_backup_repo': repo,
            }, DEFAULT_SETTINGS)

        return jsonify({
            'success': True,
            'repo': repo,
            'path': backup_path,
            'flight_count': len(flights),
        })
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@app.route('/api/flights', methods=['GET'])
@login_required
def get_flights():
    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        flights = data.get('flights', [])
    else:
        flights = list_user_flights(get_current_user_id())
    airports = load_airports_data()

    enhanced = []
    for flight in flights:
        f = flight.copy()
        # 鑷姩琛ュ叏缂哄け鐨勮埅绔欐ゼ淇℃伅
        fill_terminal(f)

        # 缁忓仠淇℃伅: 鏌ユ壘缁忓仠鏈哄満鍚嶇О
        if f.get('stopover'):
            stop_code = f['stopover']
            stop_airport = airports.get(stop_code, {})
            f['stopover_airport'] = stop_airport

        dep_airport = airports.get(flight.get('departure', ''), {})
        arr_airport = airports.get(flight.get('arrival', ''), {})
        f['dep_airport'] = dep_airport
        f['arr_airport'] = arr_airport

        if dep_airport and arr_airport and dep_airport.get('lat') and arr_airport.get('lat'):
            f['distance'] = round(haversine_distance(
                dep_airport['lat'], dep_airport['lon'],
                arr_airport['lat'], arr_airport['lon']
            ))
        else:
            f['distance'] = 0

        f['status_info'] = get_flight_status_info(f, airports)
        enhanced.append(f)

    enhanced.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(enhanced)


@app.route('/api/flights', methods=['POST'])
@login_required
def add_flight():
    flight = request.json
    flight['id'] = str(uuid.uuid4())[:8]

    # 鑷姩缂撳瓨鑸彮璺嚎鍒版湰鍦版椂鍒昏〃
    fn = normalize_flight_no(flight.get('flight_no', ''))
    if fn and flight.get('departure') and flight.get('arrival'):
        try:
            schedules = load_json(SCHEDULES_FILE)
            if fn not in schedules:
                schedules[fn] = {
                    'departure': flight['departure'],
                    'arrival': flight['arrival'],
                    'dep_time': flight.get('dep_time', ''),
                    'arr_time': flight.get('arr_time', ''),
                    'aircraft': flight.get('aircraft', ''),
                    'cached_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
                    'source': 'user',
                }
                save_json(SCHEDULES_FILE, schedules)
        except Exception:
            pass

    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        if 'flights' not in data:
            data['flights'] = []
        data['flights'].append(flight)
        save_json(FLIGHTS_FILE, data)
    else:
        add_user_flight(get_current_user_id(), flight)
    return jsonify({'success': True, 'id': flight['id']})


@app.route('/api/flights/<flight_id>', methods=['PUT'])
@login_required
def update_flight(flight_id):
    updated = request.json
    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        for i, f in enumerate(data.get('flights', [])):
            if f['id'] == flight_id:
                updated['id'] = flight_id
                # 淇濈暀鍚庡彴绠＄悊鐨勫瓧娈碉紙濡傝仈绋嬪垎缁勶級锛屽墠绔湭浼犳椂涓嶄涪澶?
                for key in ('connected_group',):
                    if key in f and key not in updated:
                        updated[key] = f[key]
                data['flights'][i] = updated
                save_json(FLIGHTS_FILE, data)
                return jsonify({'success': True})
    else:
        saved = update_user_flight(get_current_user_id(), flight_id, updated)
        if saved is not None:
            return jsonify({'success': True})
    return jsonify({'success': False, 'error': '鑸彮涓嶅瓨鍦?}), 404


@app.route('/api/flights/<flight_id>', methods=['DELETE'])
@login_required
def delete_flight(flight_id):
    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        data['flights'] = [f for f in data.get('flights', []) if f['id'] != flight_id]
        save_json(FLIGHTS_FILE, data)
    else:
        if not delete_user_flight(get_current_user_id(), flight_id):
            return jsonify({'success': False, 'error': '鑸彮涓嶅瓨鍦?}), 404
    return jsonify({'success': True})


# ==================== API 璺敱: 缁熻 ====================

@app.route('/api/flights/connect', methods=['POST'])
@login_required
def connect_flights():
    """鑱旂▼: 灏嗗涓埅鐝粦瀹氫负涓€缁?(鑷姩鍚堝苟宸叉湁鑱旂▼)"""
    body = request.json or {}
    flight_ids = body.get('flight_ids', [])
    if len(flight_ids) < 2:
        return jsonify({'success': False, 'error': '鑷冲皯閫夋嫨2涓埅鐝?}), 400

    if not is_legacy_mode():
        group_id = connect_user_flights(get_current_user_id(), flight_ids)
        if not group_id:
            return jsonify({'success': False, 'error': '鑷冲皯閫夋嫨2涓埅鐝?}), 400
        return jsonify({'success': True, 'group_id': group_id})

    data = load_json(FLIGHTS_FILE)
    all_flights = data.get('flights', [])

    # 鏀堕泦鎵€閫夎埅鐝凡鏈夌殑 connected_group
    existing_groups = set()
    for f in all_flights:
        if f['id'] in flight_ids and f.get('connected_group'):
            existing_groups.add(f['connected_group'])

    # 浣跨敤宸叉湁鐨?group_id 涔嬩竴, 鎴栧垱寤烘柊鐨?
    if existing_groups:
        group_id = sorted(existing_groups)[0]
        # 灏嗗叾浠栫粍鐨勮埅鐝篃鍚堝苟杩涙潵
        for f in all_flights:
            if f.get('connected_group') in existing_groups:
                f['connected_group'] = group_id
    else:
        group_id = str(uuid.uuid4())[:8]

    # 缁欓€変腑鐨勮埅鐝墦涓?group_id
    for f in all_flights:
        if f['id'] in flight_ids:
            f['connected_group'] = group_id

    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True, 'group_id': group_id})


@app.route('/api/flights/disconnect', methods=['POST'])
@login_required
def disconnect_flights():
    """鑱旂▼: 瑙ｉ櫎鑱旂▼缁戝畾 (鏀寔鏁寸粍瑙ｉ櫎鎴栭儴鍒嗚В闄?"""
    body = request.json or {}
    group_id = body.get('group_id', '')
    flight_ids = body.get('flight_ids', [])

    if not group_id and not flight_ids:
        return jsonify({'success': False, 'error': '缂哄皯group_id鎴杅light_ids'}), 400

    if not is_legacy_mode():
        if not disconnect_user_flights(get_current_user_id(), group_id=group_id, flight_ids=flight_ids):
            return jsonify({'success': False, 'error': '缂哄皯group_id鎴杅light_ids'}), 400
        return jsonify({'success': True})

    data = load_json(FLIGHTS_FILE)
    all_flights = data.get('flights', [])

    if flight_ids:
        # 閮ㄥ垎瑙ｉ櫎: 鍙Щ闄ゆ寚瀹氳埅鐝殑 connected_group
        affected_groups = set()
        for f in all_flights:
            if f['id'] in flight_ids and f.get('connected_group'):
                affected_groups.add(f['connected_group'])
                f.pop('connected_group', None)
        # 娓呯悊娈嬩綑: 濡傛灉鏌愪釜缁勫墿浣?鈮? 涓埅鐝? 涔熻В闄?
        for gid in affected_groups:
            remaining = [f for f in all_flights if f.get('connected_group') == gid]
            if len(remaining) <= 1:
                for f in remaining:
                    f.pop('connected_group', None)
    else:
        # 鏁寸粍瑙ｉ櫎
        for f in all_flights:
            if f.get('connected_group') == group_id:
                f.pop('connected_group', None)

    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True})


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    if is_legacy_mode():
        data = load_json(FLIGHTS_FILE)
        all_flights = data.get('flights', [])
    else:
        all_flights = list_user_flights(get_current_user_id())
    airports_data = load_airports_data()

    # 骞翠唤绛涢€?
    year = request.args.get('year', '')
    if year and year != 'all':
        flights = [f for f in all_flights if f.get('date', '').startswith(year)]
    else:
        flights = all_flights

    # 鏀堕泦鎵€鏈夊彲鐢ㄥ勾浠?
    available_years = sorted(set(f.get('date', '')[:4] for f in all_flights if len(f.get('date', '')) >= 4), reverse=True)

    total_distance = 0
    visited_airports = set()
    visited_countries = set()
    durations = []          # 姣忔椋炶鏃堕暱(h)
    distances = []          # 姣忔椋炶璺濈(km)

    for flight in flights:
        visited_airports.add(flight.get('departure', ''))
        visited_airports.add(flight.get('arrival', ''))
        dep = airports_data.get(flight.get('departure', ''), {})
        arr = airports_data.get(flight.get('arrival', ''), {})
        if dep.get('country'):
            visited_countries.add(dep['country'])
        if arr.get('country'):
            visited_countries.add(arr['country'])
        dist = 0
        if dep.get('lat') and arr.get('lat'):
            dist = haversine_distance(dep['lat'], dep['lon'], arr['lat'], arr['lon'])
            total_distance += dist
        distances.append(round(dist))

    total_hours = 0
    for flight in flights:
        minutes = calculate_duration_minutes(flight, airports_data=airports_data)
        if minutes is None:
            durations.append(0)
            continue
        diff = minutes / 60
        total_hours += diff
        durations.append(round(diff, 1))

    visited_airports.discard('')
    visited_countries.discard('')

    # 鏈€甯搁鑸嚎
    route_counts = {}
    for flight in flights:
        route = f"{flight.get('departure','')}-{flight.get('arrival','')}"
        if '-' != route:
            route_counts[route] = route_counts.get(route, 0) + 1
    top_routes = sorted(route_counts.items(), key=lambda x: -x[1])[:5]

    # 鏈€甯哥敤鑸┖鍏徃
    airline_counts = {}
    for flight in flights:
        al = flight.get('airline', '') or extract_airline_code(flight.get('flight_no', ''))
        if al:
            airline_counts[al] = airline_counts.get(al, 0) + 1
    top_airlines = sorted(airline_counts.items(), key=lambda x: -x[1])[:5]

    # ========== 瓒ｅ懗缁熻 ==========
    # 1. 搴т綅鍋忓ソ鍒嗘瀽
    seat_window, seat_aisle, seat_middle = 0, 0, 0
    for flight in flights:
        seat = (flight.get('seat') or '').upper().strip()
        if not seat:
            continue
        letter = seat[-1] if seat else ''
        if letter in ('A', 'K', 'F'):
            seat_window += 1
        elif letter in ('C', 'D', 'G', 'H'):
            seat_aisle += 1
        else:
            seat_middle += 1

    # 2. 鑸变綅鍒嗗竷
    cabin_counts = {}
    for flight in flights:
        cab = flight.get('class', 'economy') or 'economy'
        cabin_counts[cab] = cabin_counts.get(cab, 0) + 1

    # 3. 鏈€鏃?鏈€鏅氳埅鐝?
    earliest_flight = None
    latest_flight = None
    for flight in flights:
        dep_t = flight.get('dep_time', '')
        if not dep_t:
            continue
        if earliest_flight is None or dep_t < earliest_flight.get('dep_time', ''):
            earliest_flight = flight
        if latest_flight is None or dep_t > latest_flight.get('dep_time', ''):
            latest_flight = flight

    # 4. 鏈€闀?鏈€鐭埅鐝?
    longest_idx = max(range(len(distances)), key=lambda i: distances[i]) if distances else -1
    shortest_idx = min(range(len(distances)), key=lambda i: distances[i] if distances[i] > 0 else 99999) if distances else -1

    # 5. 鏈堝害鍒嗗竷
    month_counts = {}
    for flight in flights:
        d = flight.get('date', '')
        if len(d) >= 7:
            month_counts[d[:7]] = month_counts.get(d[:7], 0) + 1

    # 6. 鏄熸湡鍒嗗竷 (鍚瘡澶╄埅鐝槑缁?
    weekday_counts = [0] * 7
    weekday_flights_detail = [[] for _ in range(7)]
    for flight in flights:
        try:
            wd = datetime.strptime(flight['date'], '%Y-%m-%d').weekday()
            weekday_counts[wd] += 1
            weekday_flights_detail[wd].append({
                'flight_no': flight.get('flight_no', ''),
                'route': f"{flight.get('departure','')}-{flight.get('arrival','')}",
                'date': flight.get('date', ''),
            })
        except (ValueError, KeyError):
            pass

    # 鏈堝害鑸彮鏄庣粏
    month_flights_detail = {}
    day_flights_detail = {}
    for flight in flights:
        d = flight.get('date', '')
        if len(d) >= 7:
            m = d[:7]
            if m not in month_flights_detail:
                month_flights_detail[m] = []
            flight_info = {
                'flight_no': flight.get('flight_no', ''),
                'route': f"{flight.get('departure','')}-{flight.get('arrival','')}",
                'date': flight.get('date', ''),
            }
            month_flights_detail[m].append(flight_info)
            if len(d) >= 10:
                if d not in day_flights_detail:
                    day_flights_detail[d] = []
                day_flights_detail[d].append(flight_info)

    # 7. 骞冲潎椋炶璺濈/鏃堕暱
    avg_distance = round(total_distance / len(flights)) if flights else 0
    avg_hours = round(total_hours / len(flights), 1) if flights else 0

    fun_stats = {
        'seat_preference': {
            'window': seat_window,
            'aisle': seat_aisle,
            'middle': seat_middle,
        },
        'cabin_distribution': cabin_counts,
        'earliest_flight': {
            'flight_no': earliest_flight.get('flight_no', ''),
            'dep_time': earliest_flight.get('dep_time', ''),
            'route': f"{earliest_flight.get('departure','')}-{earliest_flight.get('arrival','')}",
            'date': earliest_flight.get('date', ''),
        } if earliest_flight else None,
        'latest_flight': {
            'flight_no': latest_flight.get('flight_no', ''),
            'dep_time': latest_flight.get('dep_time', ''),
            'route': f"{latest_flight.get('departure','')}-{latest_flight.get('arrival','')}",
            'date': latest_flight.get('date', ''),
        } if latest_flight else None,
        'longest_flight': {
            'flight_no': flights[longest_idx].get('flight_no', ''),
            'distance': distances[longest_idx],
            'route': f"{flights[longest_idx].get('departure','')}-{flights[longest_idx].get('arrival','')}",
        } if longest_idx >= 0 and distances[longest_idx] > 0 else None,
        'shortest_flight': {
            'flight_no': flights[shortest_idx].get('flight_no', ''),
            'distance': distances[shortest_idx],
            'route': f"{flights[shortest_idx].get('departure','')}-{flights[shortest_idx].get('arrival','')}",
        } if shortest_idx >= 0 and distances[shortest_idx] > 0 else None,
        'month_distribution': month_counts,
        'weekday_distribution': weekday_counts,
        'weekday_flights': weekday_flights_detail,
        'month_flights': month_flights_detail,
        'day_flights': day_flights_detail,
        'avg_distance': avg_distance,
        'avg_hours': avg_hours,
    }

    return jsonify({
        'total_flights': len(flights),
        'total_distance': round(total_distance),
        'total_hours': round(total_hours, 1),
        'visited_airports': len(visited_airports),
        'visited_countries': len(visited_countries),
        'top_routes': [{'route': r, 'count': c} for r, c in top_routes],
        'top_airlines': [{'airline': a, 'count': c} for a, c in top_airlines],
        'fun_stats': fun_stats,
        'available_years': available_years,
    })


# ==================== API 璺敱: 澶╂皵 ====================

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """閫氳繃 Open-Meteo API 鑾峰彇鐩殑鍦板ぉ姘?(鏃犻渶API Key)"""
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({'success': False, 'error': 'Missing lat/lon'}), 400
    try:
        url = (f"https://api.open-meteo.com/v1/forecast?"
               f"latitude={lat}&longitude={lon}"
               f"&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m"
               f"&daily=temperature_2m_max,temperature_2m_min,weather_code"
               f"&timezone=auto&forecast_days=3")
        data = _http_get_json(url, timeout=8)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/cache/stats', methods=['GET'])
@login_required
def cache_stats():
    """鑾峰彇鏈湴缂撳瓨缁熻"""
    schedules = load_json(SCHEDULES_FILE)
    total = len([k for k in schedules if not k.startswith('_')])
    return jsonify({
        'total_cached': total,
        'file': SCHEDULES_FILE,
    })


# ==================== 鍋ュ悍妫€鏌?====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """鍋ュ悍妫€鏌ョ鐐?鈥?鐢ㄤ簬浜戝钩鍙板拰鐩戞帶"""
    try:
        from sqlalchemy import select as _health_select
        from storage import get_session, User
        db_ok = get_session().scalar(_health_select(User.id).limit(1)) is not None or is_legacy_mode()
    except Exception:
        db_ok = False
    return jsonify({
        'status': 'ok' if db_ok else 'degraded',
        'version': APP_VERSION,
        'database': 'ok' if db_ok else 'error',
        'mode': 'legacy' if is_legacy_mode() else 'multi_user',
    })



# ==================== 鍚姩 ====================

if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)

    port = int(os.environ.get('PORT', 5000))
    db_url = get_database_url()
    is_legacy = is_legacy_mode()

    print("=" * 50)
    print("  SkyTrace - Flight Manager")
    print("=" * 50)
    print(f"  URL: http://0.0.0.0:{port}")
    print(f"  DB:  {db_url}")
    if is_legacy:
        print("  [!] First run 鈥?open browser to create admin account")
    else:
        print("  [OK] Multi-user mode active")
    print(f"  Health check: http://0.0.0.0:{port}/api/health")
    print("=" * 50)

    app.run(debug=False, host='0.0.0.0', port=port)
