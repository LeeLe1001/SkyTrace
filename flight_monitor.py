#!/usr/bin/env python3
"""
SkyTrace Flight Monitor - 航班监控与推送通知
============================================

独立运行的航班监控脚本，部署在服务器上 (或本地) 定时检查航班状态变化。
当检测到延误、取消、登机口变更等异常时，通过 Bark / Webhook 发送推送通知。

使用方法:
  1. 直接运行:    python flight_monitor.py
  2. Cron 定时:   */15 * * * * /usr/bin/python3 /path/to/flight_monitor.py
  3. 首次配置:    python flight_monitor.py --setup

支持的推送通道:
  - Bark (iOS 推送, 推荐)
  - 自定义 Webhook (Slack/Discord/企业微信等)

依赖: 仅 Python 3.7+ 标准库 (无第三方依赖)
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

# ==================== 配置 ====================

# 配置文件路径 (与 SkyTrace 数据目录共享，或独立部署时使用本地配置)
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / 'data'
FLIGHTS_FILE = DATA_DIR / 'flights.json'
SETTINGS_FILE = DATA_DIR / 'settings.json'
MONITOR_STATE_FILE = DATA_DIR / 'monitor_state.json'
MONITOR_CONFIG_FILE = DATA_DIR / 'monitor_config.json'

# 默认监控配置
DEFAULT_CONFIG = {
    # 推送通道
    'bark_url': '',                    # Bark 推送 URL, 例: https://api.day.app/YOUR_KEY
    'webhook_url': '',                 # 自定义 Webhook URL (POST JSON)

    # 监控参数
    'check_window_hours': 48,          # 只监控未来 N 小时内的航班
    'alert_delay_minutes': 30,         # 延误超过 N 分钟才告警
    'alert_gate_change': True,         # 登机口变更告警
    'alert_terminal_change': True,     # 航站楼变更告警
    'alert_cancellation': True,        # 取消告警
    'alert_diversion': True,           # 备降告警

    # 静默时段 (本地时间)
    'quiet_hours_start': '',           # 例: '23:00' (空字符串=不启用)
    'quiet_hours_end': '',             # 例: '07:00'

    # API 配置 (继承 SkyTrace settings.json，或在此单独配置)
    'aviationstack_key': '',
    'airlabs_key': '',
    'aerodata_key': '',
}


# ==================== 工具函数 ====================

def load_json(filepath):
    """加载 JSON 文件"""
    filepath = Path(filepath)
    if filepath.exists():
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_json(filepath, data):
    """保存 JSON 文件"""
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def http_get_json(url, headers=None, timeout=10):
    """通用 HTTP GET 返回 JSON"""
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SkyTrace-Monitor/1.0')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def log(msg, level='INFO'):
    """日志输出"""
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{ts}] [{level}] {msg}')


def is_quiet_hours(config):
    """检查当前是否在静默时段"""
    start = config.get('quiet_hours_start', '')
    end = config.get('quiet_hours_end', '')
    if not start or not end:
        return False
    try:
        now = datetime.now().strftime('%H:%M')
        if start <= end:
            return start <= now <= end
        else:  # 跨午夜
            return now >= start or now <= end
    except Exception:
        return False


# ==================== API 查询 ====================

def query_aviationstack(flight_no, date, api_key):
    """查询 AviationStack API"""
    try:
        url = f"http://api.aviationstack.com/v1/flights?access_key={api_key}&flight_iata={flight_no}"
        if date:
            url += f"&flight_date={date}"
        data = http_get_json(url)
        items = data.get('data') or []
        if not items:
            return None
        f = items[0]
        dep = f.get('departure') or {}
        arr = f.get('arrival') or {}
        return {
            'status': f.get('flight_status', ''),
            'dep_delay': dep.get('delay'),
            'arr_delay': arr.get('delay'),
            'dep_terminal': dep.get('terminal', ''),
            'arr_terminal': arr.get('terminal', ''),
            'dep_gate': dep.get('gate', ''),
            'arr_gate': arr.get('gate', ''),
            'dep_actual': (dep.get('actual') or '')[11:16],
            'arr_actual': (arr.get('actual') or '')[11:16],
            'source': 'AviationStack',
        }
    except Exception as e:
        log(f'AviationStack 查询失败: {e}', 'WARN')
    return None


def query_airlabs(flight_no, date, api_key):
    """查询 AirLabs API"""
    try:
        url = f"https://airlabs.co/api/v9/flights?api_key={api_key}&flight_iata={flight_no}"
        data = http_get_json(url)
        items = data.get('response') or []
        if not items:
            return None
        f = items[0]
        return {
            'status': f.get('status', ''),
            'dep_delay': f.get('delayed'),
            'arr_delay': None,
            'dep_terminal': f.get('dep_terminal', ''),
            'arr_terminal': f.get('arr_terminal', ''),
            'dep_gate': f.get('dep_gate', ''),
            'arr_gate': f.get('arr_gate', ''),
            'dep_actual': (f.get('dep_actual') or '')[11:16],
            'arr_actual': (f.get('arr_actual') or '')[11:16],
            'source': 'AirLabs',
        }
    except Exception as e:
        log(f'AirLabs 查询失败: {e}', 'WARN')
    return None


def query_aerodata(flight_no, date, api_key):
    """查询 AeroDataBox via RapidAPI"""
    try:
        search_date = date or datetime.now().strftime('%Y-%m-%d')
        url = f"https://aerodatabox.p.rapidapi.com/flights/number/{flight_no}/{search_date}"
        headers = {
            'X-RapidAPI-Key': api_key,
            'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        }
        data = http_get_json(url, headers=headers)
        if not data or not isinstance(data, list) or len(data) == 0:
            return None
        f = data[0]
        dep = f.get('departure') or {}
        arr = f.get('arrival') or {}
        return {
            'status': f.get('status', ''),
            'dep_delay': dep.get('delay'),
            'arr_delay': arr.get('delay'),
            'dep_terminal': (dep.get('terminal') or ''),
            'arr_terminal': (arr.get('terminal') or ''),
            'dep_gate': (dep.get('gate') or ''),
            'arr_gate': (arr.get('gate') or ''),
            'dep_actual': '',
            'arr_actual': '',
            'source': 'AeroDataBox',
        }
    except Exception as e:
        log(f'AeroDataBox 查询失败: {e}', 'WARN')
    return None


def query_flight_status(flight_no, date, config):
    """按优先级查询航班状态"""
    # 尝试从 SkyTrace 的 settings.json 获取 API key
    settings = load_json(SETTINGS_FILE) if SETTINGS_FILE.exists() else {}

    apis = [
        ('aerodata', query_aerodata,
         config.get('aerodata_key') or settings.get('aerodata_key', '')),
        ('airlabs', query_airlabs,
         config.get('airlabs_key') or settings.get('airlabs_key', '')),
        ('aviationstack', query_aviationstack,
         config.get('aviationstack_key') or settings.get('aviationstack_key', '')),
    ]

    for name, fn, key in apis:
        if key:
            result = fn(flight_no, date, key)
            if result:
                return result
    return None


# ==================== 推送通知 ====================

def send_bark(bark_url, title, body, group='SkyTrace'):
    """通过 Bark 发送 iOS 推送"""
    if not bark_url:
        return False
    try:
        # Bark URL 格式: https://api.day.app/YOUR_KEY/title/body
        encoded_title = urllib.parse.quote(title)
        encoded_body = urllib.parse.quote(body)
        url = f"{bark_url.rstrip('/')}/{encoded_title}/{encoded_body}?group={group}&sound=alert"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            return result.get('code') == 200
    except Exception as e:
        log(f'Bark 推送失败: {e}', 'ERROR')
    return False


def send_webhook(webhook_url, title, body, data=None):
    """发送 Webhook 通知 (通用 JSON POST)"""
    if not webhook_url:
        return False
    try:
        payload = json.dumps({
            'title': title,
            'body': body,
            'timestamp': datetime.now().isoformat(),
            'data': data or {},
        }).encode('utf-8')
        req = urllib.request.Request(
            webhook_url,
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        log(f'Webhook 推送失败: {e}', 'ERROR')
    return False


def notify(config, title, body, data=None):
    """发送推送通知 (所有已配置的通道)"""
    if is_quiet_hours(config):
        log(f'静默时段，跳过推送: {title}')
        return

    sent = False
    if config.get('bark_url'):
        if send_bark(config['bark_url'], title, body):
            sent = True
            log(f'Bark 推送已发送: {title}')

    if config.get('webhook_url'):
        if send_webhook(config['webhook_url'], title, body, data):
            sent = True
            log(f'Webhook 推送已发送: {title}')

    if not sent:
        log(f'未配置推送通道! 告警: {title} - {body}', 'WARN')


# ==================== 核心监控逻辑 ====================

def get_monitored_flights(config):
    """获取需要监控的航班列表 (未来 N 小时内)"""
    flights_data = load_json(FLIGHTS_FILE)
    all_flights = flights_data.get('flights', [])
    now = datetime.now()
    window = timedelta(hours=config.get('check_window_hours', 48))

    monitored = []
    for f in all_flights:
        try:
            dep_dt = datetime.strptime(f'{f["date"]} {f["dep_time"]}', '%Y-%m-%d %H:%M')
            # 只监控 [现在 - 6小时, 现在 + window] 范围内的航班
            if (dep_dt >= now - timedelta(hours=6)) and (dep_dt <= now + window):
                monitored.append(f)
        except (ValueError, KeyError):
            continue

    return monitored


def detect_changes(flight, current_status, prev_state, config):
    """检测航班状态变化，返回告警列表"""
    alerts = []
    flight_no = flight.get('flight_no', '???')
    route = f"{flight.get('departure', '?')}-{flight.get('arrival', '?')}"
    date_str = flight.get('date', '')

    status = (current_status.get('status') or '').lower()
    prev = prev_state or {}

    # 1. 航班取消
    if config.get('alert_cancellation', True):
        if 'cancel' in status and 'cancel' not in prev.get('status', ''):
            alerts.append({
                'type': 'cancellation',
                'title': f'⚠️ 航班取消 {flight_no}',
                'body': f'{date_str} {route} 航班已取消！请及时改签。',
                'priority': 'critical',
            })

    # 2. 备降/改降
    if config.get('alert_diversion', True):
        if 'divert' in status and 'divert' not in prev.get('status', ''):
            alerts.append({
                'type': 'diversion',
                'title': f'⚠️ 航班备降 {flight_no}',
                'body': f'{date_str} {route} 航班已备降。',
                'priority': 'critical',
            })

    # 3. 延误告警
    delay = current_status.get('dep_delay')
    threshold = config.get('alert_delay_minutes', 30)
    if delay and isinstance(delay, (int, float)) and delay >= threshold:
        prev_delay = prev.get('dep_delay') or 0
        if delay > prev_delay:
            alerts.append({
                'type': 'delay',
                'title': f'⏰ 航班延误 {flight_no}',
                'body': f'{date_str} {route} 延误约 {int(delay)} 分钟。',
                'priority': 'high',
            })

    # 4. 登机口变更
    if config.get('alert_gate_change', True):
        new_gate = current_status.get('dep_gate', '')
        old_gate = prev.get('dep_gate', '')
        if new_gate and old_gate and new_gate != old_gate:
            alerts.append({
                'type': 'gate_change',
                'title': f'🚪 登机口变更 {flight_no}',
                'body': f'{date_str} {route} 登机口: {old_gate} → {new_gate}',
                'priority': 'medium',
            })

    # 5. 航站楼变更
    if config.get('alert_terminal_change', True):
        new_term = current_status.get('dep_terminal', '')
        old_term = prev.get('dep_terminal', '')
        if new_term and old_term and new_term != old_term:
            alerts.append({
                'type': 'terminal_change',
                'title': f'🏢 航站楼变更 {flight_no}',
                'body': f'{date_str} {route} 出发航站楼: T{old_term} → T{new_term}',
                'priority': 'high',
            })

    return alerts


def run_monitor():
    """主监控流程"""
    log('========== SkyTrace Flight Monitor 启动 ==========')

    # 加载配置
    config = {**DEFAULT_CONFIG, **load_json(MONITOR_CONFIG_FILE)}
    prev_states = load_json(MONITOR_STATE_FILE)

    # 获取需要监控的航班
    flights = get_monitored_flights(config)
    if not flights:
        log('当前没有需要监控的航班')
        return

    log(f'正在监控 {len(flights)} 个航班...')

    new_states = {}
    for flight in flights:
        flight_no = flight.get('flight_no', '')
        date = flight.get('date', '')
        key = f"{flight_no}_{date}"

        log(f'查询 {flight_no} ({date})...')
        status = query_flight_status(flight_no, date, config)

        if not status:
            log(f'  {flight_no}: 无法获取状态')
            new_states[key] = prev_states.get(key, {})
            continue

        log(f'  {flight_no}: status={status.get("status")}, '
            f'delay={status.get("dep_delay")}, '
            f'gate={status.get("dep_gate")}, '
            f'source={status.get("source")}')

        # 检测状态变化
        prev = prev_states.get(key)
        alerts = detect_changes(flight, status, prev, config)

        for alert in alerts:
            log(f'  🔔 {alert["title"]}: {alert["body"]}')
            notify(config, alert['title'], alert['body'], {
                'flight_no': flight_no,
                'date': date,
                'type': alert['type'],
            })

        # 保存当前状态
        new_states[key] = {
            'status': status.get('status', ''),
            'dep_delay': status.get('dep_delay'),
            'dep_terminal': status.get('dep_terminal', ''),
            'dep_gate': status.get('dep_gate', ''),
            'arr_gate': status.get('arr_gate', ''),
            'last_check': datetime.now().isoformat(),
            'source': status.get('source', ''),
        }

        # API 调用间隔 (避免限频)
        time.sleep(1)

    # 持久化状态
    save_json(MONITOR_STATE_FILE, new_states)
    log(f'监控完成，已保存 {len(new_states)} 条状态')


# ==================== 配置向导 ====================

def setup_wizard():
    """交互式配置向导"""
    print('\n' + '=' * 50)
    print('  ✈️  SkyTrace Flight Monitor 配置向导')
    print('=' * 50)

    config = load_json(MONITOR_CONFIG_FILE) if MONITOR_CONFIG_FILE.exists() else {}
    config = {**DEFAULT_CONFIG, **config}

    # Bark 配置
    print('\n📱 Bark 推送配置 (iOS)')
    print('  Bark App 下载: https://apps.apple.com/app/bark/id1403753865')
    print('  打开 Bark App 复制服务器地址')
    current = config.get('bark_url', '')
    if current:
        print(f'  当前: {current[:30]}...')
    bark = input('  Bark URL (回车跳过): ').strip()
    if bark:
        config['bark_url'] = bark

    # Webhook 配置
    print('\n🔗 Webhook 配置 (可选)')
    current = config.get('webhook_url', '')
    if current:
        print(f'  当前: {current[:40]}...')
    webhook = input('  Webhook URL (回车跳过): ').strip()
    if webhook:
        config['webhook_url'] = webhook

    # API Key
    print('\n🔑 航班 API 密钥')
    print('  至少配置一个 API 才能查询航班状态')
    print('  推荐: AirLabs (免费 1000 次/月)')
    print('  注册: https://airlabs.co/')

    for api_name, api_label in [
        ('airlabs_key', 'AirLabs'),
        ('aviationstack_key', 'AviationStack'),
        ('aerodata_key', 'AeroDataBox (RapidAPI)'),
    ]:
        current = config.get(api_name, '')
        status = '✅ 已配置' if current else '❌ 未配置'
        val = input(f'  {api_label} Key [{status}] (回车跳过): ').strip()
        if val:
            config[api_name] = val

    # 监控窗口
    print(f'\n⏱️  监控参数')
    hours = input(f'  监控未来几小时的航班 [{config["check_window_hours"]}]: ').strip()
    if hours.isdigit():
        config['check_window_hours'] = int(hours)

    delay = input(f'  延误多少分钟告警 [{config["alert_delay_minutes"]}]: ').strip()
    if delay.isdigit():
        config['alert_delay_minutes'] = int(delay)

    save_json(MONITOR_CONFIG_FILE, config)
    print(f'\n✅ 配置已保存到 {MONITOR_CONFIG_FILE}')

    # 测试推送
    if config.get('bark_url') or config.get('webhook_url'):
        test = input('\n发送测试推送? (y/N): ').strip().lower()
        if test == 'y':
            notify(config, '🧪 SkyTrace 测试', '推送配置成功！航班监控已就绪。')
            print('  测试推送已发送，请检查手机通知')

    print('\n' + '=' * 50)
    print('  配置完成! 运行方式:')
    print(f'  手动运行:  python {__file__}')
    print(f'  定时运行:  crontab -e')
    print(f'  添加:      */15 * * * * /usr/bin/python3 {os.path.abspath(__file__)}')
    print('=' * 50)


# ==================== 入口 ====================

if __name__ == '__main__':
    if '--setup' in sys.argv:
        setup_wizard()
    elif '--test' in sys.argv:
        config = {**DEFAULT_CONFIG, **load_json(MONITOR_CONFIG_FILE)}
        notify(config, '🧪 SkyTrace 测试', f'测试推送 @ {datetime.now().strftime("%H:%M:%S")}')
    else:
        run_monitor()
