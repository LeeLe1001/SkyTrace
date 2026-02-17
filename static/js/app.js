/**
 * SkyTrace - 前端应用逻辑 v2.1
 * 双地图架构: 首页(仅待出行) + 行程地图(全功能筛选)
 */

// ==================== 全局变量 ====================
let homeMap = null;
let homeTileLayer = null;
let homeArcLayers = [];

let fmap = null;
let fmapTileLayer = null;
let fmapArcLayers = [];
let fmapInited = false;
let fmapStatusFilter = 'all';
let fmapFilteredFlights = [];

let airports = {};
let airlines = {};
let flights = [];
let filteredFlights = [];
let currentFlightId = null;
let currentStatusFilter = 'upcoming';
let connectMode = false;
let selectedConnectIds = new Set();
let currentStatsYear = 'all';
let cachedStatsData = null;
let homeRoutesByFlight = {};
let _currentCenterSlide = null;

// ==================== 航空公司 Logo 映射 (IATA → soaring-symbols slug) ====================
const AIRLINE_LOGO_MAP = {
    'A3':'aegean-airlines','EI':'aer-lingus','AR':'aerolineas-argentinas','AM':'aeromexico',
    'ZB':'air-albania','AH':'air-algerie','KC':'air-astana','AC':'air-canada',
    'EN':'air-dolomiti','UX':'air-europa','AF':'air-france','AI':'air-india',
    'MK':'air-mauritius','NZ':'air-new-zealand','JU':'air-serbia','TS':'air-transat',
    'AK':'airasia','KT':'airasia','FD':'airasia','QZ':'airasia','Z2':'airasia',
    'BT':'airbaltic','QP':'akasa-air','AS':'alaska-airlines','OZ':'asiana-airlines',
    'RC':'atlantic-airways','AV':'avianca','LR':'avianca','2K':'avianca','TA':'avianca',
    'J2':'azerbaijan-airlines','QH':'bamboo-airways','PG':'bangkok-airways',
    'BA':'british-airways','SN':'brussels-airlines','CX':'cathay-pacific','CM':'copa-airlines',
    'EK':'emirates','ET':'ethiopian-airlines','EY':'etihad-airways','EW':'eurowings',
    'ZD':'ewa-air','FJ':'fiji-airways','FY':'firefly','XY':'flynas',
    'GA':'garuda-indonesia','UO':'hk-express','IB':'iberia','FI':'icelandair',
    '6E':'indigo','JL':'japan-airlines','JQ':'jetstar','GK':'jetstar',
    'KQ':'kenya-airways','KL':'klm','KE':'korean-air','KU':'kuwait-airways',
    'LA':'latam-airlines','JJ':'latam-airlines','4C':'latam-airlines','XL':'latam-airlines',
    'LP':'latam-airlines','PZ':'latam-airlines','LO':'lot-polish-airlines','LH':'lufthansa',
    'MH':'malaysia-airlines','UB':'myanmar-national-airlines','WY':'oman-air',
    'ZP':'paranair','MM':'peach-aviation','PR':'philippine-airlines','QF':'qantas',
    'QR':'qatar-airways','RX':'riyadh-air','AT':'royal-air-maroc','BI':'royal-brunei-airlines',
    'FR':'ryanair','SV':'saudia','SK':'scandinavian-airlines','SL':'scandinavian-airlines',
    'TR':'scoot','SQ':'singapore-airlines','WN':'southwest-airlines','JX':'starlux-airlines',
    '9G':'sun-phuquoc-airways','LX':'swiss','TW':'tway-air','TP':'tap-air-portugal',
    'RO':'tarom','TG':'thai-airways','HV':'transavia','TK':'turkish-airlines',
    'UA':'united-airlines','VJ':'vietjet-air','VN':'vietnam-airlines',
    'VS':'virgin-atlantic','VA':'virgin-australia','WS':'westjet',
    'W6':'wizz-air','5W':'wizz-air','W9':'wizz-air','MF':'xiamenair',
};
const LOGO_BASE = 'https://raw.githubusercontent.com/anhthang/soaring-symbols/main/assets/';
function getAirlineLogoHtml(flightNo) {
    const iata = (flightNo || '').match(/^([A-Z0-9]{2})/i)?.[1]?.toUpperCase();
    const slug = iata ? AIRLINE_LOGO_MAP[iata] : null;
    if (slug) {
        return `<img class="airline-logo" src="${LOGO_BASE}${slug}/icon.svg" alt="${iata}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="airline-logo-fallback" style="display:none">${iata}</span>`;
    }
    return iata ? `<span class="airline-logo-fallback">${iata}</span>` : '';
}

// ==================== 主题系统 ====================
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function initTheme() {
    const saved = localStorage.getItem('skytrace-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('skytrace-theme', next);
    updateThemeIcon(next);
    updateMapTiles(next);
    updateSettingsThemeUI(next);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function updateSettingsThemeUI(theme) {
    const icon = document.getElementById('settings-theme-icon');
    const text = document.getElementById('settings-theme-text');
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    if (text) text.textContent = theme === 'dark' ? (t('themeDark') || '深色模式') : (t('themeLight') || '浅色模式');
}

function updateMapTiles(theme) {
    const url = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    if (homeMap && homeTileLayer) homeTileLayer.setUrl(url);
    if (fmap && fmapTileLayer) fmapTileLayer.setUrl(url);
}

// ==================== 语言切换 ====================
function toggleLangDropdown() {
    const dd = document.getElementById('lang-dropdown');
    if (dd) dd.classList.toggle('active');
}
function switchLang(lang) {
    setLanguage(lang);
    document.getElementById('lang-dropdown')?.classList.remove('active');
    updateSettingsLangButtons();
}
function switchLangFromSettings(lang) {
    setLanguage(lang);
    updateSettingsLangButtons();
}
function updateSettingsLangButtons() {
    document.querySelectorAll('.settings-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-switcher')) {
        const dd = document.getElementById('lang-dropdown');
        if (dd) dd.classList.remove('active');
    }
});

// ==================== 初始化 ====================
// NOTE: 不使用 DOMContentLoaded，因为此脚本在 </body> 前加载
// 此时 DOM 已完全可用，直接执行初始化
function _skytraceInit() {
    console.log('[SkyTrace] Starting init...');
    // 第一步: 同步初始化 — UI 必须立即可交互
    try { initTheme(); console.log('[SkyTrace] initTheme OK'); } catch(e) { console.error('[SkyTrace] initTheme:', e); }
    try { initTabs(); console.log('[SkyTrace] initTabs OK'); } catch(e) { console.error('[SkyTrace] initTabs:', e); }
    try { applyI18n(); console.log('[SkyTrace] applyI18n OK'); } catch(e) { console.error('[SkyTrace] applyI18n:', e); }

    // 第二步: 初始化地图 (依赖 Leaflet)
    try { initHomeMap(); console.log('[SkyTrace] initHomeMap OK'); } catch(e) { console.error('[SkyTrace] initHomeMap:', e); }

    // 第三步: 异步加载数据 (并行, 不阻塞 UI)
    Promise.all([
        loadAirports().catch(e => console.error('[SkyTrace] loadAirports:', e)),
        loadAirlines().catch(e => console.error('[SkyTrace] loadAirlines:', e)),
    ]).then(() => {
        console.log('[SkyTrace] Data loaded, loading flights...');
        return loadFlights().catch(e => console.error('[SkyTrace] loadFlights:', e));
    }).then(() => {
        console.log('[SkyTrace] All init complete');
        // 隐藏加载指示器
        const li = document.getElementById('loading-indicator');
        if (li) li.style.display = 'none';
    });

    // 第四步: 设置航班号输入框事件
    try { _initFlightInput(); } catch(e) { console.error('[SkyTrace] _initFlightInput:', e); }
    // 检查 API 状态
    checkApiStatus().catch(() => {});
}
// 立即执行
_skytraceInit();

// ==================== 首页地图 (仅待出行) ====================
function initHomeMap() {
    homeMap = L.map('home-map', {
        center: [35, 105],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false
    });
    const theme = localStorage.getItem('skytrace-theme') || 'dark';
    const tileUrl = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    homeTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(homeMap);
    L.control.zoom({ position: 'bottomright' }).addTo(homeMap);
}

function getLocalTodayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function renderHomeRoutes() {
    if (!homeMap) return;
    homeArcLayers.forEach(l => { try { homeMap.removeLayer(l); } catch(e) {} });
    homeArcLayers = [];
    homeRoutesByFlight = {};

    const todayStr = getLocalTodayStr();
    const upcoming = flights.filter(f => f.status_info?.status !== 'completed' && f.date >= todayStr);
    const visitedAirports = new Set();
    const airportTerminals = {};

    upcoming.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;
        if (!dep || !arr || !dep.lat || !arr.lat) return;
        visitedAirports.add(flight.departure);
        visitedAirports.add(flight.arrival);
        if (flight.dep_terminal && !airportTerminals[flight.departure]) airportTerminals[flight.departure] = flight.dep_terminal;
        if (flight.arr_terminal && !airportTerminals[flight.arrival]) airportTerminals[flight.arrival] = flight.arr_terminal;

        const flightLayers = [];
        const generator = new arc.GreatCircle({ x: dep.lon, y: dep.lat }, { x: arr.lon, y: arr.lat });
        const arcLine = generator.Arc(50, { offset: 10 });
        arcLine.geometries.forEach(geo => {
            const coords = geo.coords.map(c => [c[1], c[0]]);
            const glow = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.3 }).addTo(homeMap);
            const line = L.polyline(coords, { color: '#60a5fa', weight: 2, opacity: 0.8 }).addTo(homeMap);
            homeArcLayers.push(glow, line);
            flightLayers.push(glow, line);
        });
        homeRoutesByFlight[flight.id] = flightLayers;
    });

    visitedAirports.forEach(code => {
        const airport = airports[code];
        if (!airport) return;
        const terminalHtml = airportTerminals[code] ? `<div style="font-size:11px;color:#3b82f6;margin-top:3px;">T${airportTerminals[code]}</div>` : '';
        const marker = L.circleMarker([airport.lat, airport.lon], {
            radius: 6, fillColor: '#3b82f6', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(homeMap);
        marker.bindPopup(`<div style="text-align:center;padding:5px;"><div style="font-size:18px;font-weight:bold;color:#3b82f6;">${code}</div><div style="font-size:13px;color:#666;margin-top:4px;">${getAirportCity(airports[code])} · ${getAirportName(airports[code])}</div>${terminalHtml}</div>`, { className: 'airport-popup' });
        homeArcLayers.push(marker);
    });

    if (homeArcLayers.length > 0) {
        homeMap.fitBounds(L.featureGroup(homeArcLayers).getBounds(), { padding: [50, 50] });
    }

    // 飞行中动画
    renderAnimatedFlightOnMap(homeMap, homeArcLayers, upcoming);

    // 更新首页覆盖层
    renderHomeFlightOverlay(upcoming);
}

// ==================== 首页覆盖层: 悬浮最近航班 + 可展开列表 ====================
let _hoExpanded = false;
let _hoDragStartY = 0;
let _hoStartH = 0;

function initHomeOverlayDrag() {
    const el = document.getElementById('home-flights-overlay');
    if (!el || el._dragInited) return;
    el._dragInited = true;
    const handle = el.querySelector('.home-overlay-handle');
    const header = el.querySelector('.home-overlay-header');

    // Click header or handle to toggle expand
    const toggleClick = () => {
        if (_hoExpanded) collapseHomeOverlay(); else expandHomeOverlay();
    };
    if (header) header.addEventListener('click', toggleClick);

    // Touch drag on handle
    if (handle) {
        handle.addEventListener('touchstart', e => {
            _hoDragStartY = e.touches[0].clientY;
            _hoStartH = el.offsetHeight;
            el.style.transition = 'none';
        }, {passive: true});
        handle.addEventListener('touchmove', e => {
            const dy = _hoDragStartY - e.touches[0].clientY;
            const newH = Math.max(60, Math.min(window.innerHeight * 0.85, _hoStartH + dy));
            el.style.maxHeight = newH + 'px';
        }, {passive: true});
        handle.addEventListener('touchend', () => {
            el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
            const h = el.offsetHeight;
            if (h > window.innerHeight * 0.3) {
                expandHomeOverlay();
            } else {
                collapseHomeOverlay();
            }
        });
    }
    // Start collapsed
    collapseHomeOverlay();
}

function expandHomeOverlay() {
    _hoExpanded = true;
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
    el.style.maxHeight = '75vh';
    el.classList.add('expanded');
    // Fade out the nearest card, show the full list
    const nearest = el.querySelector('.home-nearest-card');
    const list = el.querySelector('.home-overlay-list');
    if (nearest) nearest.style.opacity = '0';
    if (list) { list.style.opacity = '1'; list.style.pointerEvents = 'auto'; }
    const hint = document.getElementById('ho-expand-hint');
    if (hint) hint.textContent = '▼';
}

function collapseHomeOverlay() {
    _hoExpanded = false;
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
    el.style.maxHeight = '220px';
    el.classList.remove('expanded');
    // Show nearest card, fade the full list
    const nearest = el.querySelector('.home-nearest-card');
    const list = el.querySelector('.home-overlay-list');
    if (nearest) nearest.style.opacity = '1';
    if (list) { list.style.opacity = '0.3'; list.style.pointerEvents = 'none'; }
    const hint = document.getElementById('ho-expand-hint');
    if (hint) hint.textContent = '▲';
}

function renderHomeFlightOverlay(upcoming) {
    const countEl = document.getElementById('home-overlay-count');
    const overlayEl = document.getElementById('home-flights-overlay');
    const nearestEl = document.getElementById('home-nearest-card');
    const listEl = document.getElementById('home-overlay-list');
    if (!countEl || !overlayEl || !nearestEl || !listEl) return;

    const sorted = upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || ''));
    countEl.textContent = sorted.length;

    if (sorted.length === 0) {
        nearestEl.innerHTML = `<div class="home-overlay-empty">✈️ ${t('emptyTrips')}</div>`;
        listEl.innerHTML = '';
        initHomeOverlayDrag();
        return;
    }

    // Determine nearest flight(s) — single or connected group
    const first = sorted[0];
    let nearestFlights;
    if (first.connected_group) {
        nearestFlights = sorted.filter(f => f.connected_group === first.connected_group);
    } else {
        nearestFlights = [first];
    }

    // Render nearest card (floating)
    nearestEl.innerHTML = nearestFlights.map(f => renderHomeCard(f)).join('');

    // Highlight nearest route on map
    const nearestIds = nearestFlights.map(f => f.id);
    highlightRouteForSlide(nearestIds);

    // Render full list (same format as flights page, grouped by date)
    const grouped = groupConnectedFlights(sorted);
    const dateGroups = {};
    grouped.forEach(item => {
        const date = item.isGroup ? item.flights[0].date : item.date;
        if (!dateGroups[date]) dateGroups[date] = [];
        dateGroups[date].push(item);
    });
    const sortedDates = Object.keys(dateGroups).sort((a, b) => a.localeCompare(b));
    let html = '';
    sortedDates.forEach(date => {
        html += `<div class="flights-date-header">${formatDate(date)}</div>`;
        html += dateGroups[date].map(item => {
            if (item.isGroup) {
                return `<div class="connected-group"><div class="connected-group-header"><span class="connected-badge">🔗 ${t('connectedFlight')}</span></div>${item.flights.map(f => renderHomeCard(f)).join('')}</div>`;
            }
            return renderHomeCard(item);
        }).join('');
    });
    listEl.innerHTML = html;

    initHomeOverlayDrag();
}

/** Home card: reuses flight-card styling with date omitted */
function renderHomeCard(flight) {
    const depAirport = flight.dep_airport || {};
    const arrAirport = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};

    let duration = '';
    if (flight.dep_time && flight.arr_time) {
        const dep = new Date(`2000-01-01 ${flight.dep_time}`);
        let arr = new Date(`2000-01-01 ${flight.arr_time}`);
        if (arr < dep) arr.setDate(arr.getDate() + 1);
        const diff = (arr - dep) / 1000 / 60;
        duration = `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
    }

    const statusClass = statusInfo.status === 'completed' ? 'completed' : statusInfo.status === 'checkin_open' ? 'checkin_open' : statusInfo.status === 'boarding' ? 'boarding' : 'upcoming';
    const depTerminal = flight.dep_terminal ? `<span class="terminal-tag">T${flight.dep_terminal}</span>` : '';
    const arrTerminal = flight.arr_terminal ? `<span class="terminal-tag">T${flight.arr_terminal}</span>` : '';
    const logo = getAirlineLogoHtml(flight.flight_no);

    return `<div class="flight-card" onclick="showFlightDetail('${flight.id}')">
        <div class="flight-card-header"><div class="flight-info">${logo}<span class="flight-no">${flight.flight_no}</span></div><span class="flight-status ${statusClass}">${getStatusText(statusInfo)}</span></div>
        <div class="flight-route">
            <div class="route-point departure"><div class="airport-code">${flight.departure} ${depTerminal}</div><div class="airport-city">${getAirportCity(depAirport)}</div><div class="route-time">${flight.dep_time}</div></div>
            <div class="route-line"><div class="route-line-graphic"></div><div class="route-duration">${duration}</div><div class="route-distance">${(flight.distance || 0).toLocaleString()} km</div></div>
            <div class="route-point arrival"><div class="airport-code">${flight.arrival} ${arrTerminal}</div><div class="airport-city">${getAirportCity(arrAirport)}</div><div class="route-time">${flight.arr_time}</div></div>
        </div>
        ${statusInfo.countdown ? `<div class="flight-countdown">${renderCountdown(statusInfo.countdown)}</div>` : ''}
    </div>`;
}

// ==================== 航线高亮 ====================
function highlightRouteForSlide(targetIds) {
    if (!homeMap || Object.keys(homeRoutesByFlight).length === 0) return;

    Object.entries(homeRoutesByFlight).forEach(([id, layers]) => {
        const isTarget = targetIds.includes(id);
        layers.forEach((l, i) => {
            if (l.setStyle) {
                if (isTarget) {
                    if (i % 2 === 0) l.setStyle({ color: '#3b82f6', weight: 5, opacity: 0.5 });
                    else l.setStyle({ color: '#60a5fa', weight: 3, opacity: 1 });
                } else {
                    if (i % 2 === 0) l.setStyle({ opacity: 0.08, weight: 3 });
                    else l.setStyle({ opacity: 0.15, weight: 1.5 });
                }
            }
        });
    });

    homeArcLayers.forEach(l => {
        if (l instanceof L.CircleMarker && l.setStyle) {
            l.setStyle({ fillOpacity: 0.7, opacity: 0.7 });
        }
    });
}

// ==================== 行程地图 (全功能筛选) ====================
function initFlightsMap() {
    if (fmapInited) {
        setTimeout(() => fmap.invalidateSize(), 100);
        return;
    }
    fmap = L.map('flights-map', {
        center: [35, 105],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false
    });
    const theme = localStorage.getItem('skytrace-theme') || 'dark';
    const tileUrl = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    fmapTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(fmap);
    L.control.zoom({ position: 'bottomright' }).addTo(fmap);
    fmapInited = true;

    // 初始化筛选控件事件
    document.querySelectorAll('.fmap-pill[data-fmap-status]').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.fmap-pill[data-fmap-status]').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            fmapStatusFilter = pill.dataset.fmapStatus;
            applyFlightsMapFilter();
        });
    });

    // 初始化年份选择
    renderFmapYearPills();
    applyFlightsMapFilter();
}

function renderFmapYearPills() {
    const container = document.getElementById('fmap-year-pills');
    if (!container) return;
    const years = [...new Set(flights.map(f => f.date?.substring(0, 4)).filter(Boolean))].sort().reverse();
    let html = `<button class="fmap-year-pill active" data-fmap-year="all">${t('filterAll')}</button>`;
    years.forEach(y => {
        html += `<button class="fmap-year-pill" data-fmap-year="${y}">${y}</button>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.fmap-year-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            container.querySelectorAll('.fmap-year-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            applyFlightsMapFilter();
        });
    });
}

function applyFlightsMapFilter() {
    if (!fmap) return;
    const startDate = document.getElementById('fmap-start')?.value || '';
    const endDate = document.getElementById('fmap-end')?.value || '';
    const activeYearPill = document.querySelector('.fmap-year-pill.active');
    const year = activeYearPill?.dataset.fmapYear || 'all';

    fmapFilteredFlights = flights.filter(f => {
        // Status filter
        if (fmapStatusFilter === 'upcoming' && f.status_info?.status === 'completed') return false;
        if (fmapStatusFilter === 'completed' && f.status_info?.status !== 'completed') return false;
        // Year filter
        if (year !== 'all' && !f.date?.startsWith(year)) return false;
        // Date range
        if (startDate && f.date < startDate) return false;
        if (endDate && f.date > endDate) return false;
        return true;
    });

    renderFlightsMapRoutes();
    updateFlightsMapStats();
}

function resetFlightsMapFilter() {
    document.getElementById('fmap-start').value = '';
    document.getElementById('fmap-end').value = '';
    // Reset year to all
    document.querySelectorAll('.fmap-year-pill').forEach(p => p.classList.remove('active'));
    const allPill = document.querySelector('.fmap-year-pill[data-fmap-year="all"]');
    if (allPill) allPill.classList.add('active');
    // Reset status to all
    fmapStatusFilter = 'all';
    document.querySelectorAll('.fmap-pill[data-fmap-status]').forEach(p => p.classList.remove('active'));
    const allStatus = document.querySelector('.fmap-pill[data-fmap-status="all"]');
    if (allStatus) allStatus.classList.add('active');
    applyFlightsMapFilter();
}

let _fmapFilterVisible = false;
function toggleFmapFilter() {
    _fmapFilterVisible = !_fmapFilterVisible;
    const bar = document.getElementById('fmap-filter-bar');
    const btn = document.getElementById('fmap-toggle-filter');
    if (bar) bar.classList.toggle('hidden', !_fmapFilterVisible);
    if (btn) btn.textContent = _fmapFilterVisible ? t('fmapHideFilter') : t('fmapShowFilter');
}

function renderFlightsMapRoutes() {
    fmapArcLayers.forEach(l => fmap.removeLayer(l));
    fmapArcLayers = [];
    const visitedAirports = new Set();

    fmapFilteredFlights.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;
        if (!dep || !arr || !dep.lat || !arr.lat) return;
        visitedAirports.add(flight.departure);
        visitedAirports.add(flight.arrival);

        const isCompleted = flight.status_info?.status === 'completed';
        const color = isCompleted ? '#64748b' : '#60a5fa';
        const glowColor = isCompleted ? '#475569' : '#3b82f6';

        const generator = new arc.GreatCircle({ x: dep.lon, y: dep.lat }, { x: arr.lon, y: arr.lat });
        const arcLine = generator.Arc(50, { offset: 10 });
        arcLine.geometries.forEach(geo => {
            const coords = geo.coords.map(c => [c[1], c[0]]);
            fmapArcLayers.push(L.polyline(coords, { color: glowColor, weight: 4, opacity: 0.3 }).addTo(fmap));
            fmapArcLayers.push(L.polyline(coords, { color: color, weight: 2, opacity: 0.8 }).addTo(fmap));
        });
    });

    visitedAirports.forEach(code => {
        const airport = airports[code];
        if (!airport) return;
        const marker = L.circleMarker([airport.lat, airport.lon], {
            radius: 6, fillColor: '#3b82f6', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(fmap);
        marker.bindPopup(`<div style="text-align:center;padding:5px;"><div style="font-size:18px;font-weight:bold;color:#3b82f6;">${code}</div><div style="font-size:13px;color:#666;margin-top:4px;">${getAirportCity(airports[code])} · ${getAirportName(airports[code])}</div></div>`, { className: 'airport-popup' });
        fmapArcLayers.push(marker);
    });

    if (fmapArcLayers.length > 0) {
        fmap.fitBounds(L.featureGroup(fmapArcLayers).getBounds(), { padding: [50, 50] });
    }
}

function updateFlightsMapStats() {
    let totalDistance = 0;
    const visitedAirports = new Set();
    fmapFilteredFlights.forEach(f => {
        totalDistance += f.distance || 0;
        visitedAirports.add(f.departure);
        visitedAirports.add(f.arrival);
    });
    document.getElementById('fmap-stat-flights').textContent = fmapFilteredFlights.length;
    document.getElementById('fmap-stat-distance').textContent = totalDistance.toLocaleString();
    document.getElementById('fmap-stat-airports').textContent = visitedAirports.size;
}

// ==================== 飞行中动画 (共用) ====================
function renderAnimatedFlightOnMap(mapInstance, layersArray, flightList) {
    const inFlightList = flightList.filter(f => f.status_info?.status === 'in_flight');
    if (inFlightList.length === 0) return;

    inFlightList.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;
        if (!dep?.lat || !arr?.lat) return;
        const progress = (flight.status_info?.progress || 0) / 100;
        const generator = new arc.GreatCircle({ x: dep.lon, y: dep.lat }, { x: arr.lon, y: arr.lat });
        const arcLine = generator.Arc(100, { offset: 10 });
        const coords = arcLine.geometries[0]?.coords || [];
        if (coords.length === 0) return;

        const idx = Math.min(Math.floor(progress * coords.length), coords.length - 1);
        const pos = coords[idx];
        const nextIdx = Math.min(idx + 1, coords.length - 1);
        const angle = Math.atan2(coords[nextIdx][0] - pos[0], coords[nextIdx][1] - pos[1]) * 180 / Math.PI;

        const planeIcon = L.divIcon({
            html: `<div class="animated-plane" style="transform:rotate(${angle}deg)">✈️</div>`,
            className: 'plane-icon-wrapper', iconSize: [30, 30], iconAnchor: [15, 15]
        });
        const marker = L.marker([pos[1], pos[0]], { icon: planeIcon }).addTo(mapInstance);
        marker.bindPopup(`<div style="text-align:center;padding:5px;"><div style="font-size:16px;font-weight:bold;color:#3b82f6;">${flight.flight_no}</div><div style="font-size:13px;color:#666;">${flight.departure} → ${flight.arrival}</div></div>`);
        layersArray.push(marker);

        if (idx < coords.length - 1) {
            layersArray.push(L.polyline(coords.slice(idx).map(c => [c[1], c[0]]), { color: '#f59e0b', weight: 2, opacity: 0.6, dashArray: '8, 8' }).addTo(mapInstance));
        }
        if (idx > 0) {
            layersArray.push(L.polyline(coords.slice(0, idx + 1).map(c => [c[1], c[0]]), { color: '#10b981', weight: 3, opacity: 0.9 }).addTo(mapInstance));
        }
    });
}

// ==================== 数据加载 ====================
async function loadAirports() {
    try { airports = await (await fetch('/api/airports')).json(); } catch (e) { console.error('加载机场数据失败:', e); }
}
async function loadAirlines() {
    try { airlines = await (await fetch('/api/airlines')).json(); } catch (e) { console.error('加载航空公司数据失败:', e); }
}
async function loadFlights() {
    try {
        flights = await (await fetch('/api/flights')).json();
        filteredFlights = [...flights];
        try { renderFlightsList(); } catch (e) { console.error('[SkyTrace] renderFlightsList failed:', e); }
        try { renderHomeRoutes(); } catch (e) { console.error('[SkyTrace] renderHomeRoutes failed:', e); }
        try { initTimeFilterDefaults(); } catch (e) { console.error('[SkyTrace] initTimeFilterDefaults failed:', e); }
        // 如果行程地图已初始化，刷新
        if (fmapInited) {
            renderFmapYearPills();
            applyFlightsMapFilter();
        }
    } catch (e) { console.error('加载航班数据失败:', e); }
}

function initTimeFilterDefaults() {
    if (flights.length === 0) return;
    const dates = flights.map(f => f.date).sort();
    ['filter-start-date', 'filter-end-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.min = dates[0];
    });
}

// ==================== 统计加载 ====================
async function loadStats(year) {
    try {
        if (year !== undefined) currentStatsYear = year;
        const yearParam = currentStatsYear && currentStatsYear !== 'all' ? `?year=${currentStatsYear}` : '';
        const stats = await (await fetch('/api/stats' + yearParam)).json();
        cachedStatsData = stats;

        document.getElementById('total-flights').textContent = stats.total_flights;
        document.getElementById('total-distance').textContent = stats.total_distance.toLocaleString();
        document.getElementById('total-hours').textContent = stats.total_hours;
        document.getElementById('visited-airports').textContent = stats.visited_airports;
        document.getElementById('visited-countries').textContent = stats.visited_countries;
        document.getElementById('earth-rounds').textContent = (stats.total_distance / 40075).toFixed(2);
        renderYearSelector(stats.available_years);
        renderFunStats(stats.fun_stats, stats.top_routes, stats.top_airlines);
    } catch (e) { console.error('加载统计失败:', e); }
}

function renderYearSelector(years) {
    const container = document.getElementById('year-selector');
    if (!container || !years) return;
    let html = `<button class="year-pill ${currentStatsYear === 'all' ? 'active' : ''}" onclick="loadStats('all')">${t('filterAll')}</button>`;
    years.forEach(y => {
        html += `<button class="year-pill ${currentStatsYear === y ? 'active' : ''}" onclick="loadStats('${y}')">${y}</button>`;
    });
    container.innerHTML = html;
}

function renderFunStats(fun, topRoutes, topAirlines) {
    if (!fun) return;
    const grid = document.getElementById('fun-stats-grid');
    const section = document.getElementById('fun-stats-section');
    if (!grid) return;
    let cards = '';

    // 座位偏好
    const sp = fun.seat_preference;
    const totalSeats = sp.window + sp.aisle + sp.middle;
    if (totalSeats > 0) {
        const pref = sp.window >= sp.aisle && sp.window >= sp.middle ? 'window' : sp.aisle >= sp.middle ? 'aisle' : 'middle';
        const prefPct = Math.round((sp[pref] / totalSeats) * 100);
        const prefIcon = pref === 'window' ? '🪟' : pref === 'aisle' ? '🚶' : '💺';
        cards += `<div class="fun-card"><div class="fun-card-icon">${prefIcon}</div><div class="fun-card-value">${t('seatPref_' + pref)}</div><div class="fun-card-label">${t('favoriteSeat')}</div><div class="fun-card-bar"><div class="bar-segment bar-window" style="width:${Math.round(sp.window/totalSeats*100)}%"></div><div class="bar-segment bar-aisle" style="width:${Math.round(sp.aisle/totalSeats*100)}%"></div><div class="bar-segment bar-middle" style="width:${Math.round(sp.middle/totalSeats*100)}%"></div></div><div class="fun-card-detail">${prefPct}%</div></div>`;
    }

    // 舱位分布
    const cd = fun.cabin_distribution;
    if (cd && Object.keys(cd).length > 0) {
        const maxCabin = Object.entries(cd).sort((a, b) => b[1] - a[1])[0];
        const cabinIcon = maxCabin[0] === 'business' ? '💼' : maxCabin[0] === 'first' ? '👑' : '💺';
        cards += `<div class="fun-card"><div class="fun-card-icon">${cabinIcon}</div><div class="fun-card-value">${getCabinText(maxCabin[0])}</div><div class="fun-card-label">${t('favoriteCabin')}</div><div class="fun-card-detail">${maxCabin[1]} ${t('flights')}</div></div>`;
    }

    // 最早/最晚/最长航班
    if (fun.earliest_flight) cards += `<div class="fun-card"><div class="fun-card-icon">🌅</div><div class="fun-card-value">${fun.earliest_flight.dep_time}</div><div class="fun-card-label">${t('earliestFlight')}</div><div class="fun-card-detail">${fun.earliest_flight.flight_no} ${fun.earliest_flight.route}</div></div>`;
    if (fun.latest_flight) cards += `<div class="fun-card"><div class="fun-card-icon">🌙</div><div class="fun-card-value">${fun.latest_flight.dep_time}</div><div class="fun-card-label">${t('latestFlight')}</div><div class="fun-card-detail">${fun.latest_flight.flight_no} ${fun.latest_flight.route}</div></div>`;
    if (fun.longest_flight) cards += `<div class="fun-card"><div class="fun-card-icon">🛤️</div><div class="fun-card-value">${fun.longest_flight.distance.toLocaleString()} km</div><div class="fun-card-label">${t('longestFlight')}</div><div class="fun-card-detail">${fun.longest_flight.flight_no} ${fun.longest_flight.route}</div></div>`;

    // 平均数据
    cards += `<div class="fun-card"><div class="fun-card-icon">📏</div><div class="fun-card-value">${fun.avg_distance.toLocaleString()} km</div><div class="fun-card-label">${t('avgDistance')}</div><div class="fun-card-detail">${t('avgHours')}: ${fun.avg_hours}h</div></div>`;

    // 星期分布 (可展开)
    const wd = fun.weekday_distribution;
    if (wd && wd.some(v => v > 0)) {
        const maxWd = wd.indexOf(Math.max(...wd));
        const wdNames = [t('wdMon'), t('wdTue'), t('wdWed'), t('wdThu'), t('wdFri'), t('wdSat'), t('wdSun')];
        const maxWdVal = Math.max(...wd);
        cards += `<div class="fun-card fun-card-wide fun-card-expandable" onclick="toggleWeekdayDetail(this)"><div class="fun-card-icon">📅</div><div class="fun-card-value">${wdNames[maxWd]}</div><div class="fun-card-label">${t('busiestDay')} <span class="expand-hint">▼</span></div><div class="weekday-bars">${wd.map((v, i) => `<div class="wd-bar-col"><div class="wd-bar" style="height:${maxWdVal ? Math.round(v / maxWdVal * 40) : 0}px" title="${wdNames[i]}: ${v}"></div><div class="wd-label">${wdNames[i].charAt(0)}</div></div>`).join('')}</div><div class="fun-card-expand-detail" style="display:none">${wd.map((v, i) => {
            if (v === 0) return '';
            const dayFlights = fun.weekday_flights?.[i] || [];
            return `<div class="expand-day-section"><div class="expand-day-title">${wdNames[i]} — ${v} ${t('flights')}</div><div class="expand-day-flights">${dayFlights.slice(0, 5).map(f => `<span class="expand-flight-tag">${f.flight_no} ${f.route} (${f.date})</span>`).join('')}${dayFlights.length > 5 ? `<span class="expand-more">+${dayFlights.length - 5}</span>` : ''}</div></div>`;
        }).join('')}</div></div>`;
    }

    grid.innerHTML = cards;
    if (cards) section.style.display = 'block';
    renderRankings(topRoutes, topAirlines);
    renderMonthlyChart(fun.month_distribution);
}

function renderRankings(routes, airlinesData) {
    const routesList = document.getElementById('top-routes-list');
    const airlinesList = document.getElementById('top-airlines-list');
    if (!routesList || !airlinesList) return;
    if (routes?.length > 0) {
        const maxR = routes[0].count;
        routesList.innerHTML = routes.map((r, i) => `<div class="ranking-item"><span class="ranking-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span><span class="ranking-name">${r.route}</span><div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${Math.round(r.count/maxR*100)}%"></div></div><span class="ranking-count">${r.count}</span></div>`).join('');
    }
    if (airlinesData?.length > 0) {
        const maxA = airlinesData[0].count;
        airlinesList.innerHTML = airlinesData.map((a, i) => `<div class="ranking-item"><span class="ranking-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span><span class="ranking-name">${typeof translateAirline === 'function' ? translateAirline(a.airline) : a.airline}</span><div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${Math.round(a.count/maxA*100)}%"></div></div><span class="ranking-count">${a.count}</span></div>`).join('');
    }
}

let _currentChartMonth = null;
let _cachedMonthData = null;

function renderMonthlyChart(monthData) {
    const container = document.getElementById('monthly-chart');
    const selectorEl = document.getElementById('month-selector');
    if (!container || !monthData) return;
    _cachedMonthData = monthData;

    const months = Object.keys(monthData).sort();
    if (months.length === 0) { container.innerHTML = ''; if (selectorEl) selectorEl.innerHTML = ''; return; }

    // Default to current month if available, or the last month with data
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!_currentChartMonth || !months.includes(_currentChartMonth)) {
        _currentChartMonth = months.includes(currentYM) ? currentYM : months[months.length - 1];
    }

    // Render month selector nav
    if (selectorEl) {
        const idx = months.indexOf(_currentChartMonth);
        const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const mIdx = parseInt(_currentChartMonth.substring(5)) - 1;
        const year = _currentChartMonth.substring(0, 4);
        const label = `${year} ${monthNames[mIdx]}`;
        selectorEl.innerHTML = `
            <button class="month-nav-btn" ${idx <= 0 ? 'disabled' : ''} onclick="changeChartMonth(-1)">◀</button>
            <span class="month-nav-label">${label}</span>
            <button class="month-nav-btn" ${idx >= months.length - 1 ? 'disabled' : ''} onclick="changeChartMonth(1)">▶</button>
        `;
    }

    // Get day-level data for this month
    const dayFlights = cachedStatsData?.fun_stats?.day_flights || {};
    const ym = _currentChartMonth;
    const yearNum = parseInt(ym.substring(0, 4));
    const monNum = parseInt(ym.substring(5));
    const daysInMonth = new Date(yearNum, monNum, 0).getDate();

    // Build day counts
    const dayCounts = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dayKey = `${ym}-${String(d).padStart(2, '0')}`;
        const flightsArr = dayFlights[dayKey] || [];
        dayCounts.push({ day: d, count: flightsArr.length, flights: flightsArr, key: dayKey });
    }

    const max = Math.max(...dayCounts.map(d => d.count), 1);

    container.innerHTML = dayCounts.map(d => {
        const val = d.count;
        return `<div class="month-bar-col${val > 0 ? ' month-bar-clickable' : ''}" ${val > 0 ? `onclick="toggleMonthDetail(this, '${d.key}')"` : ''}>
            <div class="month-bar-value">${val || ''}</div>
            <div class="month-bar" style="height:${max ? Math.round(val / max * 100) : 0}px"></div>
            <div class="month-bar-label">${d.day}</div>
            ${val > 0 ? `<div class="month-detail-popup" style="display:none">${d.flights.slice(0, 8).map(f => `<div class="month-detail-item">${f.flight_no} ${f.route} <small>${f.date}</small></div>`).join('')}</div>` : ''}
        </div>`;
    }).join('');
}

function changeChartMonth(dir) {
    if (!_cachedMonthData) return;
    const months = Object.keys(_cachedMonthData).sort();
    const idx = months.indexOf(_currentChartMonth);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= months.length) return;
    _currentChartMonth = months[newIdx];
    renderMonthlyChart(_cachedMonthData);
}

// ==================== 时间筛选 (列表用) ====================
let timeFilterExpanded = false;
function toggleTimeFilter() {
    timeFilterExpanded = !timeFilterExpanded;
    const body = document.getElementById('time-filter-body');
    const toggle = document.getElementById('time-filter-toggle');
    if (body) {
        body.style.maxHeight = timeFilterExpanded ? body.scrollHeight + 'px' : '0';
        body.style.opacity = timeFilterExpanded ? '1' : '0';
    }
    if (toggle) toggle.classList.toggle('expanded', timeFilterExpanded);
}
function applyTimeFilter() {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    filteredFlights = flights.filter(f => {
        if (startDate && f.date < startDate) return false;
        if (endDate && f.date > endDate) return false;
        return true;
    });
    renderFlightsList(currentStatusFilter);
}
function resetTimeFilter() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    filteredFlights = [...flights];
    renderFlightsList(currentStatusFilter);
}

// ==================== 航班列表渲染 ====================
function renderFlightsList(filter = currentStatusFilter) {
    currentStatusFilter = filter;
    const container = document.getElementById('flights-list');
    if (!container) return;
    let displayFlights = filteredFlights;
    const todayStr = getLocalTodayStr();
    if (filter === 'upcoming') {
        displayFlights = filteredFlights.filter(f => f.status_info?.status !== 'completed' && f.date >= todayStr);
        displayFlights.sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || ''));
    } else if (filter === 'completed') {
        displayFlights = filteredFlights.filter(f => f.status_info?.status === 'completed');
        displayFlights.sort((a, b) => b.date.localeCompare(a.date) || (b.dep_time || '').localeCompare(a.dep_time || ''));
    } else {
        displayFlights = [...filteredFlights].sort((a, b) => b.date.localeCompare(a.date) || (b.dep_time || '').localeCompare(a.dep_time || ''));
    }

    const groupedFlights = groupConnectedFlights(displayFlights);

    if (displayFlights.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✈️</div><div class="empty-state-text">${t('emptyTrips')}</div><div class="empty-state-hint">${t('emptyHint')}</div></div>`;
        return;
    }

    // Group by date
    const dateGroups = {};
    groupedFlights.forEach(item => {
        const date = item.isGroup ? item.flights[0].date : item.date;
        if (!dateGroups[date]) dateGroups[date] = [];
        dateGroups[date].push(item);
    });

    const sortedDates = Object.keys(dateGroups).sort((a, b) => {
        if (filter === 'upcoming') return a.localeCompare(b);
        return b.localeCompare(a);
    });

    let html = '';
    sortedDates.forEach(date => {
        html += `<div class="flights-date-header">${formatDate(date)}</div>`;
        html += dateGroups[date].map(item => {
            if (item.isGroup) {
                return `<div class="connected-group"><div class="connected-group-header"><span class="connected-badge">🔗 ${t('connectedFlight')}</span><button class="btn-disconnect" onclick="event.stopPropagation();disconnectGroup('${item.groupId}')" title="${t('disconnect')}">✕</button></div>${item.flights.map(f => renderFlightCard(f)).join('')}</div>`;
            }
            return renderFlightCard(item);
        }).join('');
    });

    container.innerHTML = html;
}

function renderFlightCard(flight) {
    const depAirport = flight.dep_airport || {};
    const arrAirport = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};

    let duration = '';
    if (flight.dep_time && flight.arr_time) {
        const dep = new Date(`2000-01-01 ${flight.dep_time}`);
        let arr = new Date(`2000-01-01 ${flight.arr_time}`);
        if (arr < dep) arr.setDate(arr.getDate() + 1);
        const diff = (arr - dep) / 1000 / 60;
        duration = `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
    }

    const statusClass = statusInfo.status === 'completed' ? 'completed' : statusInfo.status === 'checkin_open' ? 'checkin_open' : statusInfo.status === 'boarding' ? 'boarding' : 'upcoming';
    const isSelected = selectedConnectIds.has(flight.id);
    const depTerminal = flight.dep_terminal ? `<span class="terminal-tag">T${flight.dep_terminal}</span>` : '';
    const arrTerminal = flight.arr_terminal ? `<span class="terminal-tag">T${flight.arr_terminal}</span>` : '';
    const showGate = statusInfo.status !== 'completed';
    const depGate = showGate ? `<div class="gate-info">${t('gateLabel')}: ${flight.dep_gate || t('gatePending')}</div>` : '';
    const logo = getAirlineLogoHtml(flight.flight_no);

    return `<div class="flight-card ${isSelected ? 'selected-connect' : ''} ${connectMode ? 'connect-mode' : ''}" onclick="${connectMode ? `toggleConnectSelect('${flight.id}')` : `showFlightDetail('${flight.id}')`}">
        ${connectMode ? `<div class="connect-checkbox">${isSelected ? '☑' : '☐'}</div>` : ''}
        <div class="flight-card-body">
            <div class="flight-card-header"><div class="flight-info">${logo}<span class="flight-no">${flight.flight_no}</span></div><span class="flight-status ${statusClass}">${getStatusText(statusInfo)}</span></div>
            <div class="flight-route">
                <div class="route-point departure"><div class="airport-code">${flight.departure} ${depTerminal}</div><div class="airport-city">${getAirportCity(depAirport)}</div><div class="route-time">${flight.dep_time}</div>${depGate}</div>
                <div class="route-line"><div class="route-line-graphic"></div><div class="route-duration">${duration}</div><div class="route-distance">${(flight.distance || 0).toLocaleString()} km</div></div>
                <div class="route-point arrival"><div class="airport-code">${flight.arrival} ${arrTerminal}</div><div class="airport-city">${getAirportCity(arrAirport)}</div><div class="route-time">${flight.arr_time}</div></div>
            </div>
            ${statusInfo.status === 'in_flight' ? `<div class="flight-progress-bar"><div class="fill" style="width:${statusInfo.progress || 0}%"></div></div>` : ''}
            ${statusInfo.countdown ? `<div class="flight-countdown">${renderCountdown(statusInfo.countdown)}</div>` : ''}
        </div>
    </div>`;
}

// ==================== 标签切换 ====================
function initTabs() {
    // 主导航标签 + 移动端底部导航
    const allNavTabs = [...document.querySelectorAll('.nav-tab'), ...document.querySelectorAll('.mobile-nav-tab')];
    allNavTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mobile-nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            // 同步高亮
            allNavTabs.filter(t => t.dataset.tab === tab.dataset.tab).forEach(t => t.classList.add('active'));
            document.getElementById(tab.dataset.tab + '-view').classList.add('active');

            if (tab.dataset.tab === 'home') {
                setTimeout(() => { if (homeMap) homeMap.invalidateSize(); }, 100);
                document.querySelector('.home-flights-overlay')?.style.setProperty('display', 'flex');
            } else {
                document.querySelector('.home-flights-overlay')?.style.setProperty('display', 'none');
            }
            if (tab.dataset.tab === 'calendar') initCalendar();
            // Show FAB only on flights tab with list subtab
            const fab = document.querySelector('.btn-add-float');
            if (fab) {
                const isFlightsList = tab.dataset.tab === 'flights' && document.getElementById('flights-list-subview')?.classList.contains('active');
                fab.style.display = isFlightsList ? 'flex' : 'none';
            }
        });
    });

    // 行程子标签
    document.querySelectorAll('.flights-sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.flights-sub-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.flights-sub-view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            const subtab = tab.dataset.subtab;
            if (subtab === 'list') { document.getElementById('flights-list-subview').classList.add('active'); const fab = document.querySelector('.btn-add-float'); if (fab) fab.style.display = 'flex'; }
            else if (subtab === 'fmap') { document.getElementById('flights-map-subview').classList.add('active'); initFlightsMap(); const fab = document.querySelector('.btn-add-float'); if (fab) fab.style.display = 'none'; }
            else if (subtab === 'fstats') { document.getElementById('flights-stats-subview').classList.add('active'); loadStats(); const fab = document.querySelector('.btn-add-float'); if (fab) fab.style.display = 'none'; }
        });
    });

    // 列表筛选标签
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderFlightsList(tab.dataset.filter);
        });
    });
}

// ==================== 模态框 ====================
function openAddModal() {
    currentFlightId = null;
    document.getElementById('modal-title').textContent = t('addTripTitle');
    document.getElementById('flight-form').reset();
    document.getElementById('flight-id').value = '';
    document.getElementById('flight-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('flight-modal').classList.add('active');
}
function closeModal() {
    document.getElementById('flight-modal').classList.remove('active');
    document.getElementById('dep-suggestions').classList.remove('active');
    document.getElementById('arr-suggestions').classList.remove('active');
}
function closeDetailModal() { document.getElementById('detail-modal').classList.remove('active'); }

// ==================== 航班详情 ====================
function showFlightDetail(flightId) {
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;
    currentFlightId = flightId;
    const depAirport = flight.dep_airport || {};
    const arrAirport = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};
    const progress = statusInfo.progress || 0;
    const isActive = statusInfo.status === 'in_flight';

    document.getElementById('detail-content').innerHTML = `
        <div class="detail-route">
            <div class="detail-point departure">
                <div class="detail-code">${flight.departure}</div><div class="detail-city">${getAirportCity(depAirport)}</div><div class="detail-time">${flight.dep_time}</div>
                ${flight.dep_terminal ? `<div class="detail-terminal">T${flight.dep_terminal}</div>` : ''}
                ${flight.dep_gate ? `<div class="detail-gate">${t('gateLabel')}: ${flight.dep_gate}</div>` : (statusInfo.status !== 'completed' ? `<div class="detail-gate pending">${t('gateLabel')}: ${t('gatePending')}</div>` : '')}
            </div>
            <div class="detail-arrow">${isActive ? `<div class="flight-progress-mini"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div><div class="progress-plane" style="left:${progress}%">✈</div></div><div class="progress-text">${renderCountdown(statusInfo.countdown)}</div></div>` : '✈️ →'}</div>
            <div class="detail-point arrival">
                <div class="detail-code">${flight.arrival}</div><div class="detail-city">${getAirportCity(arrAirport)}</div><div class="detail-time">${flight.arr_time}</div>
                ${flight.arr_terminal ? `<div class="detail-terminal">T${flight.arr_terminal}</div>` : ''}
                ${flight.arr_gate ? `<div class="detail-gate">${t('gateLabel')}: ${flight.arr_gate}</div>` : ''}
            </div>
        </div>
        <div class="detail-info-grid">
            <div class="detail-info-item"><div class="detail-info-label">${t('flightNoLabel')}</div><div class="detail-info-value">${flight.flight_no}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('dateLabel')}</div><div class="detail-info-value">${formatDate(flight.date)}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('airlineLabel')}</div><div class="detail-info-value">${typeof translateAirline === 'function' ? translateAirline(flight.airline) : (flight.airline || '-')}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('aircraftLabel')}</div><div class="detail-info-value">${flight.aircraft || '-'}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('seatLabel')}</div><div class="detail-info-value">${flight.seat || '-'}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('cabinLabel')}</div><div class="detail-info-value">${getCabinText(flight.class)}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('distanceLabel')}</div><div class="detail-info-value">${(flight.distance || 0).toLocaleString()} km</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('statusLabel')}</div><div class="detail-info-value">${getStatusText(statusInfo)}</div></div>
        </div>
        ${statusInfo.status !== 'completed' ? `<div class="detail-reminder"><div class="detail-reminder-title">${t('keyTimeline')}</div><div class="detail-reminder-item"><span>${t('checkinOpen')}</span><span>${formatDateTime(statusInfo.checkin_open)}</span></div><div class="detail-reminder-item"><span>${t('checkinClose')}</span><span>${formatDateTime(statusInfo.checkin_close)}</span></div><div class="detail-reminder-item"><span>${t('boardingStart')}</span><span>${formatDateTime(statusInfo.boarding_time)}</span></div></div>` : ''}
        ${flight.notes ? `<div style="margin-top:16px;padding:14px;background:var(--bg-card);border-radius:10px;"><div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${t('noteLabel')}</div><div style="font-size:14px;">${flight.notes}</div></div>` : ''}
        <div class="weather-container" id="detail-weather"></div>
    `;
    document.getElementById('detail-modal').classList.add('active');
    if (statusInfo.status !== 'completed') {
        loadFlightWeather(flight).then(html => { const el = document.getElementById('detail-weather'); if (el && html) el.innerHTML = html; });
    }
}

function editFlight() {
    const flight = flights.find(f => f.id === currentFlightId);
    if (!flight) return;
    closeDetailModal();
    document.getElementById('modal-title').textContent = t('editTripTitle');
    document.getElementById('flight-id').value = flight.id;
    document.getElementById('flight-no').value = flight.flight_no;
    document.getElementById('airline').value = flight.airline || '';
    document.getElementById('departure').value = flight.departure;
    document.getElementById('arrival').value = flight.arrival;
    document.getElementById('flight-date').value = flight.date;
    document.getElementById('dep-time').value = flight.dep_time;
    document.getElementById('arr-time').value = flight.arr_time;
    document.getElementById('aircraft').value = flight.aircraft || '';
    document.getElementById('dep-terminal').value = flight.dep_terminal || '';
    document.getElementById('arr-terminal').value = flight.arr_terminal || '';
    document.getElementById('dep-gate').value = flight.dep_gate || '';
    document.getElementById('arr-gate').value = flight.arr_gate || '';
    document.getElementById('seat').value = flight.seat || '';
    document.getElementById('cabin-class').value = flight.class || 'economy';
    document.getElementById('notes').value = flight.notes || '';
    document.getElementById('flight-modal').classList.add('active');
}

async function deleteFlight() {
    if (!currentFlightId) return;
    if (!confirm(t('confirmDelete'))) return;
    try { await fetch(`/api/flights/${currentFlightId}`, { method: 'DELETE' }); closeDetailModal(); loadFlights(); loadStats(); } catch (e) { alert(t('deleteFailed')); }
}

async function saveFlight(event) {
    event.preventDefault();
    const flightId = document.getElementById('flight-id').value;
    const flight = {
        flight_no: document.getElementById('flight-no').value.toUpperCase().replace(/[\s\-]/g, ''),
        airline: document.getElementById('airline').value,
        departure: document.getElementById('departure').value.toUpperCase(),
        arrival: document.getElementById('arrival').value.toUpperCase(),
        date: document.getElementById('flight-date').value,
        dep_time: document.getElementById('dep-time').value,
        arr_time: document.getElementById('arr-time').value,
        aircraft: document.getElementById('aircraft').value,
        dep_terminal: document.getElementById('dep-terminal').value,
        arr_terminal: document.getElementById('arr-terminal').value,
        dep_gate: document.getElementById('dep-gate').value,
        arr_gate: document.getElementById('arr-gate').value,
        seat: document.getElementById('seat').value.toUpperCase(),
        class: document.getElementById('cabin-class').value,
        notes: document.getElementById('notes').value,
        status: 'scheduled'
    };
    try {
        if (flightId) await fetch(`/api/flights/${flightId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flight) });
        else await fetch('/api/flights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flight) });
        closeModal(); loadFlights(); loadStats();
    } catch (e) { alert(t('saveFailed')); }
}

// ==================== 机场搜索 ====================
async function searchAirport(input, suggestionsId) {
    const query = input.value.trim();
    const suggestionsEl = document.getElementById(suggestionsId);
    if (query.length < 1) { suggestionsEl.classList.remove('active'); return; }
    try {
        const results = await (await fetch(`/api/airports/search?q=${encodeURIComponent(query)}`)).json();
        if (Object.keys(results).length === 0) { suggestionsEl.classList.remove('active'); return; }
        suggestionsEl.innerHTML = Object.entries(results).slice(0, 8).map(([code, info]) => `<div class="suggestion-item" onclick="selectAirport('${input.id}', '${code}', '${suggestionsId}')"><span class="suggestion-code">${code}</span><span class="suggestion-name">${getAirportCity(info)} - ${getAirportName(info)}</span></div>`).join('');
        suggestionsEl.classList.add('active');
    } catch (e) {}
}
function selectAirport(inputId, code, suggestionsId) {
    document.getElementById(inputId).value = code;
    document.getElementById(suggestionsId).classList.remove('active');
}
document.addEventListener('click', (e) => { if (!e.target.closest('.form-group')) document.querySelectorAll('.suggestions').forEach(el => el.classList.remove('active')); });

// ==================== 航班智能查询 ====================
let isLookingUp = false;
async function lookupFlight() {
    const flightNo = document.getElementById('flight-no').value.trim();
    const date = document.getElementById('flight-date').value;
    const statusEl = document.getElementById('lookup-status');
    const btnText = document.querySelector('.btn-lookup-text');
    const btnLoading = document.querySelector('.btn-lookup-loading');
    const btn = document.querySelector('.btn-lookup');
    if (!flightNo || flightNo.length < 3) { statusEl.textContent = ''; statusEl.className = 'lookup-status'; return; }
    if (!date) { statusEl.innerHTML = '⚠️ ' + (t('lookupNeedDate') || '请先选择出发日期'); statusEl.className = 'lookup-status info'; return; }
    if (isLookingUp) return;
    isLookingUp = true;
    btn.disabled = true; btnText.style.display = 'none'; btnLoading.style.display = 'inline-flex';
    statusEl.innerHTML = '<span class="lookup-loading-text">' + t('lookupQuerying') + '</span>';
    statusEl.className = 'lookup-status info';
    try {
        const result = await (await fetch(`/api/flight/lookup?flight_no=${encodeURIComponent(flightNo)}&date=${date}`)).json();
        if (result.success) {
            const fields = { 'airline': result.airline, 'departure': result.departure, 'arrival': result.arrival, 'dep-time': result.dep_time, 'arr-time': result.arr_time, 'aircraft': result.aircraft, 'dep-terminal': result.dep_terminal, 'arr-terminal': result.arr_terminal };
            for (const [id, value] of Object.entries(fields)) {
                if (value) { const el = document.getElementById(id); if (el) { el.value = value; el.classList.add('field-filled'); setTimeout(() => el.classList.remove('field-filled'), 800); } }
            }
            let sourceText = '', sourceClass = 'info';
            switch (result.source) {
                case 'api': sourceText = `✅ ${t('lookupApiSuccess')} (${result.api_source || 'API'})`; sourceClass = 'success'; break;
                case 'schedule': sourceText = '✅ ' + t('lookupScheduleSuccess'); sourceClass = 'success'; break;
                case 'history': sourceText = '✅ ' + t('lookupHistorySuccess'); sourceClass = 'success'; break;
                default:
                    if (result.airline) { sourceText = `ℹ️ ${t('lookupIdentified')} ${result.airline}`; if (!result.api_configured) sourceText += ` · <a href="#" onclick="closeModal();openSettings();return false;" class="setup-api-link">${t('lookupConfigApi')}</a>`; else sourceText += ' · ' + t('lookupApiNoResult'); }
                    else { sourceText = '⚠️ ' + t('lookupNotFound'); if (!result.api_configured) sourceText += ` · <a href="#" onclick="closeModal();openSettings();return false;" class="setup-api-link">${t('lookupConfigApiLink')}</a>`; }
            }
            statusEl.innerHTML = sourceText; statusEl.className = 'lookup-status ' + sourceClass;
        } else { statusEl.textContent = '❌ ' + (result.error || '查询失败'); statusEl.className = 'lookup-status error'; }
    } catch (e) { statusEl.textContent = '❌ ' + t('lookupFailed'); statusEl.className = 'lookup-status error'; }
    finally { isLookingUp = false; btn.disabled = false; btnText.style.display = 'inline'; btnLoading.style.display = 'none'; }
}

function _initFlightInput() {
    const flightNoInput = document.getElementById('flight-no');
    if (flightNoInput) {
        flightNoInput.addEventListener('input', (e) => {
            const value = e.target.value.toUpperCase().replace(/[\s\-]/g, '');
            e.target.value = value;
            const match = value.match(/^([A-Z0-9]{2})/);
            if (match && airlines[match[1]]) document.getElementById('airline').value = airlines[match[1]].name;
        });
        flightNoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.target.value.trim().length >= 3 && document.getElementById('flight-date').value) lookupFlight(); } });
    }
}

async function checkApiStatus() {
    try {
        const settings = await (await fetch('/api/settings')).json();
        const badge = document.getElementById('api-badge');
        if (badge && (settings.aviationstack_key_set || settings.airlabs_key_set || settings.aerodata_key_set)) {
            badge.style.display = 'inline'; badge.textContent = t('apiBadgeConnected'); badge.className = 'api-badge connected';
        }
    } catch (e) {}
}

// ==================== 设置管理 ====================
async function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
    updateSettingsLangButtons();
    updateSettingsThemeUI(document.documentElement.getAttribute('data-theme') || 'dark');
    try {
        const settings = await (await fetch('/api/settings')).json();
        document.getElementById('aviationstack-key').value = settings.aviationstack_key || '';
        document.getElementById('airlabs-key').value = settings.airlabs_key || '';
        document.getElementById('aerodata-key').value = settings.aerodata_key || '';
        updateApiStatusBadge('avstack', settings.aviationstack_key_set);
        updateApiStatusBadge('airlabs', settings.airlabs_key_set);
        updateApiStatusBadge('aerodata', settings.aerodata_key_set);
    } catch (e) {}
    try { const stats = await (await fetch('/api/cache/stats')).json(); document.getElementById('cache-count').textContent = stats.total_cached || 0; } catch (e) {}
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); }
function updateApiStatusBadge(prefix, isSet) {
    const el = document.getElementById(`${prefix}-status`);
    if (el) { el.textContent = isSet ? t('apiConfigured') : t('apiNotConfigured'); el.className = 'api-status ' + (isSet ? 'configured' : ''); }
}
async function saveSettings() {
    const settings = { aviationstack_key: document.getElementById('aviationstack-key').value.trim(), airlabs_key: document.getElementById('airlabs-key').value.trim(), aerodata_key: document.getElementById('aerodata-key').value.trim() };
    try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); closeSettings(); checkApiStatus(); } catch (e) { alert(t('settingsSaveFailed')); }
}
async function testApi(apiName) {
    const keyMap = { 'aviationstack': 'aviationstack-key', 'airlabs': 'airlabs-key', 'aerodata': 'aerodata-key' };
    const resultMap = { 'aviationstack': 'avstack-result', 'airlabs': 'airlabs-result', 'aerodata': 'aerodata-result' };
    const key = document.getElementById(keyMap[apiName]).value.trim();
    const resultEl = document.getElementById(resultMap[apiName]);
    if (!key) { resultEl.textContent = t('testEnterKey'); resultEl.className = 'api-test-result error'; return; }
    resultEl.textContent = t('testing'); resultEl.className = 'api-test-result info';
    try {
        const result = await (await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api: apiName, key }) })).json();
        resultEl.textContent = result.message; resultEl.className = 'api-test-result ' + (result.success ? 'success' : 'error');
    } catch (e) { resultEl.textContent = t('testFailed'); resultEl.className = 'api-test-result error'; }
}

// ==================== 工具函数 ====================
function getLocale() { return LANG_TAG[currentLang] || 'zh-CN'; }
function formatDate(dateStr) { return new Date(dateStr + 'T00:00:00').toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }); }
function formatDateTime(dateTimeStr) { if (!dateTimeStr) return '-'; return new Date(dateTimeStr).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function getAirportCity(a) { if (!a) return ''; const m = { zh: 'city', en: 'city_en', ja: 'city_ja', ko: 'city_ko', es: 'city_es' }; const f = m[currentLang]; let city = ''; if (f && a[f]) city = a[f]; else if (currentLang !== 'zh' && a.city_en) city = a.city_en; else city = a.city || a.city_en || ''; return city.replace(/[（(][^)）]*[)）]/g, '').trim(); }
function getAirportName(a) { if (!a) return ''; if (currentLang === 'zh') return a.name || a.name_en || ''; return a.name_en || a.name || ''; }
function renderCountdown(c) { if (!c) return ''; if (typeof c === 'string') return c; if (c.key) { const args = Array.isArray(c.args) ? c.args : (c.args != null ? [c.args] : []); return t(c.key, ...args); } return ''; }
function getStatusText(si) { if (!si?.status) return t('statusScheduled'); const m = { scheduled: 'statusScheduled', checkin_open: 'statusCheckin', boarding: 'statusBoarding', in_flight: 'statusInFlight', completed: 'statusCompleted' }; return t(m[si.status] || 'statusUnknown'); }
function getCabinText(v) { if (!v) return '-'; const m = { economy: 'cabinEconomy', premium_economy: 'cabinPremiumEconomy', business: 'cabinBusiness', first: 'cabinFirst', '经济舱': 'cabinEconomy', '超级经济舱': 'cabinPremiumEconomy', '公务舱': 'cabinBusiness', '头等舱': 'cabinFirst' }; return t(m[v] || 'cabinEconomy'); }

// ==================== 日历视图 ====================
let calendarYear, calendarMonth;
let calendarTodos = JSON.parse(localStorage.getItem('skytrace-todos') || '{}');
function initCalendar() { const now = new Date(); calendarYear = now.getFullYear(); calendarMonth = now.getMonth(); renderCalendar(); }
function changeCalendarMonth(delta) { calendarMonth += delta; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); }
function changeCalendarYear(delta) { calendarYear += delta; renderCalendar(); }
function goCalendarToday() { const now = new Date(); calendarYear = now.getFullYear(); calendarMonth = now.getMonth(); renderCalendar(); }
function showYearPicker() {
    const picker = document.getElementById('year-picker-dropdown');
    if (!picker) return;
    if (picker.style.display === 'block') { picker.style.display = 'none'; return; }
    const startYear = calendarYear - 3;
    picker.innerHTML = Array.from({length: 7}, (_, i) => {
        const y = startYear + i;
        return `<button class="year-pick-btn${y === calendarYear ? ' active' : ''}" onclick="jumpToYear(${y})">${y}</button>`;
    }).join('');
    picker.style.display = 'block';
}
function jumpToYear(y) { calendarYear = y; document.getElementById('year-picker-dropdown').style.display = 'none'; renderCalendar(); }
function renderCalendar() {
    document.getElementById('calendar-month-label').textContent = new Date(calendarYear, calendarMonth).toLocaleDateString(getLocale(), { year: 'numeric', month: 'long' });
    const wdNames = [t('wdSun'), t('wdMon'), t('wdTue'), t('wdWed'), t('wdThu'), t('wdFri'), t('wdSat')];
    document.getElementById('calendar-weekdays').innerHTML = wdNames.map(d => `<div class="cal-weekday">${d}</div>`).join('');
    const flightMap = {};
    flights.forEach(f => { if (!flightMap[f.date]) flightMap[f.date] = []; flightMap[f.date].push(f); });
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const todayStr = getLocalTodayStr();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayFlights = flightMap[dateStr] || [];
        const dayTodos = calendarTodos[dateStr] || [];
        const hasTodos = dayTodos.length > 0;
        html += `<div class="cal-day${dateStr === todayStr ? ' today' : ''}${dayFlights.length ? ' has-flights' : ''}${hasTodos ? ' has-todos' : ''}" onclick="showCalendarDayFlights('${dateStr}')"><span class="cal-day-num">${d}</span>${dayFlights.length ? `<div class="cal-flight-dots">${dayFlights.slice(0, 3).map(f => `<span class="cal-dot ${f.status_info?.status === 'completed' ? 'completed' : 'upcoming'}"></span>`).join('')}${dayFlights.length > 3 ? `<span class="cal-dot-more">+${dayFlights.length - 3}</span>` : ''}</div>` : ''}${hasTodos ? '<div class="cal-todo-dot">📌</div>' : ''}</div>`;
    }
    document.getElementById('calendar-grid').innerHTML = html;
}
function showCalendarDayFlights(dateStr) {
    const dayFlights = flights.filter(f => f.date === dateStr);
    const dayTodos = calendarTodos[dateStr] || [];
    const container = document.getElementById('calendar-flight-detail');
    let html = `<div class="cal-detail-date">${formatDate(dateStr)}</div>`;
    if (dayFlights.length) {
        html += dayFlights.map(f => `<div class="cal-flight-item" onclick="showFlightDetail('${f.id}')"><div class="cal-flight-no">${f.flight_no}</div><div class="cal-flight-route"><span>${f.departure}</span><span class="cal-arrow">→</span><span>${f.arrival}</span></div><div class="cal-flight-time">${f.dep_time} - ${f.arr_time}</div><span class="flight-status ${f.status_info?.status === 'completed' ? 'completed' : 'upcoming'}">${getStatusText(f.status_info)}</span></div>`).join('');
    }
    // Todos section
    html += `<div class="cal-todo-section"><div class="cal-todo-header"><span>📌 ${t('calTodos') || '日程'}</span></div>`;
    if (dayTodos.length) {
        html += dayTodos.map((todo, i) => `<div class="cal-todo-item"><span class="cal-todo-text${todo.done ? ' done' : ''}" onclick="toggleTodoDone('${dateStr}',${i})">${todo.done ? '☑' : '☐'} ${todo.text}</span><button class="cal-todo-delete" onclick="deleteTodo('${dateStr}',${i})">✕</button></div>`).join('');
    }
    html += `<div class="cal-todo-add"><input type="text" id="new-todo-input" placeholder="${t('calTodoPlaceholder') || '添加日程...'}" onkeypress="if(event.key==='Enter')addTodo('${dateStr}')"><button onclick="addTodo('${dateStr}')">+</button></div></div>`;
    if (!dayFlights.length && !dayTodos.length) {
        html += `<div class="cal-detail-empty">${t('emptyTrips')}</div>`;
    }
    container.innerHTML = html;
}
function addTodo(dateStr) {
    const input = document.getElementById('new-todo-input');
    if (!input || !input.value.trim()) return;
    if (!calendarTodos[dateStr]) calendarTodos[dateStr] = [];
    calendarTodos[dateStr].push({ text: input.value.trim(), done: false });
    saveTodos();
    showCalendarDayFlights(dateStr);
}
function toggleTodoDone(dateStr, idx) {
    if (calendarTodos[dateStr]?.[idx]) {
        calendarTodos[dateStr][idx].done = !calendarTodos[dateStr][idx].done;
        saveTodos();
        showCalendarDayFlights(dateStr);
    }
}
function deleteTodo(dateStr, idx) {
    if (calendarTodos[dateStr]) {
        calendarTodos[dateStr].splice(idx, 1);
        if (calendarTodos[dateStr].length === 0) delete calendarTodos[dateStr];
        saveTodos();
        showCalendarDayFlights(dateStr);
        renderCalendar();
    }
}
function saveTodos() { localStorage.setItem('skytrace-todos', JSON.stringify(calendarTodos)); }

// ==================== 天气 ====================
const weatherCache = {};
const WMO_WEATHER = { 0: ['☀️', 'weatherClear'], 1: ['🌤️', 'weatherPartly'], 2: ['⛅', 'weatherCloudy'], 3: ['☁️', 'weatherOvercast'], 45: ['🌫️', 'weatherFog'], 48: ['🌫️', 'weatherFog'], 51: ['🌦️', 'weatherDrizzle'], 53: ['🌦️', 'weatherDrizzle'], 55: ['🌦️', 'weatherDrizzle'], 61: ['🌧️', 'weatherRain'], 63: ['🌧️', 'weatherRain'], 65: ['🌧️', 'weatherHeavyRain'], 71: ['🌨️', 'weatherSnow'], 73: ['🌨️', 'weatherSnow'], 75: ['🌨️', 'weatherHeavySnow'], 80: ['🌧️', 'weatherShower'], 81: ['🌧️', 'weatherShower'], 82: ['⛈️', 'weatherStorm'], 95: ['⛈️', 'weatherThunder'], 96: ['⛈️', 'weatherThunder'], 99: ['⛈️', 'weatherThunder'] };
function getWeatherIcon(code) { return (WMO_WEATHER[code] || ['🌡️', 'weatherUnknown'])[0]; }
async function fetchWeather(lat, lon) {
    const key = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
    if (weatherCache[key]) return weatherCache[key];
    try { const r = await (await fetch(`/api/weather?lat=${lat}&lon=${lon}`)).json(); if (r.success) { weatherCache[key] = r.data; return r.data; } } catch (e) {}
    return null;
}
async function loadFlightWeather(flight) {
    const arr = flight.arr_airport;
    if (!arr?.lat) return '';
    const data = await fetchWeather(arr.lat, arr.lon);
    if (!data?.current) return '';
    return `<div class="weather-widget"><div class="weather-icon">${getWeatherIcon(data.current.weather_code)}</div><div class="weather-info"><div class="weather-temp">${Math.round(data.current.temperature_2m)}°C</div><div class="weather-label">${getAirportCity(arr)} ${t('weatherNow')}</div></div></div>`;
}

// ==================== 首页待出行覆盖层已集成到 renderHomeFlightOverlay ====================

// ==================== 联程功能 ====================
function groupConnectedFlights(list) {
    const groups = {}, ungrouped = [];
    list.forEach(f => { if (f.connected_group) { if (!groups[f.connected_group]) groups[f.connected_group] = []; groups[f.connected_group].push(f); } else ungrouped.push(f); });
    const result = [], added = new Set();
    list.forEach(f => {
        if (f.connected_group && !added.has(f.connected_group)) {
            added.add(f.connected_group);
            result.push({ isGroup: true, groupId: f.connected_group, flights: groups[f.connected_group].sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || '')) });
        } else if (!f.connected_group) result.push(f);
    });
    return result;
}
function toggleConnectMode() {
    connectMode = !connectMode; selectedConnectIds.clear();
    const btn = document.getElementById('btn-connect');
    if (connectMode) {
        btn.classList.add('active');
        let bar = document.getElementById('connect-action-bar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'connect-action-bar'; bar.className = 'connect-action-bar'; document.querySelector('.flights-container').appendChild(bar); }
        bar.innerHTML = `<span class="connect-bar-text">${t('selectFlightsHint')}</span><button class="btn-primary btn-sm" onclick="confirmConnect()" id="btn-confirm-connect" disabled>${t('confirmConnect')}</button><button class="btn-secondary btn-sm" onclick="toggleConnectMode()">${t('cancel')}</button>`;
        bar.style.display = 'flex';
    } else { btn.classList.remove('active'); const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none'; }
    renderFlightsList();
}
function toggleConnectSelect(id) { if (selectedConnectIds.has(id)) selectedConnectIds.delete(id); else selectedConnectIds.add(id); const btn = document.getElementById('btn-confirm-connect'); if (btn) btn.disabled = selectedConnectIds.size < 2; renderFlightsList(); }
async function confirmConnect() {
    if (selectedConnectIds.size < 2) return;
    try { await fetch('/api/flights/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flight_ids: Array.from(selectedConnectIds) }) }); connectMode = false; selectedConnectIds.clear(); document.getElementById('btn-connect').classList.remove('active'); const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none'; loadFlights(); } catch (e) {}
}
async function disconnectGroup(groupId) {
    if (!confirm(t('confirmDisconnect'))) return;
    try { await fetch('/api/flights/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: groupId }) }); loadFlights(); } catch (e) {}
}

// ==================== 展开/折叠 ====================
function toggleWeekdayDetail(el) { const d = el.querySelector('.fun-card-expand-detail'); const h = el.querySelector('.expand-hint'); if (!d) return; const hidden = d.style.display === 'none'; d.style.display = hidden ? 'block' : 'none'; if (h) h.textContent = hidden ? '▲' : '▼'; }
function toggleMonthDetail(el, month) { const p = el.querySelector('.month-detail-popup'); if (!p) return; document.querySelectorAll('.month-detail-popup').forEach(x => { if (x !== p) x.style.display = 'none'; }); p.style.display = p.style.display === 'none' ? 'block' : 'none'; }

// ==================== 分享/导出 ====================
function shareFlightCard() {
    const flight = flights.find(f => f.id === currentFlightId);
    if (!flight) return;
    const dep = flight.dep_airport || {}, arr = flight.arr_airport || {};
    document.getElementById('share-card').innerHTML = `<div class="share-card-inner"><div class="share-card-header"><span class="share-logo">✈️ SkyTrace</span><span class="share-date">${formatDate(flight.date)}</span></div><div class="share-route"><div class="share-point"><div class="share-code">${flight.departure}</div><div class="share-city">${getAirportCity(dep)}</div><div class="share-time">${flight.dep_time}</div></div><div class="share-arrow"><div class="share-flight-no">${flight.flight_no}</div><div class="share-line">───── ✈ ─────</div><div class="share-distance">${(flight.distance || 0).toLocaleString()} km</div></div><div class="share-point"><div class="share-code">${flight.arrival}</div><div class="share-city">${getAirportCity(arr)}</div><div class="share-time">${flight.arr_time}</div></div></div><div class="share-details"><div class="share-detail-item"><span class="share-detail-label">${t('airlineLabel')}</span><span>${typeof translateAirline === 'function' ? translateAirline(flight.airline) : (flight.airline || '-')}</span></div><div class="share-detail-item"><span class="share-detail-label">${t('aircraftLabel')}</span><span>${flight.aircraft || '-'}</span></div><div class="share-detail-item"><span class="share-detail-label">${t('cabinLabel')}</span><span>${getCabinText(flight.class)}</span></div><div class="share-detail-item"><span class="share-detail-label">${t('seatLabel')}</span><span>${flight.seat || '-'}</span></div></div><div class="share-footer"><span>Generated by SkyTrace</span><span>${new Date().toLocaleDateString(getLocale())}</span></div></div>`;
    document.getElementById('share-modal').classList.add('active');
}
function closeShareModal() { document.getElementById('share-modal').classList.remove('active'); }
async function downloadShareCard() { try { const canvas = await html2canvas(document.getElementById('share-card'), { scale: 2, backgroundColor: null, useCORS: true }); const link = document.createElement('a'); link.download = `SkyTrace_${currentFlightId || 'flight'}.png`; link.href = canvas.toDataURL('image/png'); link.click(); } catch (e) { alert('导出失败'); } }
async function exportAnnualReport() {
    // Default to most recent year with completed flights
    const completedYears = flights
        .filter(f => f.status_info?.status === 'completed')
        .map(f => parseInt(f.date.split('-')[0]))
        .filter(y => !isNaN(y));
    const reportYear = completedYears.length > 0 ? Math.max(...completedYears) : new Date().getFullYear();
    const yearParam = `?year=${reportYear}`;
    const stats = await (await fetch('/api/stats' + yearParam)).json();
    const fun = stats.fun_stats || {}, sp = fun.seat_preference || {};
    const totalSeats = (sp.window || 0) + (sp.aisle || 0) + (sp.middle || 0);
    const pref = (sp.window || 0) >= (sp.aisle || 0) && (sp.window || 0) >= (sp.middle || 0) ? 'window' : (sp.aisle || 0) >= (sp.middle || 0) ? 'aisle' : 'middle';
    document.getElementById('share-card').innerHTML = `<div class="share-card-inner share-report"><div class="share-card-header"><span class="share-logo">✈️ SkyTrace</span><span class="share-date">${t('annualReport')} ${reportYear}</span></div><div class="report-hero"><div class="report-hero-value">${stats.total_flights}</div><div class="report-hero-label">${t('totalFlights')}</div></div><div class="report-stats-row"><div class="report-stat"><div class="report-stat-value">${stats.total_distance.toLocaleString()}</div><div class="report-stat-label">${t('totalDistance')}</div></div><div class="report-stat"><div class="report-stat-value">${stats.total_hours}h</div><div class="report-stat-label">${t('totalHours')}</div></div><div class="report-stat"><div class="report-stat-value">${stats.visited_airports}</div><div class="report-stat-label">${t('visitedAirports')}</div></div></div><div class="report-insights"><div class="report-insight-item"><span>🏆 ${t('topAirlines')}</span><strong>${stats.top_airlines?.[0]?.airline || '-'}</strong></div><div class="report-insight-item"><span>✈️ ${t('topRoutes')}</span><strong>${stats.top_routes?.[0]?.route || '-'}</strong></div><div class="report-insight-item"><span>${pref === 'window' ? '🪟' : '🚶'} ${t('favoriteSeat')}</span><strong>${totalSeats > 0 ? t('seatPref_' + pref) : '-'}</strong></div></div><div class="share-footer"><span>Generated by SkyTrace</span><span>${new Date().toLocaleDateString(getLocale())}</span></div></div>`;
    document.getElementById('share-modal').classList.add('active');
}
