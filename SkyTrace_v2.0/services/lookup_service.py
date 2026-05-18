"""
SkyTrace v2.0 — 航班查询服务 (3级降级 + 外部API + 航站楼)
"""
import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime


# ---- 航站楼数据 ----

AIRLINE_TERMINAL_MAP = {
    'PEK': {'CA': '3', 'ZH': '3', 'MU': '2', 'FM': '2', 'CZ': '2', 'MF': '2',
            'SC': '2', 'NH': '3', 'SQ': '3', 'LH': '3', 'BA': '3', 'AF': '2',
            'HU': '1', 'GS': '1', 'JD': '2', 'CX': '3', '3U': '2', 'SU': '2'},
    'PVG': {'MU': '1', 'FM': '1', 'CZ': '1', 'CA': '2', 'NH': '2', 'SQ': '2',
            'AF': '2', 'LH': '2', 'BA': '2', 'KE': '1', 'OZ': '1'},
    'SHA': {'MU': '1', 'FM': '1', 'CZ': '1', 'CA': '2', 'HU': '2', 'SC': '2',
            '9C': '2', '3U': '2', 'HO': '1'},
    'CTU': {'MU': '2', 'CA': '1', 'CZ': '1', '3U': '1', 'ZH': '1', 'EU': '2'},
    'TFU': {'3U': '1', 'EU': '1', 'QR': '1', 'KE': '1', 'CX': '1', 'TG': '1',
            'SQ': '1', 'MU': '1', 'CA': '2', 'CZ': '2', 'ZH': '2', 'HU': '2',
            'SC': '2', 'GJ': '2', 'TV': '2', 'MF': '2', 'GS': '2', '9C': '2', 'HO': '2'},
    'CAN': {'CZ': '2', 'MU': '2', 'CA': '1', 'ZH': '1', 'HU': '1', 'SC': '1', '9C': '1'},
    'SZX': {'CA': '3', 'CZ': '3', 'MU': '3', 'ZH': '3', '3U': '3', 'HU': '3'},
    'HGH': {'MF': '4', 'GJ': '1', 'CA': '1', 'MU': '1', 'CZ': '3', 'HU': '3'},
    'HKG': {'CX': '1', 'KA': '1', 'HX': '1', 'CA': '1', 'MU': '1', 'CZ': '1',
            'SQ': '1', 'QR': '1', 'NH': '1', 'JL': '1', 'BA': '1'},
    'NRT': {'NH': '1', 'CA': '1', 'MU': '1', 'CZ': '1', 'JL': '2', 'ZH': '1'},
    'HND': {'NH': '3', 'CA': '3', 'MU': '3', 'CZ': '3'},
    'ICN': {'KE': '2', 'OZ': '1', 'CA': '1', 'MU': '1', 'CZ': '1'},
    'TPE': {'JX': '1', 'CI': '1', 'BR': '2', 'MU': '1', 'CA': '2', 'CZ': '1'},
    'SIN': {'SQ': '3', 'NH': '1', 'CA': '2', 'MU': '1', 'CZ': '1', 'CX': '4'},
    'CDG': {'AF': '2E', 'MU': '2E', 'CA': '2E', 'CZ': '2E'},
    'FCO': {'AZ': '1'},
    'MAD': {'IB': '4', 'QR': '1', 'BA': '4', 'AA': '4'},
    'SYD': {'CA': '1', 'MF': '1', 'MH': '1', 'CZ': '1', 'SQ': '1', 'VA': '2', 'JQ': '2', 'QF': '3'},
    'MEL': {'CZ': '2', 'MF': '2', 'MH': '2', 'SQ': '2', 'CA': '2', 'VA': '3', 'JQ': '4', 'QF': '1'},
    'DFW': {'AA': 'C', 'KE': 'D', 'AS': 'E', 'QR': 'D'},
    'JFK': {'AA': '8', 'DL': '4', 'BA': '7', 'CX': '8'},
    'LAX': {'MU': 'B', 'DL': '3', 'AA': '4', 'CX': 'B', 'SQ': 'B'},
    'LHR': {'BA': '5', 'AA': '3', 'CX': '3', 'QF': '3', 'JL': '3'},
    'DXB': {'EK': '3', 'QF': '3'},
}

SINGLE_TERMINAL_AIRPORTS = {
    'PKX', 'DZH', 'XFN', 'HUZ', 'KWE', 'SJW', 'SYX',
    'NGO', 'ITM', 'KMJ', 'GMP', 'MFM',
    'KBV', 'HKT', 'BKK', 'KUL',
    'DOH', 'IST', 'SAW',
    'LXR', 'HRG',
    'VVO', 'KJA', 'DME', 'LED', 'TAS',
    'OOL', 'HBA', 'ADL', 'BNE',
    'OPO',
    'LAS', 'AUS', 'SEA', 'DTW', 'PHX',
}

# ---- 工具函数 ----

def norm_flight_no(flight_no: str) -> str:
    return re.sub(r'[\s\-]', '', (flight_no or '').upper().strip())


def extract_airline_code(flight_no: str) -> str:
    fn = norm_flight_no(flight_no)
    m = re.match(r'^([A-Z0-9]{2})', fn)
    return m.group(1) if m else ''


def fill_terminal(flight_data: dict):
    airline_code = extract_airline_code(flight_data.get('flight_no', ''))
    dep = flight_data.get('departure', '')
    arr = flight_data.get('arrival', '')

    if not flight_data.get('dep_terminal') and dep in SINGLE_TERMINAL_AIRPORTS:
        flight_data['dep_terminal'] = 'MAIN'
    if not flight_data.get('arr_terminal') and arr in SINGLE_TERMINAL_AIRPORTS:
        flight_data['arr_terminal'] = 'MAIN'

    if not flight_data.get('dep_terminal') and dep in AIRLINE_TERMINAL_MAP:
        t = AIRLINE_TERMINAL_MAP[dep].get(airline_code, '')
        if t:
            flight_data['dep_terminal'] = t
    if not flight_data.get('arr_terminal') and arr in AIRLINE_TERMINAL_MAP:
        t = AIRLINE_TERMINAL_MAP[arr].get(airline_code, '')
        if t:
            flight_data['arr_terminal'] = t

    if not flight_data.get('dep_terminal'):
        flight_data['dep_terminal'] = 'MAIN'
    if not flight_data.get('arr_terminal'):
        flight_data['arr_terminal'] = 'MAIN'

    return flight_data


# ---- 外部 API 查询 ----

def _http_get_json(url, headers=None, timeout=10):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SkyTrace/2.0')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def query_aviationstack(flight_no, date, api_key):
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
                'dep_time': (f.get('dep_time_utc') or f.get('dep_time') or '')[11:16],
                'arr_time': (f.get('arr_time_utc') or f.get('arr_time') or '')[11:16],
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
            dep_ap = dep.get('airport') or {}
            arr_ap = arr.get('airport') or {}
            dep_sched = (dep.get('scheduledTime') or {}).get('local', '') or ''
            arr_sched = (arr.get('scheduledTime') or {}).get('local', '') or ''
            ac = f.get('aircraft') or {}
            return {
                'departure': dep_ap.get('iata', ''),
                'arrival': arr_ap.get('iata', ''),
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
        try:
            body = e.read().decode()
        except Exception:
            pass
        print(f"[AeroDataBox] HTTP {e.code}: {body}")
    except Exception as e:
        print(f"[AeroDataBox] 查询失败: {e}")
    return None


# ---- 查询编排 ----

def query_all_apis(flight_no, date, settings):
    preferred = settings.get('preferred_api', 'auto')
    apis = [
        ('aerodata', query_aerodata, settings.get('aerodata_key', '')),
        ('airlabs', query_airlabs, settings.get('airlabs_key', '')),
        ('aviationstack', query_aviationstack, settings.get('aviationstack_key', '')),
    ]
    if preferred != 'auto':
        apis.sort(key=lambda x: 0 if x[0] == preferred else 1)

    for name, query_fn, key in apis:
        if key:
            result = query_fn(flight_no, date, key)
            if result and result.get('departure'):
                cache_flight_result(flight_no, result)
                return result
    return None


def cache_flight_result(flight_no, result):
    try:
        from services.lookup_service import norm_flight_no
        fn = norm_flight_no(flight_no)
        path = os.path.join('data', 'flight_schedules.json')
        schedules = {}
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                schedules = json.load(f)
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
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(schedules, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[缓存] 写入失败: {e}")


def find_in_local_data(flight_no, user_id=None):
    fn = norm_flight_no(flight_no)

    # 1. 本地时刻表缓存
    path = os.path.join('data', 'flight_schedules.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            schedules = json.load(f)
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

    # 2. 用户历史记录
    if user_id:
        from repositories.flight_repo import FlightRepository
        flight = FlightRepository.find_by_number(user_id, fn)
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
    else:
        # Legacy mode: check flights.json
        legacy_path = os.path.join('data', 'flights.json')
        if os.path.exists(legacy_path):
            with open(legacy_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for flight in data.get('flights', []):
                if norm_flight_no(flight.get('flight_no', '')) == fn:
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
