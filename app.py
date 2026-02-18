"""
SkyTrace - 个人航旅管理系统
Flask 后端主程序 v2.0

支持多API源航班查询:
- AviationStack (免费500次/月): https://aviationstack.com/
- AirLabs (免费1000次/月): https://airlabs.co/
- AeroDataBox (RapidAPI免费版): https://rapidapi.com/aedbx-aedbx/api/aerodatabox
"""

from flask import Flask, render_template, jsonify, request, send_from_directory
import json
import os
import math
from datetime import datetime, timedelta
import uuid
import urllib.request
import urllib.error
import re
import time

app = Flask(__name__)

# ==================== 配置 ====================
DATA_DIR = 'data'
FLIGHTS_FILE = os.path.join(DATA_DIR, 'flights.json')
AIRPORTS_FILE = os.path.join(DATA_DIR, 'airports.json')
AIRLINES_FILE = os.path.join(DATA_DIR, 'airlines.json')
SCHEDULES_FILE = os.path.join(DATA_DIR, 'flight_schedules.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
LOGO_CACHE_DIR = os.path.join('static', 'img', 'airlines', 'cache')

DEFAULT_SETTINGS = {
    'aviationstack_key': '',
    'airlabs_key': '',
    'aerodata_key': '',
    'preferred_api': 'auto',
    'auto_cache': True,
}

# ==================== 航站楼自动补全 ====================
# 已知航司在各机场的常用航站楼映射 (API返回空时兜底)
# 格式: { 机场IATA: { 航司IATA: 航站楼编号 } }
AIRLINE_TERMINAL_MAP = {
    # ====== 中国大陆 ======
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
    'TFU': {# T1: 国际航线 + 川航/成都航空
            '3U': '1', 'EU': '1', 'QR': '1', 'KE': '1', 'CX': '1', 'TG': '1',
            'SQ': '1', 'MU': '1',
            # T2: 大部分国内航线
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
    # ====== 东亚 ======
    'HKG': {'CX': '1', 'KA': '1', 'HX': '1', 'CA': '1', 'MU': '1', 'CZ': '1',
            'SQ': '1', 'QR': '1', 'NH': '1', 'JL': '1', 'BA': '1'},
    'NRT': {'NH': '1', 'CA': '1', 'MU': '1', 'CZ': '1', 'JL': '2', 'ZH': '1'},
    'HND': {'NH': '3', 'CA': '3', 'MU': '3', 'CZ': '3'},
    'ICN': {'KE': '2', 'OZ': '1', 'CA': '1', 'MU': '1', 'CZ': '1', 'AA': '1',
            'AS': '1', 'MF': '1', 'SQ': '1', 'DL': '1', 'MH': '1'},
    'TPE': {'JX': '1', 'CI': '1', 'BR': '2', 'MU': '1', 'CA': '2', 'CZ': '1'},
    # ====== 东南亚 ======
    'SIN': {'SQ': '3', 'NH': '1', 'CA': '2', 'MU': '1', 'CZ': '1', 'CX': '4',
            'MI': '2', 'MH': '1', 'TG': '1'},
    # ====== 中东/非洲 ======
    'CAI': {'MS': '3', 'QR': '2', 'VF': '2', 'NP': '2', 'AF': '2', 'BA': '2'},
    'CMN': {'AT': '1', 'AF': '1'},
    # ====== 欧洲 ======
    'CDG': {'AF': '2E', 'MU': '2E', 'CA': '2E', 'CZ': '2E', 'AZ': '1'},
    'ORY': {'AT': '4'},
    'FCO': {'AZ': '1', 'AT': '3'},
    'MAD': {'IB': '4', 'QR': '1', 'AT': '1', 'BA': '4', 'AA': '4'},
    'BCN': {'QR': '1', 'IB': '1', 'BA': '1'},
    'SVO': {'SU': 'D', 'S7': 'D', 'AF': 'E', 'KE': 'D'},
    # ====== 澳洲 ======
    'SYD': {'CA': '1', 'MF': '1', 'MH': '1', 'CZ': '1', 'SQ': '1',
            'VA': '2', 'JQ': '2', 'QF': '3'},
    'MEL': {'CZ': '2', 'MF': '2', 'MH': '2', 'SQ': '2', 'CA': '2',
            'VA': '3', 'JQ': '4', 'QF': '1'},
    # ====== 北美 ======
    'DFW': {'AA': 'C', 'KE': 'D', 'AS': 'E', 'QR': 'D'},
    'JFK': {'AA': '8', 'DL': '4', 'BA': '7', 'CX': '8'},
    'LAX': {'MU': 'B', 'DL': '3', 'AA': '4', 'CX': 'B', 'SQ': 'B'},
    'IAH': {'UA': 'C', 'AA': 'A'},
    'LGA': {'AA': 'C', 'DL': 'C', 'UA': 'A'},
}

# 已知的单航站楼机场（无航站楼编号或仅有一个航站楼）
# 这些机场的航站楼显示为 MAIN
SINGLE_TERMINAL_AIRPORTS = {
    # ====== 中国大陆 ======
    'PKX',   # 北京大兴
    'DZH',   # 达州
    'XFN',   # 襄阳
    'HUZ',   # 惠州
    'KWE',   # 贵阳龙洞堡
    'SJW',   # 石家庄正定
    'SYX',   # 三亚凤凰
    # ====== 东亚 ======
    'NGO',   # 名古屋中部
    'ITM',   # 大阪伊丹
    'KMJ',   # 熊本
    'GMP',   # 首尔金浦 (国际航站楼)
    'MFM',   # 澳门
    # ====== 东南亚 ======
    'KBV',   # 甲米
    'HKT',   # 普吉
    'BKK',   # 曼谷素万那普 (单航站楼大楼)
    'KUL',   # 吉隆坡KLIA (主楼)
    # ====== 中东 ======
    'DOH',   # 多哈哈马德国际 (单航站楼)
    'IST',   # 伊斯坦布尔新机场 (单航站楼)
    'SAW',   # 伊斯坦布尔萨比哈格克琴
    # ====== 非洲 ======
    'LXR',   # 卢克索
    'HRG',   # 赫尔格达
    # ====== 俄罗斯/中亚 ======
    'VVO',   # 海参崴
    'KJA',   # 克拉斯诺亚尔斯克
    'DME',   # 莫斯科多莫杰多沃
    'LED',   # 圣彼得堡普尔科沃
    'TAS',   # 塔什干
    # ====== 澳洲 ======
    'OOL',   # 黄金海岸
    'HBA',   # 霍巴特
    'ADL',   # 阿德莱德
    'BNE',   # 布里斯班
    # ====== 欧洲 ======
    'OPO',   # 波尔图
    # ====== 北美 ======
    'LAS',   # 拉斯维加斯
    'AUS',   # 奥斯汀
    'SEA',   # 西雅图-塔科马
    'DTW',   # 底特律
    'PHX',   # 凤凰城
}


def fill_terminal(flight_data):
    """为缺失航站楼信息的航班补充已知数据"""
    airline_code = extract_airline_code(flight_data.get('flight_no', ''))
    dep = flight_data.get('departure', '')
    arr = flight_data.get('arrival', '')

    # 1. 单航站楼机场: 填充 MAIN
    if not flight_data.get('dep_terminal') and dep in SINGLE_TERMINAL_AIRPORTS:
        flight_data['dep_terminal'] = 'MAIN'
    if not flight_data.get('arr_terminal') and arr in SINGLE_TERMINAL_AIRPORTS:
        flight_data['arr_terminal'] = 'MAIN'

    # 2. 多航站楼机场: 按航司映射补全
    if not flight_data.get('dep_terminal') and dep in AIRLINE_TERMINAL_MAP:
        terminal = AIRLINE_TERMINAL_MAP[dep].get(airline_code, '')
        if terminal:
            flight_data['dep_terminal'] = terminal

    if not flight_data.get('arr_terminal') and arr in AIRLINE_TERMINAL_MAP:
        terminal = AIRLINE_TERMINAL_MAP[arr].get(airline_code, '')
        if terminal:
            flight_data['arr_terminal'] = terminal

    return flight_data


# ==================== 工具函数 ====================
def load_json(filepath):
    """加载JSON文件"""
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_json(filepath, data):
    """保存JSON文件"""
    d = os.path.dirname(filepath)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_settings():
    """获取设置（合并默认值）"""
    settings = load_json(SETTINGS_FILE)
    return {**DEFAULT_SETTINGS, **settings}


def normalize_flight_no(flight_no):
    """标准化航班号: 去空格/横杠, 转大写"""
    return re.sub(r'[\s\-]', '', flight_no.upper().strip())


def extract_airline_code(flight_no):
    """从航班号提取航空公司代码 (2字符)"""
    fn = normalize_flight_no(flight_no)
    match = re.match(r'^([A-Z0-9]{2})', fn)
    return match.group(1) if match else ''


def haversine_distance(lat1, lon1, lat2, lon2):
    """计算两点间的大圆距离（公里）"""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_flight_status_info(flight):
    """根据航班信息计算状态和提醒"""
    now = datetime.now()
    try:
        flight_date = datetime.strptime(flight['date'], '%Y-%m-%d')
        dep_time = datetime.strptime(f"{flight['date']} {flight['dep_time']}", '%Y-%m-%d %H:%M')
        arr_time = datetime.strptime(f"{flight['date']} {flight['arr_time']}", '%Y-%m-%d %H:%M')
    except (ValueError, KeyError):
        return {'status': 'unknown', 'countdown': None}

    if arr_time < dep_time:
        arr_time += timedelta(days=1)

    checkin_open = dep_time - timedelta(hours=24)
    checkin_close = dep_time - timedelta(minutes=45)
    boarding_time = dep_time - timedelta(minutes=40)

    # 计算飞行进度
    flight_duration = (arr_time - dep_time).total_seconds()
    progress = 0
    if now > dep_time and now < arr_time and flight_duration > 0:
        elapsed = (now - dep_time).total_seconds()
        progress = min(100, round(elapsed / flight_duration * 100))

    status_info = {
        'checkin_open': checkin_open.strftime('%Y-%m-%d %H:%M'),
        'checkin_close': checkin_close.strftime('%Y-%m-%d %H:%M'),
        'boarding_time': boarding_time.strftime('%Y-%m-%d %H:%M'),
        'dep_datetime': dep_time.strftime('%Y-%m-%d %H:%M'),
        'arr_datetime': arr_time.strftime('%Y-%m-%d %H:%M'),
        'status': 'scheduled',
        'countdown': None,
        'progress': progress,
    }

    if flight.get('status') == 'completed' or now > arr_time:
        status_info['status'] = 'completed'
        status_info['progress'] = 100
    elif now > dep_time:
        status_info['status'] = 'in_flight'
        remaining = int((arr_time - now).total_seconds() // 60)
        status_info['countdown'] = {'key': 'etaMinutes', 'args': [remaining]}
    elif now > boarding_time:
        status_info['status'] = 'boarding'
        minutes_to_dep = int((dep_time - now).total_seconds() // 60)
        status_info['countdown'] = {'key': 'depInMinutes', 'args': [minutes_to_dep]}
    elif now > checkin_open:
        status_info['status'] = 'checkin_open'
        hours_left = (dep_time - now).total_seconds() / 3600
        if hours_left >= 1:
            status_info['countdown'] = {'key': 'depInHours', 'args': [int(hours_left)]}
        else:
            status_info['countdown'] = {'key': 'depInMinutes', 'args': [int(hours_left * 60)]}
    else:
        days_left = (flight_date - now).days
        if days_left > 0:
            status_info['countdown'] = {'key': 'daysLeft', 'args': [days_left]}
        else:
            hours = int((checkin_open - now).total_seconds() // 3600)
            if hours > 0:
                status_info['countdown'] = {'key': 'hoursToCheckin', 'args': [hours]}

    return status_info


# ==================== 多API航班查询系统 ====================

def _http_get_json(url, headers=None, timeout=10):
    """通用 HTTP GET 返回 JSON"""
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SkyTrace/2.0')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def query_aviationstack(flight_no, date, api_key):
    """AviationStack API (免费版 500次/月, 仅HTTP)"""
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
        print(f"[AviationStack] 查询失败: {e}")
    return None


def query_airlabs(flight_no, date, api_key):
    """AirLabs API (免费版 1000次/月, HTTPS)"""
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
        print(f"[AirLabs] 查询失败: {e}")
    return None


def query_aerodata(flight_no, date, api_key):
    """AeroDataBox via RapidAPI (免费版有限次数)"""
    if not api_key:
        return None
    try:
        search_date = date or datetime.now().strftime('%Y-%m-%d')
        url = f"https://aerodatabox.p.rapidapi.com/flights/number/{flight_no}/{search_date}"
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
    except Exception as e:
        print(f"[AeroDataBox] 查询失败: {e}")
    return None


def query_all_apis(flight_no, date):
    """按优先级依次尝试所有已配置的 API"""
    settings = get_settings()
    preferred = settings.get('preferred_api', 'auto')

    apis = [
        ('aerodata', query_aerodata, settings.get('aerodata_key', '')),
        ('airlabs', query_airlabs, settings.get('airlabs_key', '')),
        ('aviationstack', query_aviationstack, settings.get('aviationstack_key', '')),
    ]

    # 优先使用用户指定的 API
    if preferred != 'auto':
        apis.sort(key=lambda x: 0 if x[0] == preferred else 1)

    for name, query_fn, key in apis:
        if key:
            result = query_fn(flight_no, date, key)
            if result and result.get('departure'):
                # 自动缓存到本地
                cache_flight_result(flight_no, result)
                return result
    return None


def cache_flight_result(flight_no, result):
    """将 API 查询结果缓存到本地时刻表"""
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
        print(f"[缓存] 写入失败: {e}")


def find_in_local_data(flight_no):
    """从本地时刻表缓存 + 用户历史记录中查找"""
    fn = normalize_flight_no(flight_no)

    # 1. 本地时刻表缓存
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

    # 2. 用户的历史航班记录
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

    return None


# ==================== Logo 代理缓存 ====================

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


# ==================== 页面路由 ====================

APP_VERSION = 18

@app.route('/api/version')
def get_app_version():
    return jsonify({'version': APP_VERSION})

@app.route('/')
def index():
    return render_template('index.html')


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
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')


@app.route('/debug')
def debug_page():
    """纯内联诊断页面 - 不依赖任何外部资源"""
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
<h1>✈️ SkyTrace 诊断工具</h1>
<button onclick="runTests()">🔍 开始诊断</button>
<button onclick="clearSW()">🗑️ 清除SW+缓存</button>
<button onclick="location.href='/'">🏠 回到首页</button>
<div id="results"></div>
<script>
var results = document.getElementById('results');
function log(msg, cls) { results.innerHTML += '<div class="test ' + (cls||'') + '">' + msg + '</div>'; }

async function runTests() {
    results.innerHTML = '';
    log('⏳ 开始诊断...');

    // 1. Service Worker 状态
    if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        log('Service Worker 数量: ' + regs.length, regs.length > 0 ? 'warn' : 'ok');
        regs.forEach(function(r) { log('  SW scope: ' + r.scope + ', active: ' + (r.active ? r.active.scriptURL : 'none')); });
    } else { log('Service Worker: 不支持', 'warn'); }

    // 2. Cache Storage
    var cacheNames = await caches.keys();
    log('缓存数量: ' + cacheNames.length, cacheNames.length > 0 ? 'warn' : 'ok');
    cacheNames.forEach(function(n) { log('  缓存: ' + n); });

    // 3. 测试关键资源
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
        } catch(e) { log(f.name + ': ❌ ' + e.message, 'fail'); }
    }

    // 4. 测试外部地图瓦片
    try {
        var start2 = Date.now();
        var tileResp = await fetch('https://a.basemaps.cartocdn.com/dark_all/3/4/3.png');
        log('地图瓦片 (CartoDB): ' + tileResp.status + ' (' + (Date.now()-start2) + 'ms)', tileResp.ok ? 'ok' : 'fail');
    } catch(e) { log('地图瓦片 (CartoDB): ❌ 无法连接 - ' + e.message, 'fail'); }

    log('✅ 诊断完成');
}

async function clearSW() {
    results.innerHTML = '';
    // 注销所有 SW
    if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        for (var r of regs) { await r.unregister(); log('已注销 SW: ' + r.scope, 'ok'); }
    }
    // 清除所有缓存
    var names = await caches.keys();
    for (var n of names) { await caches.delete(n); log('已删除缓存: ' + n, 'ok'); }
    log('✅ 所有 SW 和缓存已清除! 现在可以回到首页了', 'ok');
}
</script></body></html>''', 200, {'Content-Type': 'text/html; charset=utf-8'}


# ==================== API 路由: 机场 & 航空公司 ====================

@app.route('/api/airports', methods=['GET'])
def get_airports():
    return jsonify(load_json(AIRPORTS_FILE))


@app.route('/api/airports/search', methods=['GET'])
def search_airports():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({})

    airports = load_json(AIRPORTS_FILE)
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


# ==================== API 路由: 航班智能查询 ====================

@app.route('/api/flight/lookup', methods=['GET'])
def lookup_flight():
    """
    智能航班查询 — 多级 fallback:
      1. 在线 API (AviationStack / AirLabs / AeroDataBox)
      2. 本地时刻表缓存
      3. 用户历史航班
    """
    raw = request.args.get('flight_no', '')
    date = request.args.get('date', '')
    flight_no = normalize_flight_no(raw)

    if not flight_no or len(flight_no) < 3:
        return jsonify({'success': False, 'error': '请输入有效航班号'}), 400

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

    # 检查是否有可用的 API
    settings = get_settings()
    has_api = bool(settings.get('aviationstack_key') or
                   settings.get('airlabs_key') or
                   settings.get('aerodata_key'))
    result['api_configured'] = has_api

    # --- Level 1: API查询 ---
    if has_api:
        api_result = query_all_apis(flight_no, date)
        if api_result and api_result.get('departure'):
            for k, v in api_result.items():
                if v:
                    result[k] = v
            result['source'] = 'api'
            # 自动补全缺失的航站楼
            fill_terminal(result)
            return jsonify(result)

    # --- Level 2 & 3: 本地数据 ---
    local = find_in_local_data(flight_no)
    if local and local.get('departure'):
        for k in ['departure', 'arrival', 'dep_time', 'arr_time', 'aircraft',
                   'dep_terminal', 'arr_terminal']:
            if local.get(k):
                result[k] = local[k]
        result['source'] = local.get('source', 'local')
        # 自动补全缺失的航站楼
        fill_terminal(result)
        return jsonify(result)

    return jsonify(result)


@app.route('/api/flight/status', methods=['GET'])
def get_flight_live_status():
    """获取航班实时状态（需配置API）"""
    flight_no = normalize_flight_no(request.args.get('flight_no', ''))
    date = request.args.get('date', '')

    if not flight_no:
        return jsonify({'success': False, 'error': '请输入航班号'}), 400

    api_result = query_all_apis(flight_no, date)
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


# ==================== API 路由: 设置管理 ====================

@app.route('/api/settings', methods=['GET'])
def get_settings_api():
    """获取设置（API key 打码显示）"""
    settings = get_settings()
    safe = {}
    for k, v in settings.items():
        if k.endswith('_key') and v:
            safe[k] = v[:4] + '****' + v[-4:] if len(v) > 8 else '****'
            safe[k + '_set'] = True
        elif k.endswith('_key'):
            safe[k] = ''
            safe[k + '_set'] = False
        else:
            safe[k] = v
    return jsonify(safe)


@app.route('/api/settings', methods=['POST'])
def save_settings_api():
    """保存设置"""
    new = request.json or {}
    current = get_settings()
    for k, v in new.items():
        if isinstance(v, str) and '****' in v:
            continue  # 不覆盖打码值
        current[k] = v
    save_json(SETTINGS_FILE, current)
    return jsonify({'success': True})


@app.route('/api/settings/test', methods=['POST'])
def test_api_connection():
    """测试 API 连接"""
    body = request.json or {}
    api_name = body.get('api', '')
    api_key = body.get('key', '')

    if not api_key or '****' in api_key:
        return jsonify({'success': False, 'message': '请输入有效的API密钥'})

    # 用一个常见航班号做测试
    test_fn = 'CZ3101'
    result = None
    if api_name == 'aviationstack':
        result = query_aviationstack(test_fn, '', api_key)
    elif api_name == 'airlabs':
        result = query_airlabs(test_fn, '', api_key)
    elif api_name == 'aerodata':
        result = query_aerodata(test_fn, '', api_key)

    if result and result.get('departure'):
        return jsonify({'success': True, 'message': f'✅ 连接成功！查到 {test_fn} 航班信息'})
    elif result:
        return jsonify({'success': True, 'message': '✅ API连接成功 (测试航班暂无数据)'})
    else:
        return jsonify({'success': False, 'message': '❌ 连接失败，请检查密钥是否正确'})


# ==================== API 路由: 航班 CRUD ====================

@app.route('/api/flights', methods=['GET'])
def get_flights():
    data = load_json(FLIGHTS_FILE)
    flights = data.get('flights', [])
    airports = load_json(AIRPORTS_FILE)

    enhanced = []
    for flight in flights:
        f = flight.copy()
        # 自动补全缺失的航站楼信息
        fill_terminal(f)

        # 经停信息: 查找经停机场名称
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

        f['status_info'] = get_flight_status_info(flight)
        enhanced.append(f)

    enhanced.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(enhanced)


@app.route('/api/flights', methods=['POST'])
def add_flight():
    flight = request.json
    flight['id'] = str(uuid.uuid4())[:8]

    # 自动缓存航班路线到本地时刻表
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

    data = load_json(FLIGHTS_FILE)
    if 'flights' not in data:
        data['flights'] = []
    data['flights'].append(flight)
    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True, 'id': flight['id']})


@app.route('/api/flights/<flight_id>', methods=['PUT'])
def update_flight(flight_id):
    updated = request.json
    data = load_json(FLIGHTS_FILE)
    for i, f in enumerate(data.get('flights', [])):
        if f['id'] == flight_id:
            updated['id'] = flight_id
            data['flights'][i] = updated
            save_json(FLIGHTS_FILE, data)
            return jsonify({'success': True})
    return jsonify({'success': False, 'error': '航班不存在'}), 404


@app.route('/api/flights/<flight_id>', methods=['DELETE'])
def delete_flight(flight_id):
    data = load_json(FLIGHTS_FILE)
    data['flights'] = [f for f in data.get('flights', []) if f['id'] != flight_id]
    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True})


# ==================== API 路由: 统计 ====================

@app.route('/api/flights/connect', methods=['POST'])
def connect_flights():
    """联程: 将多个航班绑定为一组 (自动合并已有联程)"""
    body = request.json or {}
    flight_ids = body.get('flight_ids', [])
    if len(flight_ids) < 2:
        return jsonify({'success': False, 'error': '至少选择2个航班'}), 400

    data = load_json(FLIGHTS_FILE)
    all_flights = data.get('flights', [])

    # 收集所选航班已有的 connected_group
    existing_groups = set()
    for f in all_flights:
        if f['id'] in flight_ids and f.get('connected_group'):
            existing_groups.add(f['connected_group'])

    # 使用已有的 group_id 之一, 或创建新的
    if existing_groups:
        group_id = sorted(existing_groups)[0]
        # 将其他组的航班也合并进来
        for f in all_flights:
            if f.get('connected_group') in existing_groups:
                f['connected_group'] = group_id
    else:
        group_id = str(uuid.uuid4())[:8]

    # 给选中的航班打上 group_id
    for f in all_flights:
        if f['id'] in flight_ids:
            f['connected_group'] = group_id

    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True, 'group_id': group_id})


@app.route('/api/flights/disconnect', methods=['POST'])
def disconnect_flights():
    """联程: 解除联程绑定"""
    body = request.json or {}
    group_id = body.get('group_id', '')
    if not group_id:
        return jsonify({'success': False, 'error': '缺少group_id'}), 400

    data = load_json(FLIGHTS_FILE)
    for f in data.get('flights', []):
        if f.get('connected_group') == group_id:
            f.pop('connected_group', None)
    save_json(FLIGHTS_FILE, data)
    return jsonify({'success': True})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    data = load_json(FLIGHTS_FILE)
    all_flights = data.get('flights', [])
    airports_data = load_json(AIRPORTS_FILE)

    # 年份筛选
    year = request.args.get('year', '')
    if year and year != 'all':
        flights = [f for f in all_flights if f.get('date', '').startswith(year)]
    else:
        flights = all_flights

    # 收集所有可用年份
    available_years = sorted(set(f.get('date', '')[:4] for f in all_flights if len(f.get('date', '')) >= 4), reverse=True)

    total_distance = 0
    visited_airports = set()
    visited_countries = set()
    durations = []          # 每段飞行时长(h)
    distances = []          # 每段飞行距离(km)

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
        try:
            dt = datetime.strptime(flight['dep_time'], '%H:%M')
            at = datetime.strptime(flight['arr_time'], '%H:%M')
            diff = (at - dt).total_seconds() / 3600
            day_offset = flight.get('arr_day_offset', 1 if flight.get('arr_next_day') else 0)
            if day_offset:
                diff += 24 * day_offset
            elif diff < 0:
                diff += 24
            total_hours += diff
            durations.append(round(diff, 1))
        except (ValueError, KeyError):
            durations.append(0)

    visited_airports.discard('')
    visited_countries.discard('')

    # 最常飞航线
    route_counts = {}
    for flight in flights:
        route = f"{flight.get('departure','')}-{flight.get('arrival','')}"
        if '-' != route:
            route_counts[route] = route_counts.get(route, 0) + 1
    top_routes = sorted(route_counts.items(), key=lambda x: -x[1])[:5]

    # 最常用航空公司
    airline_counts = {}
    for flight in flights:
        al = flight.get('airline', '') or extract_airline_code(flight.get('flight_no', ''))
        if al:
            airline_counts[al] = airline_counts.get(al, 0) + 1
    top_airlines = sorted(airline_counts.items(), key=lambda x: -x[1])[:5]

    # ========== 趣味统计 ==========
    # 1. 座位偏好分析
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

    # 2. 舱位分布
    cabin_counts = {}
    for flight in flights:
        cab = flight.get('class', 'economy') or 'economy'
        cabin_counts[cab] = cabin_counts.get(cab, 0) + 1

    # 3. 最早/最晚航班
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

    # 4. 最长/最短航班
    longest_idx = max(range(len(distances)), key=lambda i: distances[i]) if distances else -1
    shortest_idx = min(range(len(distances)), key=lambda i: distances[i] if distances[i] > 0 else 99999) if distances else -1

    # 5. 月度分布
    month_counts = {}
    for flight in flights:
        d = flight.get('date', '')
        if len(d) >= 7:
            month_counts[d[:7]] = month_counts.get(d[:7], 0) + 1

    # 6. 星期分布 (含每天航班明细)
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

    # 月度航班明细
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

    # 7. 平均飞行距离/时长
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


# ==================== API 路由: 天气 ====================

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """通过 Open-Meteo API 获取目的地天气 (无需API Key)"""
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
def cache_stats():
    """获取本地缓存统计"""
    schedules = load_json(SCHEDULES_FILE)
    total = len([k for k in schedules if not k.startswith('_')])
    return jsonify({
        'total_cached': total,
        'file': SCHEDULES_FILE,
    })


# ==================== 启动 ====================

if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)

    settings = get_settings()
    has_api = bool(settings.get('aviationstack_key') or
                   settings.get('airlabs_key') or
                   settings.get('aerodata_key'))

    print("=" * 50)
    print("  SkyTrace - Personal Flight Manager v2.0")
    print("=" * 50)
    print("  URL: http://localhost:5000")
    if has_api:
        print("  [OK] API configured")
    else:
        print("  [!] No API key - click Settings in top-right")
        print("      Supports: AviationStack / AirLabs / AeroDataBox")
    print("=" * 50)

    app.run(debug=False, host='0.0.0.0', port=5000)
