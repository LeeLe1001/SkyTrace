/**
 * SkyTrace Static Mode — 无后端运行支持
 *
 * 当 Flask 后端不可用时 (如 GitHub Pages 部署)，
 * 自动切换到静态模式:
 *   - 数据存储在 localStorage
 *   - 外部航班 API 通过 CORS 代理调用 (解决 Mixed Content + CORS 问题)
 *   - 机场/航空公司数据从静态 JSON 文件加载
 *
 * 对 app.js 零侵入: 通过拦截 window.fetch 实现透明代理
 */
(function () {
    'use strict';

    // ==================== 常量 ====================
    const CORS_PROXY = 'https://corsproxy.io/?';
    const LS_KEY_FLIGHTS = 'skytrace_flights';
    const LS_KEY_SETTINGS = 'skytrace_settings';
    const LS_KEY_SCHEDULES = 'skytrace_schedules';
    const DETECT_TIMEOUT = 3000;

    // ==================== 状态 ====================
    let _staticMode = null;               // null=检测中, true=静态, false=服务器
    let _modeResolve;
    const _modeReady = new Promise(r => _modeResolve = r);
    const _origFetch = window.fetch.bind(window);
    let _airportsData = null;
    let _airportTimezonesData = null;
    let _airlinesData = null;
    let _dataInitialized = false;

    // ==================== Fetch 拦截器 ====================
    window.fetch = async function (url, options) {
        const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));

        // 只拦截 /api/ 开头的请求
        if (!urlStr.match(/^\/api\//)) {
            return _origFetch(url, options);
        }

        // 版本检测请求放行 (用于模式检测自身)
        if (urlStr.startsWith('/api/version') && _staticMode === null) {
            return _origFetch(url, options);
        }

        // 等待模式检测完成
        if (_staticMode === null) await _modeReady;

        // 服务器模式: 原样转发
        if (!_staticMode) return _origFetch(url, options);

        // 静态模式: 本地处理
        return _handleStaticApi(urlStr, options || {});
    };

    // ==================== 模式检测 ====================
    (async () => {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), DETECT_TIMEOUT);
            const resp = await _origFetch('/api/version?_t=' + Date.now(), {
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(timer);
            _staticMode = !resp.ok;
        } catch (e) {
            _staticMode = true;
        }

        if (_staticMode) {
            console.log('%c[SkyTrace] ✈️ 静态模式 — 无后端运行', 'color:#3b82f6;font-weight:bold;font-size:13px');
            console.log('[SkyTrace] 📦 数据 → localStorage  |  🌐 API → CORS proxy');
            await _ensureStaticData();
        } else {
            console.log('[SkyTrace] 🖥️ 服务器模式 — 后端已连接');
        }

        _modeResolve();
    })();

    // ==================== 静态数据预加载 ====================
    async function _ensureStaticData() {
        if (_dataInitialized) return;
        try {
            const [airportsResp, airportTzResp, airlinesResp] = await Promise.all([
                _origFetch('data/airports.json'),
                _origFetch('data/airport_timezones.json').catch(() => null),
                _origFetch('data/airlines.json'),
            ]);
            _airportsData = airportsResp.ok ? await airportsResp.json() : {};
            _airportTimezonesData = airportTzResp && airportTzResp.ok ? await airportTzResp.json() : {};
            _airlinesData = airlinesResp.ok ? await airlinesResp.json() : {};
            if (window.SkyTraceTime?.setAirportTimezoneMap) {
                window.SkyTraceTime.setAirportTimezoneMap(_airportTimezonesData);
            }

            // 首次运行: 如果 localStorage 没有航班数据，尝试从静态文件导入
            if (!localStorage.getItem(LS_KEY_FLIGHTS)) {
                try {
                    const r = await _origFetch('data/flights.json');
                    if (r.ok) {
                        const data = await r.json();
                        if (data && data.flights && data.flights.length > 0) {
                            localStorage.setItem(LS_KEY_FLIGHTS, JSON.stringify(data));
                            console.log(`[SkyTrace] 📥 从静态文件导入 ${data.flights.length} 个航班`);
                        }
                    }
                } catch (e) { /* 没有初始数据也没关系 */ }
            }

            // 导入本地时刻表缓存
            if (!localStorage.getItem(LS_KEY_SCHEDULES)) {
                try {
                    const r = await _origFetch('data/flight_schedules.json');
                    if (r.ok) {
                        const data = await r.json();
                        if (data && Object.keys(data).length > 0) {
                            localStorage.setItem(LS_KEY_SCHEDULES, JSON.stringify(data));
                        }
                    }
                } catch (e) { /* 忽略 */ }
            }

            _dataInitialized = true;
        } catch (e) {
            console.error('[SkyTrace] 静态数据加载失败:', e);
            _airportsData = _airportsData || {};
            _airlinesData = _airlinesData || {};
        }
    }

    // ==================== API 路由器 ====================
    async function _handleStaticApi(url, options) {
        await _ensureStaticData();

        const method = (options.method || 'GET').toUpperCase();
        const urlObj = new URL(url, window.location.origin);
        const path = urlObj.pathname;
        const params = urlObj.searchParams;

        try {
            // --- 版本 ---
            if (path === '/api/version') {
                const version = typeof window.SKYTRACE_VERSION !== 'undefined' ? window.SKYTRACE_VERSION : 48;
                return _json({ version });
            }

            // --- 机场 ---
            if (path === '/api/airports' && method === 'GET') {
                return _json(_airportsData);
            }
            if (path === '/api/airports/search' && method === 'GET') {
                return _json(_searchAirports(params.get('q') || ''));
            }

            // --- 航空公司 ---
            if (path === '/api/airlines' && method === 'GET') {
                return _json(_airlinesData);
            }

            // --- 航班 CRUD ---
            // 注意: /api/flights/connect 和 /api/flights/disconnect 要在 /api/flights/:id 之前匹配
            if (path === '/api/flights/connect' && method === 'POST') {
                return _json(_connectFlights(JSON.parse(options.body).flight_ids || []));
            }
            if (path === '/api/flights/disconnect' && method === 'POST') {
                _disconnectFlights(JSON.parse(options.body));
                return _json({ success: true });
            }
            if (path === '/api/flights' && method === 'GET') {
                return _json(_getEnhancedFlights());
            }
            if (path === '/api/flights' && method === 'POST') {
                return _json(_addFlight(JSON.parse(options.body)));
            }

            // PUT/DELETE  /api/flights/{id}
            const flightMatch = path.match(/^\/api\/flights\/(.+)$/);
            if (flightMatch) {
                const id = flightMatch[1];
                if (method === 'PUT') {
                    return _json(_updateFlight(id, JSON.parse(options.body)));
                }
                if (method === 'DELETE') {
                    _deleteFlight(id);
                    return _json({ success: true });
                }
            }

            // --- 统计 ---
            if (path === '/api/stats' && method === 'GET') {
                return _json(_calculateStats(params.get('year') || ''));
            }

            // --- 航班查询 (CORS 代理) ---
            if (path === '/api/flight/lookup' && method === 'GET') {
                return _json(await _lookupFlight(params.get('flight_no') || '', params.get('date') || ''));
            }
            if (path === '/api/flight/status' && method === 'GET') {
                return _json({ success: false, error: '静态模式不支持实时状态查询' });
            }

            // --- 设置 ---
            if (path === '/api/settings' && method === 'GET') {
                return _json(_getSettingsSafe());
            }
            if (path === '/api/settings' && method === 'POST') {
                _saveSettings(JSON.parse(options.body));
                return _json({ success: true });
            }
            if (path === '/api/settings/test' && method === 'POST') {
                const body = JSON.parse(options.body);
                return _json(await _testApiConnection(body.api, body.key));
            }

            // --- 缓存统计 ---
            if (path === '/api/cache/stats') {
                const schedules = _getSchedules();
                return _json({ total_cached: Object.keys(schedules).length, file: 'localStorage' });
            }

            // --- 天气 (Open-Meteo 原生支持 CORS, 直接调用) ---
            if (path === '/api/weather' && method === 'GET') {
                return _json(await _getWeather(params.get('lat'), params.get('lon')));
            }

            // --- Logo 代理 ---
            if (path === '/api/logo-proxy') {
                const logoUrl = params.get('url');
                if (logoUrl) {
                    try { return await _origFetch(CORS_PROXY + encodeURIComponent(logoUrl)); }
                    catch (e) { return new Response('', { status: 404 }); }
                }
                return new Response('', { status: 400 });
            }

            // 未匹配
            console.warn('[SkyTrace Static] 未处理的 API:', method, path);
            return _json({ error: 'Not implemented in static mode' }, 501);

        } catch (e) {
            console.error('[SkyTrace Static] API 错误:', path, e);
            return _json({ error: e.message }, 500);
        }
    }

    // ==================== 工具函数 ====================
    function _json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    function _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _normalizeFlightNo(fn) {
        if (!fn) return '';
        return fn.toUpperCase().replace(/\s+/g, '').replace(/^([A-Z]{2})0+(\d+)$/, '$1$2');
    }

    function _extractAirlineCode(fn) {
        const m = (fn || '').match(/^([A-Z\d]{2})/);
        return m ? m[1] : '';
    }

    function _generateId() {
        return Math.random().toString(36).substr(2, 8);
    }

    // ==================== 航班数据操作 ====================
    function _getRawFlights() {
        try {
            const data = JSON.parse(localStorage.getItem(LS_KEY_FLIGHTS) || '{"flights":[]}');
            return data.flights || [];
        } catch (e) { return []; }
    }

    function _saveRawFlights(flights) {
        localStorage.setItem(LS_KEY_FLIGHTS, JSON.stringify({ flights }));
    }

    /** 模拟 app.py 的 get_flight_status_info() */
    function _getFlightStatusInfo(flight) {
        try {
            const now = new Date();
            const nowMs = now.getTime();
            const explicitCompleted = (flight.status || '').toLowerCase() === 'completed';
            const baseStatus = {
                checkin_open: null,
                checkin_close: null,
                boarding_time: null,
                dep_datetime: null,
                arr_datetime: null,
                status: 'scheduled',
                countdown: null,
                progress: 0,
            };

            if (!flight.date) {
                if (explicitCompleted) return { ...baseStatus, status: 'completed', progress: 100 };
                return { status: 'unknown', countdown: null };
            }

            const flightDate = new Date(`${flight.date}T00:00:00`);
            if (Number.isNaN(flightDate.getTime())) {
                if (explicitCompleted) return { ...baseStatus, status: 'completed', progress: 100 };
                return { status: 'unknown', countdown: null };
            }

            const depTimeStr = (flight.dep_time || '').trim();
            if (!depTimeStr) {
                if (explicitCompleted || flightDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
                    return { ...baseStatus, status: 'completed', progress: 100 };
                }
                const daysLeft = Math.floor((flightDate - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
                return {
                    ...baseStatus,
                    countdown: daysLeft > 0 ? { key: 'daysLeft', args: [daysLeft] } : null,
                };
            }

            const timeline = window.SkyTraceTime?.resolveFlightInstants(flight, _airportsData);
            if (!timeline) {
                if (explicitCompleted) return { ...baseStatus, status: 'completed', progress: 100 };
                return { status: 'unknown', countdown: null };
            }

            const depTime = new Date(timeline.depUtcMs);
            const arrTime = new Date(timeline.arrUtcMs);
            const checkinOpen = new Date(timeline.depUtcMs - 24 * 3600000);
            const checkinClose = new Date(timeline.depUtcMs - 45 * 60000);
            const boardingTime = new Date(timeline.depUtcMs - 40 * 60000);

            const flightDuration = (timeline.arrUtcMs - timeline.depUtcMs) / 1000;
            let progress = 0;
            if (nowMs > timeline.depUtcMs && nowMs < timeline.arrUtcMs && flightDuration > 0) {
                progress = Math.min(100, Math.round(((nowMs - timeline.depUtcMs) / 1000 / flightDuration) * 100));
            }

            const fmt = (date, timeZone) => {
                const parts = {};
                new Intl.DateTimeFormat('en-CA', {
                    timeZone: timeZone || 'UTC',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23',
                }).formatToParts(date).forEach(part => {
                    if (part.type !== 'literal') parts[part.type] = part.value;
                });
                return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
            };
            const si = {
                checkin_open: fmt(checkinOpen, timeline.depTimeZone),
                checkin_close: fmt(checkinClose, timeline.depTimeZone),
                boarding_time: fmt(boardingTime, timeline.depTimeZone),
                dep_datetime: fmt(depTime, timeline.depTimeZone),
                arr_datetime: fmt(arrTime, timeline.arrTimeZone),
                status: 'scheduled',
                countdown: null,
                progress,
            };

            if (explicitCompleted || nowMs > timeline.arrUtcMs) {
                si.status = 'completed';
                si.progress = 100;
            } else if (nowMs > timeline.depUtcMs) {
                si.status = 'in_flight';
                si.countdown = { key: 'etaMinutes', args: [Math.floor((timeline.arrUtcMs - nowMs) / 60000)] };
            } else if (nowMs > boardingTime.getTime()) {
                si.status = 'boarding';
                si.countdown = { key: 'depInMinutes', args: [Math.floor((timeline.depUtcMs - nowMs) / 60000)] };
            } else if (nowMs > checkinOpen.getTime()) {
                si.status = 'checkin_open';
                const hoursLeft = (timeline.depUtcMs - nowMs) / 3600000;
                si.countdown = hoursLeft >= 1
                    ? { key: 'depInHours', args: [Math.floor(hoursLeft)] }
                    : { key: 'depInMinutes', args: [Math.floor(hoursLeft * 60)] };
            } else {
                const depNow = new Date(now.toLocaleString('en-US', { timeZone: timeline.depTimeZone || 'UTC' }));
                const todayStart = new Date(depNow.getFullYear(), depNow.getMonth(), depNow.getDate());
                const daysLeft = Math.floor((flightDate - todayStart) / 86400000);
                if (daysLeft > 0) {
                    si.countdown = { key: 'daysLeft', args: [daysLeft] };
                } else {
                    const hours = Math.floor((checkinOpen.getTime() - nowMs) / 3600000);
                    if (hours > 0) si.countdown = { key: 'hoursToCheckin', args: [hours] };
                }
            }
            return si;
        } catch (e) {
            return { status: 'unknown', countdown: null };
        }
    }

    /** 模拟 app.py 的 GET /api/flights — 返回增强的航班列表 */
    function _getEnhancedFlights() {
        const flights = _getRawFlights();
        const enhanced = flights.map(flight => {
            const f = { ...flight };
            f.dep_airport = _airportsData[flight.departure] || {};
            f.arr_airport = _airportsData[flight.arrival] || {};
            if (flight.stopover) f.stopover_airport = _airportsData[flight.stopover] || {};

            if (f.dep_airport.lat && f.arr_airport.lat) {
                f.distance = Math.round(_haversine(
                    f.dep_airport.lat, f.dep_airport.lon,
                    f.arr_airport.lat, f.arr_airport.lon
                ));
            } else {
                f.distance = 0;
            }

            f.status_info = _getFlightStatusInfo(flight);
            return f;
        });
        enhanced.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return enhanced;
    }

    function _addFlight(flight) {
        flight.id = _generateId();
        const flights = _getRawFlights();
        flights.push(flight);
        _saveRawFlights(flights);

        // 缓存到本地时刻表
        const fn = _normalizeFlightNo(flight.flight_no);
        if (fn && flight.departure && flight.arrival) {
            const schedules = _getSchedules();
            if (!schedules[fn]) {
                schedules[fn] = {
                    departure: flight.departure, arrival: flight.arrival,
                    dep_time: flight.dep_time || '', arr_time: flight.arr_time || '',
                    aircraft: flight.aircraft || '', source: 'user',
                };
                _saveSchedules(schedules);
            }
        }
        return { success: true, id: flight.id };
    }

    function _updateFlight(id, updated) {
        const flights = _getRawFlights();
        const idx = flights.findIndex(f => f.id === id);
        if (idx >= 0) {
            updated.id = id;
            // 保留后台管理的字段（如联程分组），前端未传时不丢失
            ['connected_group'].forEach(k => { if (flights[idx][k] && !(k in updated)) updated[k] = flights[idx][k]; });
            flights[idx] = updated;
            _saveRawFlights(flights);
            return { success: true };
        }
        return { success: false, error: '航班不存在' };
    }

    function _deleteFlight(id) {
        _saveRawFlights(_getRawFlights().filter(f => f.id !== id));
    }

    // ==================== 联程操作 ====================
    function _connectFlights(flightIds) {
        if (flightIds.length < 2) return { success: false, error: '至少选择2个航班' };

        const flights = _getRawFlights();
        const existingGroups = new Set();
        flights.forEach(f => {
            if (flightIds.includes(f.id) && f.connected_group) existingGroups.add(f.connected_group);
        });

        let groupId;
        if (existingGroups.size > 0) {
            groupId = [...existingGroups].sort()[0];
            flights.forEach(f => { if (existingGroups.has(f.connected_group)) f.connected_group = groupId; });
        } else {
            groupId = _generateId();
        }

        flights.forEach(f => { if (flightIds.includes(f.id)) f.connected_group = groupId; });
        _saveRawFlights(flights);
        return { success: true, group_id: groupId };
    }

    function _disconnectFlights(body) {
        const flights = _getRawFlights();
        const fids = body.flight_ids || [];
        const gid = body.group_id || '';

        if (fids.length > 0) {
            const affected = new Set();
            flights.forEach(f => {
                if (fids.includes(f.id) && f.connected_group) { affected.add(f.connected_group); delete f.connected_group; }
            });
            affected.forEach(g => {
                const rem = flights.filter(f => f.connected_group === g);
                if (rem.length <= 1) rem.forEach(f => delete f.connected_group);
            });
        } else if (gid) {
            flights.forEach(f => { if (f.connected_group === gid) delete f.connected_group; });
        }
        _saveRawFlights(flights);
    }

    // ==================== 机场搜索 ====================
    function _searchAirports(query) {
        if (!query) return {};
        const q = query.toLowerCase();
        const results = {};
        for (const [code, info] of Object.entries(_airportsData)) {
            if (code.startsWith('_')) continue;
            if (code.toLowerCase().includes(q) ||
                (info.name || '').toLowerCase().includes(q) ||
                (info.city || '').toLowerCase().includes(q) ||
                (info.name_en || '').toLowerCase().includes(q) ||
                (info.city_en || '').toLowerCase().includes(q) ||
                (info.country || '').toLowerCase().includes(q) ||
                (info.country_en || '').toLowerCase().includes(q)) {
                results[code] = info;
            }
        }
        return results;
    }

    // ==================== 设置 ====================
    function _getSettings() {
        try { return JSON.parse(localStorage.getItem(LS_KEY_SETTINGS) || '{}'); }
        catch (e) { return {}; }
    }

    function _getSettingsSafe() {
        const settings = _getSettings();
        const safe = {};
        for (const [k, v] of Object.entries(settings)) {
            if (k.endsWith('_key') && v) {
                safe[k] = v.length > 8 ? v.slice(0, 4) + '****' + v.slice(-4) : '****';
                safe[k + '_set'] = true;
            } else if (k.endsWith('_key')) {
                safe[k] = '';
                safe[k + '_set'] = false;
            } else {
                safe[k] = v;
            }
        }
        return safe;
    }

    function _saveSettings(newSettings) {
        const current = _getSettings();
        for (const [k, v] of Object.entries(newSettings)) {
            if (typeof v === 'string' && v.includes('****')) continue;
            current[k] = v;
        }
        localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(current));
    }

    // ==================== 时刻表缓存 ====================
    function _getSchedules() {
        try { return JSON.parse(localStorage.getItem(LS_KEY_SCHEDULES) || '{}'); }
        catch (e) { return {}; }
    }

    function _saveSchedules(data) {
        localStorage.setItem(LS_KEY_SCHEDULES, JSON.stringify(data));
    }

    // ==================== 航班查询 (CORS 代理) ====================
    async function _lookupFlight(rawFlightNo, date) {
        const flightNo = _normalizeFlightNo(rawFlightNo);
        if (!flightNo || flightNo.length < 3) {
            return { success: false, error: '请输入有效航班号' };
        }

        const airlineCode = _extractAirlineCode(flightNo);
        const result = {
            success: true, flight_no: flightNo, date,
            airline: (_airlinesData[airlineCode] || {}).name || '',
            airline_code: airlineCode,
            departure: '', arrival: '', dep_time: '', arr_time: '',
            dep_terminal: '', arr_terminal: '', dep_gate: '', arr_gate: '',
            aircraft: '', flight_status: '', source: 'none', api_configured: false,
        };

        const settings = _getSettings();
        const hasApi = !!(settings.aviationstack_key || settings.airlabs_key || settings.aerodata_key);
        result.api_configured = hasApi;

        // Level 1: API 查询 (通过 CORS 代理, 解决 Mixed Content + CORS)
        if (hasApi) {
            const apiResult = await _queryAllApis(flightNo, date, settings);
            if (apiResult && apiResult.departure) {
                Object.entries(apiResult).forEach(([k, v]) => { if (v) result[k] = v; });
                result.source = 'api';
                // 兜底: 缺少航站楼信息时默认 MAIN
                if (!result.dep_terminal) result.dep_terminal = 'MAIN';
                if (!result.arr_terminal) result.arr_terminal = 'MAIN';
                _cacheFlightResult(flightNo, apiResult);
                return result;
            }
        }

        // Level 2 & 3: 本地时刻表 + 用户历史
        const local = _findInLocalData(flightNo);
        if (local && local.departure) {
            ['departure', 'arrival', 'dep_time', 'arr_time', 'aircraft', 'dep_terminal', 'arr_terminal']
                .forEach(k => { if (local[k]) result[k] = local[k]; });
            result.source = local.source || 'local';
        }

        // 兜底: 缺少航站楼信息时默认 MAIN
        if (!result.dep_terminal) result.dep_terminal = 'MAIN';
        if (!result.arr_terminal) result.arr_terminal = 'MAIN';

        return result;
    }

    async function _queryAllApis(flightNo, date, settings) {
        const preferred = settings.preferred_api || 'auto';
        const apis = [
            ['aerodata', _queryAeroData, settings.aerodata_key || ''],
            ['airlabs', _queryAirLabs, settings.airlabs_key || ''],
            ['aviationstack', _queryAviationStack, settings.aviationstack_key || ''],
        ];
        if (preferred !== 'auto') apis.sort((a, b) => a[0] === preferred ? -1 : b[0] === preferred ? 1 : 0);

        for (const [name, queryFn, key] of apis) {
            if (!key) continue;
            try {
                const r = await queryFn(flightNo, date, key);
                if (r && r.departure) return r;
            } catch (e) {
                console.warn(`[SkyTrace] ${name} 查询失败:`, e.message);
            }
        }
        return null;
    }

    /** AviationStack (免费版仅 HTTP — 通过 CORS 代理转 HTTPS) */
    async function _queryAviationStack(flightNo, date, apiKey) {
        let url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${flightNo}`;
        if (date) url += `&flight_date=${date}`;

        const resp = await _origFetch(CORS_PROXY + encodeURIComponent(url));
        const data = await resp.json();
        const items = data.data || [];
        if (items.length > 0) {
            const f = items[0];
            const dep = f.departure || {}, arr = f.arrival || {}, ac = f.aircraft || {};
            return {
                departure: dep.iata || '', arrival: arr.iata || '',
                dep_time: (dep.scheduled || '').slice(11, 16),
                arr_time: (arr.scheduled || '').slice(11, 16),
                dep_terminal: dep.terminal || '', arr_terminal: arr.terminal || '',
                dep_gate: dep.gate || '', arr_gate: arr.gate || '',
                aircraft: ac.iata || '', flight_status: f.flight_status || '',
                api_source: 'AviationStack',
            };
        }
        return null;
    }

    /** AirLabs (HTTPS, 但需 CORS 代理绕过跨域限制) */
    async function _queryAirLabs(flightNo, date, apiKey) {
        const url = `https://airlabs.co/api/v9/flights?api_key=${apiKey}&flight_iata=${flightNo}`;
        const resp = await _origFetch(CORS_PROXY + encodeURIComponent(url));
        const data = await resp.json();
        const items = data.response || [];
        if (items.length > 0) {
            const f = items[0];
            return {
                departure: f.dep_iata || '', arrival: f.arr_iata || '',
                dep_time: (f.dep_time_utc || f.dep_time || '').slice(11, 16),
                arr_time: (f.arr_time_utc || f.arr_time || '').slice(11, 16),
                dep_terminal: f.dep_terminal || '', arr_terminal: f.arr_terminal || '',
                dep_gate: f.dep_gate || '', arr_gate: f.arr_gate || '',
                aircraft: f.aircraft_icao || '', flight_status: f.status || '',
                api_source: 'AirLabs',
            };
        }
        return null;
    }

    /** AeroDataBox via RapidAPI (HTTPS + 自定义 Header) */
    async function _queryAeroData(flightNo, date, apiKey) {
        const searchDate = date || new Date().toISOString().slice(0, 10);
        const url = `https://aerodatabox.p.rapidapi.com/flights/number/${flightNo}/${searchDate}T00:00/${searchDate}T23:59`;
        const resp = await _origFetch(CORS_PROXY + encodeURIComponent(url), {
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
            },
        });
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
            const f = data[0];
            const dep = f.departure || {}, arr = f.arrival || {};
            const depSched = ((dep.scheduledTime || {}).local || '');
            const arrSched = ((arr.scheduledTime || {}).local || '');
            return {
                departure: (dep.airport || {}).iata || '',
                arrival: (arr.airport || {}).iata || '',
                dep_time: depSched.length > 16 ? depSched.slice(11, 16) : '',
                arr_time: arrSched.length > 16 ? arrSched.slice(11, 16) : '',
                dep_terminal: dep.terminal || '', arr_terminal: arr.terminal || '',
                dep_gate: dep.gate || '', arr_gate: arr.gate || '',
                aircraft: (f.aircraft || {}).model || '',
                flight_status: f.status || '',
                api_source: 'AeroDataBox',
            };
        }
        return null;
    }

    function _findInLocalData(flightNo) {
        const fn = _normalizeFlightNo(flightNo);
        // 时刻表缓存
        const schedules = _getSchedules();
        if (schedules[fn] && schedules[fn].departure) return { ...schedules[fn], source: 'schedule' };
        // 用户历史记录
        for (const f of _getRawFlights()) {
            if (_normalizeFlightNo(f.flight_no) === fn) {
                return {
                    departure: f.departure || '', arrival: f.arrival || '',
                    dep_time: f.dep_time || '', arr_time: f.arr_time || '',
                    aircraft: f.aircraft || '',
                    dep_terminal: f.dep_terminal || '', arr_terminal: f.arr_terminal || '',
                    source: 'history',
                };
            }
        }
        return null;
    }

    function _cacheFlightResult(flightNo, result) {
        const schedules = _getSchedules();
        schedules[_normalizeFlightNo(flightNo)] = {
            departure: result.departure || '', arrival: result.arrival || '',
            dep_time: result.dep_time || '', arr_time: result.arr_time || '',
            aircraft: result.aircraft || '',
            dep_terminal: result.dep_terminal || '', arr_terminal: result.arr_terminal || '',
            cached_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            source: result.api_source || 'api',
        };
        _saveSchedules(schedules);
    }

    // ==================== API 连接测试 ====================
    async function _testApiConnection(apiName, apiKey) {
        if (!apiKey || apiKey.includes('****')) return { success: false, message: '请输入有效的API密钥' };
        const testFn = 'CZ3101';
        try {
            let result = null;
            if (apiName === 'aviationstack') result = await _queryAviationStack(testFn, '', apiKey);
            else if (apiName === 'airlabs') result = await _queryAirLabs(testFn, '', apiKey);
            else if (apiName === 'aerodata') result = await _queryAeroData(testFn, '', apiKey);

            if (result && result.departure) return { success: true, message: `✅ 连接成功！查到 ${testFn} 航班信息` };
            if (result) return { success: true, message: '✅ API连接成功 (测试航班暂无数据)' };
            return { success: false, message: '❌ 连接失败，请检查密钥是否正确' };
        } catch (e) {
            return { success: false, message: '❌ 连接失败: ' + e.message };
        }
    }

    // ==================== 天气 (Open-Meteo 原生 CORS) ====================
    async function _getWeather(lat, lon) {
        if (!lat || !lon) return { success: false, error: 'Missing lat/lon' };
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
                `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
            const resp = await _origFetch(url);
            return { success: true, data: await resp.json() };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ==================== 统计计算 ====================
    function _calculateStats(year) {
        const allFlights = _getRawFlights();
        const flights = (year && year !== 'all')
            ? allFlights.filter(f => (f.date || '').startsWith(year))
            : allFlights;

        const availableYears = [...new Set(
            allFlights.map(f => (f.date || '').slice(0, 4)).filter(y => y.length === 4)
        )].sort().reverse();

        let totalDistance = 0;
        const visitedAirports = new Set();
        const visitedCountries = new Set();
        const distances = [];

        flights.forEach(f => {
            visitedAirports.add(f.departure || '');
            visitedAirports.add(f.arrival || '');
            const dep = _airportsData[f.departure] || {};
            const arr = _airportsData[f.arrival] || {};
            if (dep.country) visitedCountries.add(dep.country);
            if (arr.country) visitedCountries.add(arr.country);
            let dist = 0;
            if (dep.lat && arr.lat) {
                dist = _haversine(dep.lat, dep.lon, arr.lat, arr.lon);
                totalDistance += dist;
            }
            distances.push(Math.round(dist));
        });

        let totalHours = 0;
        const durations = [];
        flights.forEach(f => {
            try {
                const minutes = window.SkyTraceTime?.calculateDurationMinutes(f, _airportsData);
                if (minutes) {
                    const diff = minutes / 60;
                    totalHours += diff;
                    durations.push(Math.round(diff * 10) / 10);
                    return;
                }
                const [dh, dm] = (f.dep_time || '').split(':').map(Number);
                const [ah, am] = (f.arr_time || '').split(':').map(Number);
                
                // 👇 关键修复：必须同时检查小时(dh, ah)和分钟(dm, am)
                if (isNaN(dh) || isNaN(dm) || isNaN(ah) || isNaN(am)) { 
                    durations.push(0); 
                    return; // 遇到没有时间的航班，跳过计算时长，防止污染总数
                }
                
                let diff = (ah * 60 + am - dh * 60 - dm) / 60;
                const dayOffset = f.arr_day_offset || (f.arr_next_day ? 1 : 0);
                if (dayOffset) diff += 24 * dayOffset;
                else if (diff < 0) diff += 24;
                totalHours += diff;
                durations.push(Math.round(diff * 10) / 10);
            } catch (e) { durations.push(0); }
        });

        visitedAirports.delete('');
        visitedCountries.delete('');

        // 最常飞航线
        const routeCounts = {};
        flights.forEach(f => {
            const r = `${f.departure || ''}-${f.arrival || ''}`;
            if (r !== '-') routeCounts[r] = (routeCounts[r] || 0) + 1;
        });
        const topRoutes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        // 最常用航空公司
        const airlineCounts = {};
        flights.forEach(f => {
            const al = f.airline || _extractAirlineCode(f.flight_no || '');
            if (al) airlineCounts[al] = (airlineCounts[al] || 0) + 1;
        });
        const topAirlines = Object.entries(airlineCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        // ===== 趣味统计 =====
        let seatW = 0, seatA = 0, seatM = 0;
        flights.forEach(f => {
            const seat = (f.seat || '').toUpperCase().trim();
            if (!seat) return;
            const ch = seat[seat.length - 1];
            if ('AKF'.includes(ch)) seatW++;
            else if ('CDGH'.includes(ch)) seatA++;
            else seatM++;
        });

        const cabinCounts = {};
        flights.forEach(f => { const c = f.class || 'economy'; cabinCounts[c] = (cabinCounts[c] || 0) + 1; });

        let earliest = null, latest = null;
        flights.forEach(f => {
            if (!f.dep_time) return;
            if (!earliest || f.dep_time < earliest.dep_time) earliest = f;
            if (!latest || f.dep_time > latest.dep_time) latest = f;
        });

        const longestIdx = distances.length > 0 ? distances.reduce((mi, d, i, a) => d > a[mi] ? i : mi, 0) : -1;
        const shortestIdx = distances.length > 0 ? distances.reduce((mi, d, i, a) => (d > 0 && (a[mi] === 0 || d < a[mi])) ? i : mi, 0) : -1;

        const monthCounts = {};
        flights.forEach(f => { const d = f.date || ''; if (d.length >= 7) monthCounts[d.slice(0, 7)] = (monthCounts[d.slice(0, 7)] || 0) + 1; });

        const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
        const weekdayFlights = [[], [], [], [], [], [], []];
        flights.forEach(f => {
            try {
                const wd = new Date(f.date).getDay();
                const wdMon = wd === 0 ? 6 : wd - 1;
                weekdayCounts[wdMon]++;
                weekdayFlights[wdMon].push({ flight_no: f.flight_no || '', route: `${f.departure || ''}-${f.arrival || ''}`, date: f.date || '' });
            } catch (e) {}
        });

        const monthFlights = {}, dayFlights = {};
        flights.forEach(f => {
            const d = f.date || '';
            if (d.length < 7) return;
            const m = d.slice(0, 7);
            if (!monthFlights[m]) monthFlights[m] = [];
            const info = { flight_no: f.flight_no || '', route: `${f.departure || ''}-${f.arrival || ''}`, date: d };
            monthFlights[m].push(info);
            if (d.length >= 10) { if (!dayFlights[d]) dayFlights[d] = []; dayFlights[d].push(info); }
        });

        const n = flights.length;
        const fmtFlight = f => ({ flight_no: f.flight_no || '', dep_time: f.dep_time || '', route: `${f.departure || ''}-${f.arrival || ''}`, date: f.date || '' });

        return {
            total_flights: n,
            total_distance: Math.round(totalDistance),
            total_hours: Math.round(totalHours * 10) / 10,
            visited_airports: visitedAirports.size,
            visited_countries: visitedCountries.size,
            top_routes: topRoutes.map(([route, count]) => ({ route, count })),
            top_airlines: topAirlines.map(([airline, count]) => ({ airline, count })),
            available_years: availableYears,
            fun_stats: {
                seat_preference: { window: seatW, aisle: seatA, middle: seatM },
                cabin_distribution: cabinCounts,
                earliest_flight: earliest ? fmtFlight(earliest) : null,
                latest_flight: latest ? fmtFlight(latest) : null,
                longest_flight: longestIdx >= 0 && distances[longestIdx] > 0 ? {
                    flight_no: flights[longestIdx].flight_no || '', distance: distances[longestIdx],
                    route: `${flights[longestIdx].departure || ''}-${flights[longestIdx].arrival || ''}`,
                } : null,
                shortest_flight: shortestIdx >= 0 && distances[shortestIdx] > 0 ? {
                    flight_no: flights[shortestIdx].flight_no || '', distance: distances[shortestIdx],
                    route: `${flights[shortestIdx].departure || ''}-${flights[shortestIdx].arrival || ''}`,
                } : null,
                month_distribution: monthCounts,
                weekday_distribution: weekdayCounts,
                weekday_flights: weekdayFlights,
                month_flights: monthFlights,
                day_flights: dayFlights,
                avg_distance: n > 0 ? Math.round(totalDistance / n) : 0,
                avg_hours: n > 0 ? Math.round(totalHours / n * 10) / 10 : 0,
            },
        };
    }

    // ==================== 暴露调试接口 ====================
    window._skytraceStatic = {
        isReady: _modeReady,
        isStatic: () => _staticMode,
        /** 导出航班数据为 JSON 字符串 */
        exportFlights: () => JSON.stringify(_getRawFlights(), null, 2),
        /** 从 JSON 字符串导入航班数据 */
        importFlights: (jsonStr) => {
            try {
                const data = JSON.parse(jsonStr);
                const flights = Array.isArray(data) ? data : (data.flights || []);
                _saveRawFlights(flights);
                console.log(`[SkyTrace] ✅ 导入 ${flights.length} 个航班`);
                return true;
            } catch (e) {
                console.error('[SkyTrace] 导入失败:', e);
                return false;
            }
        },
    };
})();
