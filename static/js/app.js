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
let fmapHeatLayer = null;
let _fmapHeatmapOn = false;
let _homeMirrorMarkers = [];
let _fmapMirrorMarkers = [];

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
let _homePendingBounds = null;  // 当首页不可见时暂存 fitBounds 参数
let _homePendingRender = false;  // 首页不可见时标记需要重新渲染
let _currentCenterSlide = null;
let _isOffline = false;
let _hoState = 'hidden'; // 'hidden' | 'peek' | 'expanded'
let _allSortOrder = 'newest'; // 'newest' | 'oldest'
const SKYTRACE_VERSION = 31;

// ==================== 通用格式化工具函数 ====================
/** 格式化航站楼显示: MAIN 原样, 纯数字加 T 前缀, 字母开头原样显示 */
function formatTerminal(terminal) {
    if (!terminal) return '';
    if (terminal === 'MAIN') return 'MAIN';
    // 纯数字 → T1/T2, 单字母 A-E → Terminal A, 其他原样
    if (/^\d+$/.test(terminal)) return `T${terminal}`;
    if (/^[A-E]$/i.test(terminal)) return `Terminal ${terminal.toUpperCase()}`;
    return terminal;
}

/**
 * 将 arc.js geometries 转为 Leaflet polyline 坐标
 * 使用坐标平移法(±360°)使经度连续，合并为单条折线，
 * 配合 worldCopyJump 确保跨太平洋航线完整显示。
 *
 * 原理: arc.js 在 ±180° 处拆线产生多段，各段经度在 [-180,180]。
 * 第二段起始经度与前段末尾差 ~360°，直接拼会画出横跨全球的线。
 * 本函数将后续段经度平移 ±360° 使其与前段末尾连续。
 */
function _fixAntimeridianCoords(geometries) {
    const allCoords = [];
    geometries.forEach(geo => {
        geo.coords.forEach(c => {
            let lon = c[0], lat = c[1];
            if (allCoords.length > 0) {
                const prevLon = allCoords[allCoords.length - 1][1];
                while (lon - prevLon > 180) lon -= 360;
                while (prevLon - lon > 180) lon += 360;
            }
            allCoords.push([lat, lon]);
        });
    });
    if (allCoords.length < 2) return [];
    // 始终返回 ±360 副本，确保宽屏 / worldCopyJump 两侧地图都渲染弧线
    return [
        allCoords,
        allCoords.map(c => [c[0], c[1] - 360]),
        allCoords.map(c => [c[0], c[1] + 360])
    ];
}

/** 格式化到达时间: 跨日到达加 +1/-1/+2 标识 */
function formatArrTime(flight) {
    if (!flight.arr_time) return '';
    const offset = _getDayOffset(flight);
    if (offset && offset !== 0) {
        const sign = offset > 0 ? '+' : '';
        return `${flight.arr_time}<sup class="next-day-sup">${sign}${offset}</sup>`;
    }
    return flight.arr_time;
}

/** 格式化到达时间(纯文本, 用于分享卡等) */
function formatArrTimeText(flight) {
    if (!flight.arr_time) return '';
    const offset = _getDayOffset(flight);
    if (offset && offset !== 0) {
        const sign = offset > 0 ? '+' : '';
        const sup = `${sign}${offset}`.split('').map(c => '\u207A\u00B9\u00B2\u207B'['+-12'.indexOf(c)] || c).join('');
        // Simpler: just use unicode superscripts
        return `${flight.arr_time}${sign === '+' ? '\u207A' : '\u207B'}${Math.abs(offset) === 1 ? '\u00B9' : '\u00B2'}`;
    }
    return flight.arr_time;
}

/** 获取航班到达日期偏移量 (兼容旧版 arr_next_day) */
function _getDayOffset(flight) {
    if (flight.arr_day_offset !== undefined && flight.arr_day_offset !== null) return parseInt(flight.arr_day_offset) || 0;
    if (flight.arr_next_day) return 1;
    return 0;
}

/** 根据经度估算 UTC 偏移(小时), 简单近似 lon/15 */
function _estimateUtcOffset(lon) {
    if (lon === undefined || lon === null) return 0;
    return Math.round(lon / 15);
}

/** 计算飞行时长, 先转 UTC 再比较, 避免跨时区 +1 天误判 */
function calcDuration(flight) {
    if (!flight.dep_time || !flight.arr_time) return '';
    const d1 = new Date(`2000-01-01T${flight.dep_time}`);
    let d2 = new Date(`2000-01-01T${flight.arr_time}`);
    // NaN 保护: 时间格式不合法时直接返回空
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';
    const offset = _getDayOffset(flight);
    if (offset) d2.setDate(d2.getDate() + offset);
    // 时区: 当地时间 → UTC (dep_utc = dep_local - depTz, arr_utc = arr_local - arrTz)
    const depAirport = flight.dep_airport || airports[flight.departure] || {};
    const arrAirport = flight.arr_airport || airports[flight.arrival] || {};
    const depTz = _estimateUtcOffset(depAirport.lon);
    const arrTz = _estimateUtcOffset(arrAirport.lon);
    const d1Utc = d1.getTime() - depTz * 3600000;
    let d2Utc = d2.getTime() - arrTz * 3600000;
    // 无显式偏移且 UTC 到达 ≤ UTC 出发 → 说明跨日, +1 天
    if (!offset && d2Utc <= d1Utc) d2Utc += 86400000;
    const diff = (d2Utc - d1Utc) / 60000;
    if (isNaN(diff) || diff <= 0) return '';
    return `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
}

/** 经停信息HTML (用于航线箭头区域) */
function renderStopoverHtml(flight) {
    if (!flight.stopover) return '';
    const stopAirport = flight.stopover_airport || {};
    const city = getAirportCity(stopAirport) || flight.stopover;
    return `<div class="stopover-indicator"><span class="stopover-dot"></span><span class="stopover-text">${t('stopoverVia')} ${flight.stopover}</span></div>`;
}

// ==================== 航空公司 Logo 映射 (IATA 2-letter → ICAO 3-letter) ====================
// Logo source: https://github.com/Jxck-S/airline-logos (1629 ICAO codes available)
// Format: logos/{ICAO}.png  — verified 223 airlines against repo (2026-01)
const IATA_TO_ICAO = {
    // — 中国大陆航空公司 —
    'CA':'CCA','MU':'CES','CZ':'CSN','HU':'CHH','ZH':'CSZ','MF':'CXA','FM':'CSH',
    'SC':'CDG','3U':'CSC','GS':'GCR','KN':'CUA','9C':'CQH','G5':'HXA','TV':'TVQ',
    'PN':'CHB','EU':'UEA','KY':'KNA','JD':'CBJ','DZ':'EPA','GJ':'CDC','QW':'CSQ',
    'CN':'GDC','8L':'LKE','GT':'CGH','Y8':'YZR','NS':'HBH','BK':'OKA','UQ':'CUH',
    'AQ':'JYH','HO':'DKH','GX':'CBG','GY':'CGZ','FU':'FZA','RY':'RJD','JR':'JOY',
    'O3':'CSS','OQ':'CQN','YI':'CYZ',
    // — 港澳台航空公司 —
    'CX':'CPA','KA':'HDA','HX':'CRK','UO':'HKE','NX':'AMU',
    'BR':'EVA','CI':'CAL','IT':'TTW','AE':'MDA','B7':'UIA',
    // — 日本航空公司 —
    'NH':'ANA','JL':'JAL','BC':'SKY','MM':'APJ','GK':'JJP','HD':'ADO',
    'SJ':'SJO','7G':'SFJ','NU':'JTA','IJ':'JIA','DJ':'TZP',
    // — 韩国航空公司 —
    'KE':'KAL','OZ':'AAR','LJ':'JNA','ZE':'ESR','TW':'TWB','7C':'JJA','RS':'RSI',
    // — 东南亚航空公司 —
    'SQ':'SIA','TR':'TGW','MI':'SLK','TG':'THA','FD':'AIQ','WE':'THD','DD':'NOK',
    'SL':'TLM','VZ':'TVJ','MH':'MAS','AK':'AXM','D7':'XAK','OD':'MXD',
    'VN':'HVN','VJ':'VJC','BL':'BAV','GA':'GIA','ID':'BTK','JT':'LNI',
    'QZ':'AWQ','QG':'CTV','PR':'PAL','5J':'CEB','Z2':'APG','QV':'LAO',
    '8M':'MMA','BI':'RBA','PG':'BKP','LQ':'LAQ',
    // — 南亚航空公司 —
    'AI':'AIC','6E':'IGO','UK':'VTI','SG':'SEJ','IX':'AXB',
    'UL':'ALK','RA':'RNA','BG':'BBC','PK':'PIA',
    // — 中东航空公司 —
    'EK':'UAE','EY':'ETD','FZ':'FDB','G9':'ABY','QR':'QTR','GF':'GFA',
    'WY':'OMA','KU':'KAC','SV':'SVA','XY':'KNE','RX':'RXI',
    'TK':'THY','PC':'PGT','XQ':'SXS','LY':'ELY','RJ':'RJA',
    'ME':'MEA','IR':'IRA','W5':'IRM','IQ':'IAW','EP':'IRC',
    // — 欧洲航空公司 —
    'BA':'BAW','VS':'VIR','U2':'EZY','BE':'BEE',
    'AF':'AFR','TO':'TVF','LH':'DLH','EW':'EWG','4Y':'EWG','DE':'CFG',
    'KL':'KLM','HV':'TRA','SN':'BEL','LX':'SWR','OS':'AUA','EN':'DLA',
    'IB':'IBE','VY':'VLG','I2':'IBS','UX':'AEA',
    'TP':'TAP','AZ':'ITY','FR':'RYR','EI':'EIN','A3':'AEE',
    'SK':'SAS','DY':'NAX','AY':'FIN','FI':'ICE','WW':'WOW','OG':'CEY',
    'LO':'LOT','OK':'CSA','W6':'WZZ','RO':'ROT','FB':'LZB',
    'JU':'ASL','OU':'CTN','BT':'BTI','PS':'AUI','B2':'BRU',
    'SU':'AFL','S7':'SBI','UT':'UTA',
    // — 北美航空公司 —
    'AA':'AAL','UA':'UAL','DL':'DAL','WN':'SWA','B6':'JBU','AS':'ASA',
    'NK':'NKS','F9':'FFT','HA':'HAL','SY':'SCX','G4':'AAY',
    'AC':'ACA','WS':'WJA','PD':'POE','TS':'TSC',
    'AM':'AMX','Y4':'VOI','4O':'VBW','CM':'CMP',
    // — 南美航空公司 —
    'LA':'LAN','JJ':'TAM','G3':'GLO','AD':'AZU','AR':'ARG','AV':'AVA','LR':'LRC',
    // — 非洲航空公司 —
    'SA':'SAA','MS':'MSR','ET':'ETH','KQ':'KQA','AT':'RAM',
    'WB':'RWD','MK':'MAU','TC':'TCW',
    // — 大洋洲航空公司 —
    'QF':'QFA','VA':'VOZ','JQ':'JST','NZ':'ANZ','FJ':'FJI',
    // — 中亚航空公司 —
    'KC':'KZR','HY':'UZB','J2':'AHY','OM':'MGL',
    // — 补充映射 —
    'VF':'AJT','MZ':'AHX','NP':'NIA','Y7':'TYA','HH':'QNT',
    // — 其他/货运 —
    'RC':'FLI','JX':'SRQ','FX':'FDX','5X':'UPS','UP':'UPS',
    'CV':'CLX','PO':'PAC','5Y':'GTI','FY':'FFM','ZD':'EWR',
};
const LOGO_JXCK = 'https://raw.githubusercontent.com/Jxck-S/airline-logos/main/flightaware_logos/';
const LOGO_JXCK_RB = 'https://raw.githubusercontent.com/Jxck-S/airline-logos/main/radarbox_logos/';
const LOGO_LOCAL = 'static/img/airlines/';

// ==================== 航空联盟映射 (2026-02) ====================
const AIRLINE_ALLIANCE = {
    // Star Alliance 星空联盟
    'CA':'star','ZH':'star','NH':'star','SQ':'star','UA':'star','AC':'star',
    'LH':'star','TK':'star','OS':'star','LX':'star','LO':'star',
    'ET':'star','TP':'star','MS':'star','NZ':'star','OZ':'star','SA':'star',
    'TG':'star','BR':'star','A3':'star','AI':'star','AV':'star','SN':'star',
    'OU':'star','CM':'star',
    // SkyTeam 天合联盟 (SAS于2024.9从星空联盟转入)
    'MU':'skyteam','FM':'skyteam','MF':'skyteam','KE':'skyteam','DL':'skyteam',
    'AF':'skyteam','KL':'skyteam','AR':'skyteam','AM':'skyteam',
    'VN':'skyteam','CI':'skyteam','RO':'skyteam','ME':'skyteam','KQ':'skyteam',
    'SK':'skyteam','SV':'skyteam','GA':'skyteam','UX':'skyteam','VS':'skyteam',
    // Oneworld 寰宇一家 (阿曼航空/斐济航空/夏威夷航空为近期新成员)
    'BA':'oneworld','AA':'oneworld','CX':'oneworld','JL':'oneworld','QF':'oneworld',
    'IB':'oneworld','AY':'oneworld','RJ':'oneworld','MH':'oneworld','QR':'oneworld',
    'AS':'oneworld','AT':'oneworld','UL':'oneworld','FJ':'oneworld','WY':'oneworld',
    'HA':'oneworld',
};
function getAllianceBadgeHtml(flightNo) {
    const iata = (flightNo || '').match(/^([A-Z0-9]{2})/i)?.[1]?.toUpperCase();
    if (!iata) return '';
    const alliance = AIRLINE_ALLIANCE[iata];
    if (!alliance) return '';
    const labels = { star: '星空联盟', skyteam: '天合联盟', oneworld: '寰宇一家' };
    const labelsEn = { star: 'Star Alliance', skyteam: 'SkyTeam', oneworld: 'Oneworld' };
    const label = currentLang === 'zh' ? labels[alliance] : (labelsEn[alliance] || labels[alliance]);
    return `<span class="alliance-badge alliance-${alliance}">${label}</span>`;
}
// 旧 slug 映射 (本地 SVG/PNG 缓存)
const AIRLINE_SLUG_MAP = {
    'CA':'air-china','MU':'china-eastern','CZ':'china-southern','HU':'hainan-airlines',
    'FM':'shanghai-airlines','ZH':'shenzhen-airlines','SC':'shandong-airlines',
    '3U':'sichuan-airlines','MF':'xiamenair','HO':'juneyao-airlines','9C':'spring-airlines',
    'GJ':'loong-air','KN':'china-united-airlines','TV':'tibet-airlines','GS':'tianjin-airlines',
    'PN':'west-air','CX':'cathay-pacific','UO':'hk-express',
    'CI':'china-airlines-taiwan','BR':'eva-air','IT':'tigerair-taiwan',
    'NH':'all-nippon-airways','JL':'japan-airlines','MM':'peach-aviation',
    'KE':'korean-air','OZ':'asiana-airlines','LJ':'jin-air','7C':'jeju-air','TW':'tway-air',
    'ZE':'eastar-jet','BX':'air-busan',
    'SQ':'singapore-airlines','TR':'scoot','VN':'vietnam-airlines','VJ':'vietjet-air',
    'TG':'thai-airways','PG':'bangkok-airways','GA':'garuda-indonesia',
    'MH':'malaysia-airlines','AK':'airasia','PR':'philippine-airlines',
    'AI':'air-india','6E':'indigo',
    'EK':'emirates','QR':'qatar-airways','EY':'etihad-airways','SV':'saudia','WY':'oman-air',
    'ET':'ethiopian-airlines','KQ':'kenya-airways','AT':'royal-air-maroc',
    'BA':'british-airways','LH':'lufthansa','AF':'air-france','KL':'klm','LX':'swiss',
    'IB':'iberia','FR':'ryanair','SK':'scandinavian-airlines','TP':'tap-air-portugal',
    'SN':'brussels-airlines','LO':'lot-polish-airlines','TK':'turkish-airlines',
    'EI':'aer-lingus','VS':'virgin-atlantic','FI':'icelandair','RO':'tarom',
    'EW':'eurowings','HV':'transavia','A3':'aegean-airlines','BT':'airbaltic',
    'AA':'american-airlines','DL':'delta-air-lines','UA':'united-airlines',
    'WN':'southwest-airlines','AS':'alaska-airlines','AC':'air-canada','WS':'westjet',
    'AM':'aeromexico','AR':'aerolineas-argentinas','AV':'avianca','CM':'copa-airlines',
    'LA':'latam-airlines','JJ':'latam-airlines',
    'QF':'qantas','VA':'virgin-australia','NZ':'air-new-zealand','FJ':'fiji-airways',
    'JX':'starlux-airlines','QH':'bamboo-airways','BI':'royal-brunei-airlines',
    'KC':'air-astana','JU':'air-serbia','W6':'wizz-air','PC':'pegasus-airlines',
    'VF':'ajet',
};
function _logoFallback(img) {
    var t = parseInt(img.dataset.tried || '0') + 1;
    img.dataset.tried = t;
    var chain = (img.dataset.chain || '').split('|').filter(Boolean);
    if (t <= chain.length) { img.src = chain[t - 1]; }
    else { img.style.display = 'none'; var fb = img.nextElementSibling; if (fb) fb.style.display = 'flex'; }
}
function getAirlineLogoHtml(flightNo) {
    const iata = (flightNo || '').match(/^([A-Z0-9]{2})/i)?.[1]?.toUpperCase();
    if (!iata) return '';
    const slug = AIRLINE_SLUG_MAP[iata];
    const icao = IATA_TO_ICAO[iata];
    if (slug || icao) {
        // 优先本地缓存: ICAO png → slug svg → slug png → 远端 CDN
        const icaoPng = icao ? `${LOGO_LOCAL}${icao.toLowerCase()}.png` : '';
        const localSvg = slug ? `${LOGO_LOCAL}${slug}.svg` : '';
        const localPng = slug ? `${LOGO_LOCAL}${slug}.png` : '';
        // Direct CDN URLs as final fallback
        const directFa = icao ? `${LOGO_JXCK}${icao}.png` : '';
        const directRb = icao ? `${LOGO_JXCK_RB}${icao}.png` : '';
        const firstSrc = icaoPng || localSvg || directFa;
        const chain = [localSvg, localPng, directFa, directRb].filter(Boolean).join('|');
        return `<img class="airline-logo" src="${firstSrc}" alt="${iata}" data-chain="${chain}" onerror="_logoFallback(this)"><span class="airline-logo-fallback" style="display:none">${iata}</span>`;
    }
    return `<span class="airline-logo-fallback">${iata}</span>`;
}

// ==================== 离线模式检测 ====================
function _initOfflineDetection() {
    _isOffline = !navigator.onLine;
    _updateOfflineBanner();
    window.addEventListener('online', () => { _isOffline = false; _updateOfflineBanner(); });
    window.addEventListener('offline', () => { _isOffline = true; _updateOfflineBanner(); });
}
function _updateOfflineBanner() {
    document.body.classList.toggle('is-offline', _isOffline);
    const lookupBtn = document.querySelector('.btn-lookup');
    if (lookupBtn) {
        lookupBtn.disabled = _isOffline;
        lookupBtn.style.opacity = _isOffline ? '0.5' : '1';
    }
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
    try { _initOfflineDetection(); console.log('[SkyTrace] offline detect OK'); } catch(e) { console.error('[SkyTrace] offline:', e); }
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
    }).catch(e => {
        console.error('[SkyTrace] Init error:', e);
    }).finally(() => {
        // 数据加载完成（无论成功/失败）→ 隐藏开屏动画
        _dismissSplash();
    });

    // 第四步: 设置航班号输入框事件
    try { _initFlightInput(); } catch(e) { console.error('[SkyTrace] _initFlightInput:', e); }
    // 检查 API 状态
    checkApiStatus().catch(() => {});
    // 版本检查 - 自动刷新
    _checkVersionAndRefresh();
    // 安全网: 如果5秒后开屏动画还在，强制隐藏
    setTimeout(() => {
        _dismissSplash(true);
    }, 5000);
}

/** 隐藏开屏动画 (带淡出过渡) */
function _dismissSplash(force) {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    if (splash.classList.contains('fade-out')) return;
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 700);
    if (force) console.warn('[SkyTrace] Force-hiding splash screen');
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
        zoomControl: false,
        worldCopyJump: true,
        maxBounds: [[-85, -Infinity], [85, Infinity]],
        maxBoundsViscosity: 0.8
    });
    const theme = localStorage.getItem('skytrace-theme') || 'dark';
    const tileUrl = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    homeTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(homeMap);
}

function getLocalTodayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function renderHomeRoutes() {
    if (!homeMap) return;
    homeArcLayers.forEach(l => { try { homeMap.removeLayer(l); } catch(e) {} });
    _homeMirrorMarkers.forEach(l => { try { homeMap.removeLayer(l); } catch(e) {} });
    homeArcLayers = [];
    _homeMirrorMarkers = [];
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
        const arcLine = generator.Arc(50);
        const fixedSegments = _fixAntimeridianCoords(arcLine.geometries);
        fixedSegments.forEach(coords => {
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
        const terminalHtml = airportTerminals[code] ? `<div style="font-size:11px;color:#3b82f6;margin-top:3px;">${formatTerminal(airportTerminals[code])}</div>` : '';
        const dotIcon = L.divIcon({
            className: 'airport-dot-icon',
            html: '<div class="airport-dot"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        const popupHtml = `<div style="text-align:center;padding:5px;"><div style="font-size:18px;font-weight:bold;color:#3b82f6;">${code}</div><div style="font-size:13px;color:#666;margin-top:4px;">${getAirportCity(airports[code])} · ${getAirportName(airports[code])}</div>${terminalHtml}</div>`;
        const marker = L.marker([airport.lat, airport.lon], { icon: dotIcon }).addTo(homeMap);
        marker.bindPopup(popupHtml, { className: 'airport-popup' });
        homeArcLayers.push(marker);
        // 反子午线镜像: 在 lon±360 处创建副本，确保跨世界副本可见
        [-360, 360].forEach(offset => {
            const m = L.marker([airport.lat, airport.lon + offset], { icon: dotIcon }).addTo(homeMap);
            m.bindPopup(popupHtml, { className: 'airport-popup' });
            _homeMirrorMarkers.push(m);
        });
    });

    if (homeArcLayers.length > 0) {
        // 优先定位到最近一个待出行航班，而非所有航班
        let targetBounds;
        const sortedUpcoming = upcoming.filter(f => f.dep_airport?.lat && f.arr_airport?.lat).sort((a, b) => (a.date + (a.dep_time || '')).localeCompare(b.date + (b.dep_time || '')));
        const nearestFlight = sortedUpcoming[0];
        if (nearestFlight && homeRoutesByFlight[nearestFlight.id]?.length) {
            targetBounds = L.featureGroup(homeRoutesByFlight[nearestFlight.id]).getBounds();
        } else {
            targetBounds = L.featureGroup(homeArcLayers).getBounds();
        }
        const homeView = document.getElementById('home-view');
        if (homeView && homeView.classList.contains('active')) {
            homeMap.invalidateSize();
            homeMap.fitBounds(targetBounds, { padding: [50, 50] });
            _homePendingBounds = null;
        } else {
            _homePendingBounds = targetBounds;
            _homePendingRender = true;
        }
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
let _hoCarouselIdx = 0;

function initHomeOverlayDrag() {
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    // Always re-attach drag if overlay HTML was replaced
    if (el._dragInited) return;
    el._dragInited = true;
    const handle = el.querySelector('.home-overlay-handle');
    const header = el.querySelector('.home-overlay-header');

    // Click header or handle to cycle: hidden → peek (最近出行) → expanded (全部待出行) → hidden
    const toggleClick = () => {
        if (_hoState === 'hidden') {
            peekHomeOverlay();
        } else if (_hoState === 'peek') {
            expandHomeOverlay();
        } else {
            minimizeHomeOverlay();
        }
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
            const newH = Math.max(56, Math.min(window.innerHeight * 0.85, _hoStartH + dy));
            el.style.maxHeight = newH + 'px';
            // 拖动时同步更新缩放按钮位置
            const zoomContainer = document.querySelector('#home-map .leaflet-bottom.leaflet-right');
            if (zoomContainer) {
                zoomContainer.style.transition = 'none';
                zoomContainer.style.bottom = (newH + 12) + 'px';
                zoomContainer.style.opacity = newH > window.innerHeight * 0.6 ? '0' : '1';
            }
        }, {passive: true});
        handle.addEventListener('touchend', () => {
            el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
            const h = el.offsetHeight;
            if (h > window.innerHeight * 0.35) {
                expandHomeOverlay();
            } else if (h > 100) {
                peekHomeOverlay();
            } else {
                minimizeHomeOverlay();
            }
        });
    }
    // Start at minimized/hidden state (just the handle bar above nav)
    minimizeHomeOverlay();
}

function _getMobileNavH() {
    const mobileNav = document.querySelector('.mobile-nav');
    return (mobileNav && mobileNav.offsetParent !== null) ? mobileNav.offsetHeight : 0;
}

function expandHomeOverlay() {
    _hoState = 'expanded';
    _hoExpanded = true;
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
    const navH = _getMobileNavH();
    el.style.maxHeight = navH > 0 ? `calc(75vh)` : `calc(75vh)`;
    el.classList.add('expanded');
    el.classList.remove('minimized');
    // 标题切换为"全部待出行"
    const titleEl = el.querySelector('.home-overlay-title');
    if (titleEl) titleEl.textContent = t('allUpcoming') || t('filterUpcoming') || '全部待出行';
    // 隐藏最近出行大卡片，显示完整列表（最近航班平滑过渡到列表中）
    const nearest = el.querySelector('.home-nearest-card');
    const list = el.querySelector('.home-overlay-list');
    if (nearest) { nearest.style.maxHeight = '0'; nearest.style.opacity = '0'; nearest.style.overflow = 'hidden'; nearest.style.padding = '0'; nearest.style.margin = '0'; }
    if (list) {
        list.style.opacity = '1'; list.style.pointerEvents = 'auto'; list.style.height = 'auto';
        // 滚动到用户正在查看的联程航班
        const pinnedCards = list.querySelectorAll('.home-list-pinned');
        if (_hoCarouselIdx > 0 && pinnedCards[_hoCarouselIdx]) {
            setTimeout(() => { pinnedCards[_hoCarouselIdx].scrollIntoView({ block: 'start' }); }, 50);
        } else {
            list.scrollTop = 0;
        }
    }
    // 展开箭头向下
    const hint = el.querySelector('.home-overlay-expand-hint');
    if (hint) hint.textContent = '▼';
    _updateHomeZoomPosition();
}

function collapseHomeOverlay() {
    peekHomeOverlay();
}

function peekHomeOverlay() {
    _hoState = 'peek';
    _hoExpanded = false;
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
    const navH = _getMobileNavH();
    el.style.maxHeight = '280px';
    el.classList.remove('expanded');
    el.classList.remove('minimized');
    // 标题切换为"最近出行"
    const titleEl = el.querySelector('.home-overlay-title');
    if (titleEl) titleEl.textContent = t('nearestTrip') || '最近出行';
    const nearest = el.querySelector('.home-nearest-card');
    const list = el.querySelector('.home-overlay-list');
    if (nearest) { nearest.style.maxHeight = ''; nearest.style.opacity = '1'; nearest.style.overflow = ''; nearest.style.padding = ''; nearest.style.margin = ''; }
    if (list) { list.style.opacity = '0'; list.style.pointerEvents = 'none'; list.style.height = '0'; }
    // 箭头向上
    const hint = el.querySelector('.home-overlay-expand-hint');
    if (hint) hint.textContent = '▲';
    _updateHomeZoomPosition();
}

function minimizeHomeOverlay() {
    _hoState = 'hidden';
    _hoExpanded = false;
    const el = document.getElementById('home-flights-overlay');
    if (!el) return;
    el.style.transition = 'max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.3s';
    const navH = _getMobileNavH();
    el.style.maxHeight = '56px';
    el.classList.remove('expanded');
    el.classList.add('minimized');
    const titleEl = el.querySelector('.home-overlay-title');
    if (titleEl) titleEl.textContent = t('filterUpcoming') || '待出行';
    const nearest = el.querySelector('.home-nearest-card');
    const list = el.querySelector('.home-overlay-list');
    if (nearest) { nearest.style.maxHeight = '0'; nearest.style.opacity = '0'; nearest.style.overflow = 'hidden'; nearest.style.padding = '0'; nearest.style.margin = '0'; }
    if (list) { list.style.opacity = '0'; list.style.pointerEvents = 'none'; list.style.height = '0'; }
    // 箭头向上（提示可以展开）
    const hint = el.querySelector('.home-overlay-expand-hint');
    if (hint) hint.textContent = '▲';
    // 高亮所有航线让用户看到完整地图
    _highlightAllRoutes();
    _updateHomeZoomPosition();
}

function _updateHomeZoomPosition() {
    const zoomContainer = document.querySelector('#home-map .leaflet-bottom.leaflet-right');
    if (!zoomContainer) return;
    zoomContainer.style.transition = 'bottom 0.35s cubic-bezier(.4,0,.2,1), opacity 0.5s ease';
    if (_hoState === 'expanded') {
        // 全展开: 隐藏缩放按钮
        zoomContainer.style.bottom = '76vh';
        zoomContainer.style.opacity = '0';
        zoomContainer.style.pointerEvents = 'none';
    } else if (_hoState === 'peek') {
        // peek: 跟随 overlay 顶部
        const overlay = document.getElementById('home-flights-overlay');
        const overlayH = overlay ? overlay.offsetHeight : 280;
        zoomContainer.style.bottom = (overlayH + 12) + 'px';
        zoomContainer.style.opacity = '1';
        zoomContainer.style.pointerEvents = 'auto';
        _scheduleZoomFade();
    } else {
        // hidden/minimized: 在 overlay 上方
        zoomContainer.style.bottom = '76px';
        zoomContainer.style.opacity = '1';
        zoomContainer.style.pointerEvents = 'auto';
        _scheduleZoomFade();
    }
}

/** 缩放按钮空闲自动减淡 */
let _zoomFadeTimer = null;
function _scheduleZoomFade() {
    const zoomContainer = document.querySelector('#home-map .leaflet-bottom.leaflet-right');
    if (!zoomContainer) return;
    // 清除旧计时器
    if (_zoomFadeTimer) clearTimeout(_zoomFadeTimer);
    // 移入/点击时恢复不透明
    const restore = () => {
        zoomContainer.style.opacity = '1';
        if (_zoomFadeTimer) clearTimeout(_zoomFadeTimer);
        _zoomFadeTimer = setTimeout(() => {
            if (_hoState !== 'expanded') zoomContainer.style.opacity = '0.35';
        }, 3000);
    };
    zoomContainer.onmouseenter = restore;
    zoomContainer.ontouchstart = restore;
    // 3 秒后自动减淡
    _zoomFadeTimer = setTimeout(() => {
        if (_hoState !== 'expanded') zoomContainer.style.opacity = '0.35';
    }, 3000);
}

function _highlightAllRoutes() {
    if (!homeMap || Object.keys(homeRoutesByFlight).length === 0) return;
    Object.entries(homeRoutesByFlight).forEach(([id, layers]) => {
        layers.forEach((l, i) => {
            if (l.setStyle) {
                if (i % 2 === 0) l.setStyle({ color: '#3b82f6', weight: 4, opacity: 0.4 });
                else l.setStyle({ color: '#60a5fa', weight: 2, opacity: 0.8 });
            }
        });
    });
}

function renderHomeFlightOverlay(upcoming) {
    const countEl = document.getElementById('home-overlay-count');
    const overlayEl = document.getElementById('home-flights-overlay');
    const nearestEl = document.getElementById('home-nearest-card');
    const listEl = document.getElementById('home-overlay-list');
    if (!countEl || !overlayEl || !nearestEl || !listEl) return;

    const sorted = [...upcoming].sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || ''));
    countEl.textContent = sorted.length;

    if (sorted.length === 0) {
        nearestEl.innerHTML = `<div class="home-overlay-empty">✈️ ${t('emptyTrips')}</div>`;
        listEl.innerHTML = `<div class="home-overlay-empty">✈️ ${t('emptyTrips')}</div>`;
        initHomeOverlayDrag();
        return;
    }

    // 最近出行: 单个航班用详细大卡片，联程航班用可滑动轮播
    const first = sorted[0];
    let nearestFlights;
    if (first.connected_group) {
        nearestFlights = sorted.filter(f => f.connected_group === first.connected_group);
    } else {
        nearestFlights = [first];
    }

    if (nearestFlights.length === 1) {
        // 单个航班: 详细全宽大卡片 (含倒计时、登机口等)
        nearestEl.innerHTML = renderNearestDetailCard(nearestFlights[0]);
    } else {
        // 联程航班: 可滑动轮播 + 指示器
        nearestEl.innerHTML = `
            <div class="nearest-connected-label">🔗 ${t('connectedFlight') || '联程航班'} · ${nearestFlights.length}${t('flights') || '段'}</div>
            <div class="home-carousel" id="nearest-carousel">${nearestFlights.map((f, i) => renderNearestSwipeCard(f, i, nearestFlights.length)).join('')}</div>
            <div class="carousel-dots">${nearestFlights.map((_, i) => `<span class="carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></span>`).join('')}</div>`;
        // 轮播指示器联动
        _hoCarouselIdx = 0;
        setTimeout(() => {
            const carousel = document.getElementById('nearest-carousel');
            if (carousel) {
                carousel.addEventListener('scroll', () => {
                    const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
                    _hoCarouselIdx = idx;
                    document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
                    // 高亮对应航线
                    if (nearestFlights[idx]) highlightRouteForSlide([nearestFlights[idx].id]);
                });
            }
            // 点击圆点跳转到对应轮播
            document.querySelectorAll('.carousel-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const idx = parseInt(dot.dataset.idx, 10);
                    if (carousel && !isNaN(idx)) carousel.scrollTo({ left: idx * carousel.offsetWidth, behavior: 'smooth' });
                });
            });
        }, 50);
    }

    // Highlight nearest route on map
    let nearestIds = nearestFlights.map(f => f.id);
    highlightRouteForSlide(nearestIds);

    // Render full list (grouped by date), with nearest flight(s) pinned at top
    const nearestIdSet = new Set(nearestFlights.map(f => f.id));
    const grouped = groupConnectedFlights(sorted);
    const dateGroups = {};
    grouped.forEach(item => {
        const date = item.isGroup ? item.flights[0].date : item.date;
        if (!dateGroups[date]) dateGroups[date] = [];
        dateGroups[date].push(item);
    });
    const sortedDates = Object.keys(dateGroups).sort((a, b) => a.localeCompare(b));
    let html = '';
    // Pin nearest flight(s) at top with a highlight label
    const nearestDate = nearestFlights[0].date;
    html += `<div class="flights-date-header">${formatDate(nearestDate)}</div>`;
    nearestFlights.forEach(f => {
        html += `<div class="home-list-pinned">${renderHomeCard(f)}</div>`;
    });
    // Render remaining (skip nearest flights already pinned)
    sortedDates.forEach(date => {
        const items = dateGroups[date].filter(item => {
            if (item.isGroup) return !item.flights.some(f => nearestIdSet.has(f.id));
            return !nearestIdSet.has(item.id);
        });
        if (items.length === 0) return;
        html += `<div class="flights-date-header">${formatDate(date)}</div>`;
        html += items.map(item => {
            if (item.isGroup) {
                return `<div class="connected-group"><div class="connected-group-header"><span class="connected-badge">🔗 ${t('connectedFlight')}</span></div>${item.flights.map(f => renderHomeCard(f)).join('')}</div>`;
            }
            return renderHomeCard(item);
        }).join('');
    });
    listEl.innerHTML = html;

    initHomeOverlayDrag();
}

/** 最近出行: 单航班详细大卡片 (含倒计时、登机口、Terminal) */
function renderNearestDetailCard(flight) {
    const dep = flight.dep_airport || {};
    const arr = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};
    const logo = getAirlineLogoHtml(flight.flight_no);

    const duration = calcDuration(flight);

    const depTerminal = formatTerminal(flight.dep_terminal);
    const arrTerminal = formatTerminal(flight.arr_terminal);
    const gate = flight.dep_gate ? `Gate ${flight.dep_gate}` : '';
    const countdownHtml = statusInfo.countdown ? `<div class="nearest-countdown">${renderCountdown(statusInfo.countdown)}</div>` : '';
    const stopoverHtml = renderStopoverHtml(flight);

    return `<div class="nearest-detail-card" onclick="showFlightDetail('${flight.id}')">
        ${countdownHtml}
        <div class="nearest-route">
            <div class="nearest-point dep">
                <div class="nearest-code">${flight.departure}</div>
                ${depTerminal ? `<div class="nearest-terminal">${depTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(dep)}</div>
                <div class="nearest-time">${flight.dep_time || ''}</div>
            </div>
            <div class="nearest-arrow">
                <div class="nearest-line"></div>
                <span class="nearest-plane">✈</span>
                <div class="nearest-line"></div>
                ${stopoverHtml}
                ${duration ? `<div class="nearest-duration">${duration}</div>` : ''}
            </div>
            <div class="nearest-point arr">
                <div class="nearest-code">${flight.arrival}</div>
                ${arrTerminal ? `<div class="nearest-terminal">${arrTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(arr)}</div>
                <div class="nearest-time">${formatArrTime(flight)}</div>
            </div>
        </div>
        <div class="nearest-footer">
            <div class="nearest-airline">${logo}<span class="nearest-flight-no">${flight.flight_no}</span></div>
            <div class="nearest-meta">
                ${gate ? `<span class="nearest-gate">${gate}</span>` : ''}
                <span class="nearest-date">${formatDate(flight.date)}</span>
            </div>
        </div>
    </div>`;
}

/** 联程航班轮播卡片: 可滑动切换，每张全宽 */
function renderNearestSwipeCard(flight, idx, total) {
    const dep = flight.dep_airport || {};
    const arr = flight.arr_airport || {};
    const logo = getAirlineLogoHtml(flight.flight_no);
    const depTerminal = formatTerminal(flight.dep_terminal);
    const arrTerminal = formatTerminal(flight.arr_terminal);
    const gate = flight.dep_gate ? `Gate ${flight.dep_gate}` : '';
    const statusInfo = flight.status_info || {};
    const countdownHtml = statusInfo.countdown ? `<div class="nearest-countdown">${renderCountdown(statusInfo.countdown)}</div>` : '';

    const duration = calcDuration(flight);
    const stopoverHtml = renderStopoverHtml(flight);

    return `<div class="nearest-swipe-card" onclick="showFlightDetail('${flight.id}')">
        ${countdownHtml}
        <div class="nearest-route">
            <div class="nearest-point dep">
                <div class="nearest-code">${flight.departure}</div>
                ${depTerminal ? `<div class="nearest-terminal">${depTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(dep)}</div>
                <div class="nearest-time">${flight.dep_time || ''}</div>
            </div>
            <div class="nearest-arrow">
                <div class="nearest-line"></div>
                <span class="nearest-plane">✈</span>
                <div class="nearest-line"></div>
                ${stopoverHtml}
                ${duration ? `<div class="nearest-duration">${duration}</div>` : ''}
            </div>
            <div class="nearest-point arr">
                <div class="nearest-code">${flight.arrival}</div>
                ${arrTerminal ? `<div class="nearest-terminal">${arrTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(arr)}</div>
                <div class="nearest-time">${formatArrTime(flight)}</div>
            </div>
        </div>
        <div class="nearest-footer">
            <div class="nearest-airline">${logo}<span class="nearest-flight-no">${flight.flight_no}</span></div>
            <div class="nearest-meta">
                ${gate ? `<span class="nearest-gate">${gate}</span>` : ''}
                <span class="nearest-date">${formatDate(flight.date)}</span>
            </div>
        </div>
    </div>`;
}

/** Home card: uses nearest-style card for unified look */
function renderHomeCard(flight) {
    const dep = flight.dep_airport || {};
    const arr = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};
    const logo = getAirlineLogoHtml(flight.flight_no);
    const depTerminal = formatTerminal(flight.dep_terminal);
    const arrTerminal = formatTerminal(flight.arr_terminal);
    const gate = flight.dep_gate ? `Gate ${flight.dep_gate}` : '';

    const duration = calcDuration(flight);
    const stopoverHtml = renderStopoverHtml(flight);

    const countdownHtml = statusInfo.countdown ? `<div class="home-card-countdown">${renderCountdown(statusInfo.countdown)}</div>` : '';

    return `<div class="nearest-swipe-card home-list-card" onclick="showFlightDetail('${flight.id}')">
        ${countdownHtml}
        <div class="nearest-route">
            <div class="nearest-point dep">
                <div class="nearest-code">${flight.departure}</div>
                ${depTerminal ? `<div class="nearest-terminal">${depTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(dep)}</div>
                <div class="nearest-time">${flight.dep_time || ''}</div>
            </div>
            <div class="nearest-arrow">
                <div class="nearest-line"></div>
                <span class="nearest-plane">✈</span>
                <div class="nearest-line"></div>
                ${stopoverHtml}
                ${duration ? `<div class="nearest-duration">${duration}</div>` : ''}
            </div>
            <div class="nearest-point arr">
                <div class="nearest-code">${flight.arrival}</div>
                ${arrTerminal ? `<div class="nearest-terminal">${arrTerminal}</div>` : ''}
                <div class="nearest-city">${getAirportCity(arr)}</div>
                <div class="nearest-time">${formatArrTime(flight)}</div>
            </div>
        </div>
        <div class="nearest-footer">
            <div class="nearest-airline">${logo}<span class="nearest-flight-no">${flight.flight_no}</span></div>
            <div class="nearest-meta">
                ${gate ? `<span class="nearest-gate">${gate}</span>` : ''}
                <span class="nearest-date">${formatDate(flight.date)}</span>
            </div>
        </div>
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

    homeArcLayers.concat(_homeMirrorMarkers).forEach(l => {
        if (l instanceof L.Marker && l.setOpacity) {
            l.setOpacity(0.7);
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
        zoomControl: false,
        worldCopyJump: true,
        maxBounds: [[-85, -Infinity], [85, Infinity]],
        maxBoundsViscosity: 0.8
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

let _fmapFullscreen = false;
function toggleFmapFullscreen() {
    _fmapFullscreen = !_fmapFullscreen;
    const wrapper = document.getElementById('fmap-wrapper');
    const btn = document.getElementById('fmap-fullscreen-btn');
    if (!wrapper) return;
    document.body.classList.toggle('fmap-fullscreen-active', _fmapFullscreen);
    if (_fmapFullscreen) {
        wrapper.classList.add('fmap-fullscreen');
        if (btn) btn.innerHTML = '✕';
        if (btn) btn.title = t('exitFullscreen') || '退出全屏';
    } else {
        wrapper.classList.remove('fmap-fullscreen');
        if (btn) btn.innerHTML = '⛶';
        if (btn) btn.title = t('fullscreen') || '全屏';
    }
    // 让 Leaflet 重新计算大小
    setTimeout(() => { if (fmap) fmap.invalidateSize(); }, 350);
}

// ==================== 热力图 ====================
function toggleFmapHeatmap() {
    _fmapHeatmapOn = !_fmapHeatmapOn;
    const btn = document.getElementById('fmap-heatmap-btn');
    if (btn) btn.classList.toggle('active', _fmapHeatmapOn);
    // 热力图开启时隐藏航线和机场标记，关闭时恢复
    fmapArcLayers.concat(_fmapMirrorMarkers).forEach(l => {
        if (_fmapHeatmapOn) {
            fmap.removeLayer(l);
        } else {
            l.addTo(fmap);
        }
    });
    _updateFmapHeatLayer();
}

function _updateFmapHeatLayer() {
    if (!fmap) return;
    // 移除旧热力图层
    if (fmapHeatLayer) { fmap.removeLayer(fmapHeatLayer); fmapHeatLayer = null; }
    if (!_fmapHeatmapOn) return;

    // 统计每个机场出现次数
    const airportCount = {};
    fmapFilteredFlights.forEach(f => {
        airportCount[f.departure] = (airportCount[f.departure] || 0) + 1;
        airportCount[f.arrival] = (airportCount[f.arrival] || 0) + 1;
    });

    // 使用 sqrt 归一化，让低频机场也有明显颜色
    const counts = Object.values(airportCount);
    const maxSqrt = Math.sqrt(Math.max(...counts, 1));

    const heatData = [];
    Object.entries(airportCount).forEach(([code, count]) => {
        const airport = airports[code];
        if (airport?.lat && airport?.lon) {
            const intensity = Math.sqrt(count) / maxSqrt;
            heatData.push([airport.lat, airport.lon, intensity]);
        }
    });

    if (heatData.length > 0 && typeof L.heatLayer === 'function') {
        fmapHeatLayer = L.heatLayer(heatData, {
            radius: 38,
            blur: 28,
            maxZoom: 10,
            max: 1.0,
            minOpacity: 0.35,
            gradient: { 0.0: '#3b82f6', 0.25: '#06b6d4', 0.5: '#10b981', 0.75: '#f59e0b', 1.0: '#ef4444' }
        }).addTo(fmap);
    }
}

// ESC 退出全屏
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _fmapFullscreen) toggleFmapFullscreen();
});

// 全局事件委托: 解除联程按钮 (不受 innerHTML 替换影响)
document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-disconnect[data-disconnect-group]');
    if (btn) {
        e.stopPropagation();
        e.preventDefault();
        const gid = btn.dataset.disconnectGroup;
        if (gid) disconnectGroup(gid);
    }
});

function renderFlightsMapRoutes() {
    fmapArcLayers.forEach(l => fmap.removeLayer(l));
    _fmapMirrorMarkers.forEach(l => fmap.removeLayer(l));
    fmapArcLayers = [];
    _fmapMirrorMarkers = [];
    const visitedAirports = new Set();

    fmapFilteredFlights.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;
        if (!dep || !arr || !dep.lat || !arr.lat) return;
        visitedAirports.add(flight.departure);
        visitedAirports.add(flight.arrival);

        const isCompleted = flight.status_info?.status === 'completed' || flight.date < getLocalTodayStr();
        const color = isCompleted ? '#64748b' : '#60a5fa';
        const glowColor = isCompleted ? '#475569' : '#3b82f6';

        const generator = new arc.GreatCircle({ x: dep.lon, y: dep.lat }, { x: arr.lon, y: arr.lat });
        const arcLine = generator.Arc(50);
        const fixedSegments = _fixAntimeridianCoords(arcLine.geometries);
        fixedSegments.forEach(coords => {
            fmapArcLayers.push(L.polyline(coords, { color: glowColor, weight: 4, opacity: 0.3 }).addTo(fmap));
            fmapArcLayers.push(L.polyline(coords, { color: color, weight: 2, opacity: 0.8 }).addTo(fmap));
        });
    });

    visitedAirports.forEach(code => {
        const airport = airports[code];
        if (!airport) return;
        const dotIcon = L.divIcon({
            className: 'airport-dot-icon',
            html: '<div class="airport-dot"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        const popupHtml = `<div style="text-align:center;padding:5px;"><div style="font-size:18px;font-weight:bold;color:#3b82f6;">${code}</div><div style="font-size:13px;color:#666;margin-top:4px;">${getAirportCity(airports[code])} · ${getAirportName(airports[code])}</div></div>`;
        const marker = L.marker([airport.lat, airport.lon], { icon: dotIcon }).addTo(fmap);
        marker.bindPopup(popupHtml, { className: 'airport-popup' });
        fmapArcLayers.push(marker);
        // 反子午线镜像
        [-360, 360].forEach(offset => {
            const m = L.marker([airport.lat, airport.lon + offset], { icon: dotIcon }).addTo(fmap);
            m.bindPopup(popupHtml, { className: 'airport-popup' });
            _fmapMirrorMarkers.push(m);
        });
    });

    // 更新热力图层
    _updateFmapHeatLayer();

    // 热力图模式下隐藏航线和标记
    if (_fmapHeatmapOn) {
        fmapArcLayers.concat(_fmapMirrorMarkers).forEach(l => fmap.removeLayer(l));
    }

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
    animateCountUp(document.getElementById('fmap-stat-flights'), fmapFilteredFlights.length);
    animateCountUp(document.getElementById('fmap-stat-distance'), totalDistance);
    animateCountUp(document.getElementById('fmap-stat-airports'), visitedAirports.size);
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

        animateCountUp(document.getElementById('total-flights'), stats.total_flights || 0);
        animateCountUp(document.getElementById('total-distance'), stats.total_distance || 0);
        animateCountUp(document.getElementById('total-hours'), stats.total_hours || 0, {decimals: 1});
        animateCountUp(document.getElementById('visited-airports'), stats.visited_airports || 0);
        animateCountUp(document.getElementById('visited-countries'), stats.visited_countries || 0);
        animateCountUp(document.getElementById('earth-rounds'), (stats.total_distance || 0) / 40075, {decimals: 2});
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
        cards += `<div class="fun-card fun-card-wide fun-card-expandable" onclick="toggleWeekdayDetail(this)"><div class="fun-card-icon">📅</div><div class="fun-card-value">${wdNames[maxWd]}</div><div class="fun-card-label">${t('busiestDay')} <span class="expand-hint">▼</span></div><div class="weekday-bars">${wd.map((v, i) => `<div class="wd-bar-col"><div class="wd-bar" style="height:${maxWdVal ? Math.round(v / maxWdVal * 40) : 0}px" title="${wdNames[i]}: ${v}"></div><div class="wd-label">${wdNames[i]}</div></div>`).join('')}</div><div class="fun-card-expand-detail" style="display:none">${wd.map((v, i) => {
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

    // Render month selector as year + month dropdowns
    if (selectorEl) {
        const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const selectedYear = _currentChartMonth.substring(0, 4);
        const selectedMonth = parseInt(_currentChartMonth.substring(5));
        // Available years from data
        const availYears = [...new Set(months.map(m => m.substring(0, 4)))].sort();
        // Available months for selected year
        const availMonths = months.filter(m => m.startsWith(selectedYear)).map(m => parseInt(m.substring(5)));
        
        let yearOpts = availYears.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}年</option>`).join('');
        let monthOpts = availMonths.map(m => `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${monthNames[m - 1]}</option>`).join('');
        
        selectorEl.innerHTML = `
            <select class="month-chart-select" id="chart-year-select" onchange="onChartYearChange(this.value)">${yearOpts}</select>
            <select class="month-chart-select" id="chart-month-select" onchange="onChartMonthChange(this.value)">${monthOpts}</select>
        `;
    }

    // Get day-level data for this month
    const dayFlights = cachedStatsData?.fun_stats?.day_flights || {};
    const ym = _currentChartMonth;
    const yearNum = parseInt(ym.substring(0, 4));
    const monNum = parseInt(ym.substring(5));
    const daysInMonth = new Date(yearNum, monNum, 0).getDate();

    // Build day counts - only days with flights
    const dayCounts = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dayKey = `${ym}-${String(d).padStart(2, '0')}`;
        const flightsArr = dayFlights[dayKey] || [];
        if (flightsArr.length > 0) {
            dayCounts.push({ day: d, count: flightsArr.length, flights: flightsArr, key: dayKey });
        }
    }

    if (dayCounts.length === 0) {
        container.innerHTML = `<div class="month-chart-empty">${t('emptyTrips') || '暂无飞行记录'}</div>`;
        return;
    }

    const max = Math.max(...dayCounts.map(d => d.count), 1);

    container.innerHTML = dayCounts.map(d => {
        const val = d.count;
        return `<div class="month-bar-col month-bar-clickable" onclick="toggleMonthDetail(this, '${d.key}')">
            <div class="month-bar-value">${val}</div>
            <div class="month-bar" style="height:${max ? Math.round(val / max * 100) : 0}px"></div>
            <div class="month-bar-label">${monNum}/${d.day}</div>
            <div class="month-detail-popup" style="display:none">${d.flights.slice(0, 8).map(f => `<div class="month-detail-item">${f.flight_no} ${f.route} <small>${f.date}</small></div>`).join('')}</div>
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

function onChartYearChange(year) {
    if (!_cachedMonthData) return;
    const months = Object.keys(_cachedMonthData).sort();
    const availMonths = months.filter(m => m.startsWith(year));
    if (availMonths.length > 0) {
        _currentChartMonth = availMonths[availMonths.length - 1]; // default to last month in year
    }
    renderMonthlyChart(_cachedMonthData);
}

function onChartMonthChange(month) {
    if (!_cachedMonthData) return;
    const year = _currentChartMonth.substring(0, 4);
    const newKey = `${year}-${String(month).padStart(2, '0')}`;
    const months = Object.keys(_cachedMonthData).sort();
    if (months.includes(newKey)) {
        _currentChartMonth = newKey;
        renderMonthlyChart(_cachedMonthData);
    }
}

// ==================== 时间筛选 (列表用) ====================
let _advFilterExpanded = false;
function toggleAdvancedFilter() {
    _advFilterExpanded = !_advFilterExpanded;
    const panel = document.getElementById('advanced-filter-panel');
    const arrow = document.getElementById('af-arrow');
    if (panel) panel.style.display = _advFilterExpanded ? 'block' : 'none';
    if (arrow) arrow.textContent = _advFilterExpanded ? '\u25B2' : '\u25BC';
}
function _updateActiveDateTag() {
    const s = document.getElementById('filter-start-date')?.value;
    const e = document.getElementById('filter-end-date')?.value;
    const tag = document.getElementById('active-date-tag');
    const text = document.getElementById('active-date-text');
    if (!tag || !text) return;
    if (s || e) {
        text.textContent = (s || '...') + ' ~ ' + (e || '...');
        tag.style.display = 'inline-flex';
    } else {
        tag.style.display = 'none';
    }
}
function applyTimeFilter() {
    let startDate = document.getElementById('filter-start-date').value;
    let endDate = document.getElementById('filter-end-date').value;
    // 默认值: 不填开始日期则用最早航班, 不填结束日期则用最晚航班
    if (!startDate && !endDate) {
        filteredFlights = [...flights];
        renderFlightsList(currentStatusFilter);
        _updateActiveDateTag();
        return;
    }
    filteredFlights = flights.filter(f => {
        if (startDate && f.date < startDate) return false;
        if (endDate && f.date > endDate) return false;
        return true;
    });
    _updateActiveDateTag();
    renderFlightsList(currentStatusFilter);
}
function resetTimeFilter() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    filteredFlights = [...flights];
    _updateActiveDateTag();
    renderFlightsList(currentStatusFilter);
}

// ==================== 航班列表渲染 ====================
function renderFlightsList(filter = currentStatusFilter) {
    currentStatusFilter = filter;
    const container = document.getElementById('flights-list');
    if (!container) return;
    let displayFlights = filteredFlights;
    const todayStr = getLocalTodayStr();

    // Update filter tab counts
    const countAll = filteredFlights.length;
    const countUpcoming = filteredFlights.filter(f => f.status_info?.status !== 'completed' && f.date >= todayStr).length;
    const countCompleted = filteredFlights.filter(f => f.status_info?.status === 'completed').length;
    document.querySelectorAll('.filter-tab').forEach(btn => {
        const f = btn.dataset.filter;
        const count = f === 'all' ? countAll : f === 'upcoming' ? countUpcoming : countCompleted;
        let badge = btn.querySelector('.filter-count');
        if (!badge) { badge = document.createElement('span'); badge.className = 'filter-count'; btn.appendChild(badge); }
        badge.textContent = count;
    });

    if (filter === 'upcoming') {
        displayFlights = filteredFlights.filter(f => f.status_info?.status !== 'completed' && f.date >= todayStr);
        displayFlights.sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || ''));
    } else if (filter === 'completed') {
        displayFlights = filteredFlights.filter(f => f.status_info?.status === 'completed');
        displayFlights.sort((a, b) => b.date.localeCompare(a.date) || (b.dep_time || '').localeCompare(a.dep_time || ''));
    } else {
        displayFlights = [...filteredFlights].sort((a, b) => {
            if (_allSortOrder === 'oldest') return a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || '');
            return b.date.localeCompare(a.date) || (b.dep_time || '').localeCompare(a.dep_time || '');
        });
    }

    // Show sort toggle for "all" filter
    let sortToggleEl = document.getElementById('sort-toggle-btn');
    if (sortToggleEl) {
        if (filter === 'all') {
            sortToggleEl.style.display = 'inline-flex';
            sortToggleEl.innerHTML = _allSortOrder === 'newest' ? `\u2193 ${t('sortNewest') || '\u6700\u65B0\u4F18\u5148'}` : `\u2191 ${t('sortOldest') || '\u6700\u65E9\u4F18\u5148'}`;
        } else {
            sortToggleEl.style.display = 'none';
        }
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

    const isNewestFirst = filter === 'completed' || (filter === 'all' && _allSortOrder === 'newest');
    const sortedDates = Object.keys(dateGroups).sort((a, b) => isNewestFirst ? b.localeCompare(a) : a.localeCompare(b));

    // 收集哪些联程组已经渲染过 (跨日联程只渲染一次)
    const renderedGroups = new Set();
    let html = '';
    sortedDates.forEach(date => {
        // 本日期下的非联程航班和尚未渲染的联程组
        const items = dateGroups[date].filter(item => {
            if (item.isGroup) {
                if (renderedGroups.has(item.groupId)) return false;
                renderedGroups.add(item.groupId);
            }
            return true;
        });
        if (items.length === 0) return;
        // 非联程航班统一加一个日期头
        const standaloneFlights = items.filter(i => !i.isGroup);
        const groups = items.filter(i => i.isGroup);
        // 先渲染联程组(日期头在框内)
        groups.forEach(item => {
            const groupDates = {};
            item.flights.forEach(f => {
                if (!groupDates[f.date]) groupDates[f.date] = [];
                groupDates[f.date].push(f);
            });
            const gDates = Object.keys(groupDates).sort((a, b) => isNewestFirst ? b.localeCompare(a) : a.localeCompare(b));
            let inner = '';
            gDates.forEach(gd => {
                inner += `<div class="connected-group-date">${formatDate(gd)}</div>`;
                inner += groupDates[gd].map(f => renderFlightCard(f)).join('');
            });
            html += `<div class="connected-group"><div class="connected-group-header"><span class="connected-badge">🔗 ${t('connectedFlight')}</span><button class="btn-disconnect" onclick="event.stopPropagation();disconnectGroup('${item.groupId}')" title="${t('disconnect')}">✕</button></div>${inner}</div>`;
        });
        // 再渲染独立航班
        if (standaloneFlights.length > 0) {
            html += `<div class="flights-date-header">${formatDate(date)}</div>`;
            html += standaloneFlights.map(f => renderFlightCard(f)).join('');
        }
    });

    container.innerHTML = html;
}

function renderFlightCard(flight) {
    const dep = flight.dep_airport || {};
    const arr = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};
    const logo = getAirlineLogoHtml(flight.flight_no);
    const depTerminal = formatTerminal(flight.dep_terminal);
    const arrTerminal = formatTerminal(flight.arr_terminal);
    const gate = flight.dep_gate ? `Gate ${flight.dep_gate}` : '';

    const duration = calcDuration(flight);
    const stopoverHtml = renderStopoverHtml(flight);

    const isSelected = selectedConnectIds.has(flight.id);
    const statusClass = statusInfo.status === 'completed' ? 'completed' : statusInfo.status === 'checkin_open' ? 'checkin_open' : statusInfo.status === 'boarding' ? 'boarding' : 'upcoming';
    const countdownHtml = statusInfo.countdown ? `<div class="home-card-countdown">${renderCountdown(statusInfo.countdown)}</div>` : '';
    const distKm = flight.distance ? `${flight.distance.toLocaleString()} km` : '';

    return `<div class="nearest-swipe-card flights-list-card ${isSelected ? 'selected-connect' : ''} ${connectMode ? 'connect-mode' : ''}" onclick="${connectMode ? `toggleConnectSelect('${flight.id}')` : `showFlightDetail('${flight.id}')`}">
        ${connectMode ? `<div class="connect-checkbox">${isSelected ? '☑' : '☐'}</div>` : ''}
        <div class="flight-card-body">
            <div class="fcard-top-row">
                <div class="nearest-airline">${logo}<span class="nearest-flight-no">${flight.flight_no}</span></div>
                <span class="flight-status ${statusClass}">${getStatusText(statusInfo)}</span>
            </div>
            <div class="nearest-route">
                <div class="nearest-point dep">
                    <div class="nearest-code">${flight.departure}</div>
                    ${depTerminal ? `<div class="nearest-terminal">${depTerminal}</div>` : ''}
                    <div class="nearest-city">${getAirportCity(dep)}</div>
                    <div class="nearest-time">${flight.dep_time || ''}</div>
                </div>
                <div class="nearest-arrow">
                    <div class="nearest-line"></div>
                    <span class="nearest-plane">✈</span>
                    <div class="nearest-line"></div>
                    ${stopoverHtml}
                    ${duration ? `<div class="nearest-duration">${duration}</div>` : ''}
                </div>
                <div class="nearest-point arr">
                    <div class="nearest-code">${flight.arrival}</div>
                    ${arrTerminal ? `<div class="nearest-terminal">${arrTerminal}</div>` : ''}
                    <div class="nearest-city">${getAirportCity(arr)}</div>
                    <div class="nearest-time">${formatArrTime(flight)}</div>
                </div>
            </div>
            <div class="nearest-footer">
                <div class="nearest-meta">
                    ${distKm ? `<span class="nearest-distance">${distKm}</span>` : ''}
                </div>
                ${gate ? `<span class="nearest-gate">${gate}</span>` : ''}
            </div>
            ${statusInfo.status === 'in_flight' ? `<div class="flight-progress-bar"><div class="fill" style="width:${statusInfo.progress || 0}%"></div></div>` : ''}
            ${countdownHtml}
        </div>
    </div>`;
}

// ==================== 数字滚动动画 ====================
function animateCountUp(el, endValue, opts = {}) {
    if (!el) return;
    const duration = opts.duration || 1200;
    const decimals = opts.decimals || 0;
    const numVal = typeof endValue === 'number' ? endValue : parseFloat(String(endValue).replace(/,/g, ''));
    if (isNaN(numVal)) {
        el.textContent = decimals > 0 ? (0).toFixed(decimals) : '0';
        return;
    }
    if (numVal === 0) {
        el.textContent = decimals > 0 ? numVal.toFixed(decimals) : '0';
        return;
    }
    const startTime = performance.now();
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = numVal * eased;
        if (progress >= 1) {
            el.textContent = decimals > 0 ? numVal.toFixed(decimals) : numVal.toLocaleString();
            return;
        }
        el.textContent = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString();
        requestAnimationFrame(update);
    }
    el.textContent = decimals > 0 ? (0).toFixed(decimals) : '0';
    requestAnimationFrame(update);
}

// ==================== 版本检查 - 自动刷新 ====================
function _checkVersionAndRefresh() {
    fetch('/api/version?_=' + Date.now())
        .then(r => r.json())
        .then(data => {
            if (data.version && data.version !== SKYTRACE_VERSION) {
                console.log('[SkyTrace] Version mismatch: loaded=' + SKYTRACE_VERSION + ' server=' + data.version + ', reloading...');
                if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
                location.reload(true);
            }
        })
        .catch(() => {});
}

// ==================== 标签切换 ====================
function _updateFabVisibility() {
    const container = document.getElementById('fab-container');
    if (!container) return;
    const flightsView = document.getElementById('flights-view');
    const isFlightsActive = flightsView && flightsView.classList.contains('active');
    const isListActive = document.getElementById('flights-list-subview')?.classList.contains('active');
    container.style.display = (isFlightsActive && isListActive) ? 'flex' : 'none';
}

// FAB 菜单
let _fabMenuOpen = false;
function toggleFabMenu() {
    _fabMenuOpen = !_fabMenuOpen;
    const menu = document.getElementById('fab-menu');
    const fab = document.getElementById('fab-add');
    if (menu) menu.classList.toggle('open', _fabMenuOpen);
    if (fab) { fab.classList.toggle('open', _fabMenuOpen); fab.textContent = _fabMenuOpen ? '✕' : '+'; }
    if (_fabMenuOpen) {
        // 点击其他地方关闭
        setTimeout(() => document.addEventListener('click', _fabOutsideClick, { once: true }), 10);
    }
}
function closeFabMenu() {
    _fabMenuOpen = false;
    const menu = document.getElementById('fab-menu');
    const fab = document.getElementById('fab-add');
    if (menu) menu.classList.remove('open');
    if (fab) { fab.classList.remove('open'); fab.textContent = '+'; }
}
function _fabOutsideClick(e) {
    const container = document.getElementById('fab-container');
    if (container && !container.contains(e.target)) closeFabMenu();
    else if (_fabMenuOpen) setTimeout(() => document.addEventListener('click', _fabOutsideClick, { once: true }), 10);
}

function initTabs() {
    // 主导航标签 + 移动端底部导航
    const allNavTabs = [...document.querySelectorAll('.nav-tab'), ...document.querySelectorAll('.mobile-nav-tab')];
    allNavTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 如果已在当前标签页，再次点击 → 滚动到顶部
            if (tab.classList.contains('active')) {
                const viewEl = document.getElementById(tab.dataset.tab + '-view');
                if (viewEl) viewEl.scrollTo({ top: 0, behavior: 'smooth' });
                if (tab.dataset.tab === 'home') {
                    // 收起覆盖层到最小化（隐藏）状态
                    minimizeHomeOverlay();
                    if (homeMap) {
                        homeMap.invalidateSize();
                        if (homeArcLayers.length > 0) {
                            // 优先定位最近一个待出行航班
                            const todayStr = getLocalTodayStr();
                            const upcoming = flights.filter(f => f.status_info?.status !== 'completed' && f.date >= todayStr && f.dep_airport?.lat && f.arr_airport?.lat).sort((a, b) => (a.date + (a.dep_time || '')).localeCompare(b.date + (b.dep_time || '')));
                            const nearest = upcoming[0];
                            if (nearest && homeRoutesByFlight[nearest.id]?.length) {
                                homeMap.fitBounds(L.featureGroup(homeRoutesByFlight[nearest.id]).getBounds(), { padding: [50, 50] });
                            } else {
                                homeMap.fitBounds(L.featureGroup(homeArcLayers).getBounds(), { padding: [50, 50] });
                            }
                        }
                    }
                }
                return;
            }
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mobile-nav-tab').forEach(t => t.classList.remove('active'));
            // Remove active and animation from all views
            document.querySelectorAll('.view').forEach(v => {
                v.classList.remove('active');
                v.classList.remove('view-enter');
            });
            // Sync highlight
            allNavTabs.filter(t => t.dataset.tab === tab.dataset.tab).forEach(t => t.classList.add('active'));
            const targetView = document.getElementById(tab.dataset.tab + '-view');
            targetView.classList.add('active');
            // 切换标签时重置滚动位置到顶部
            targetView.scrollTop = 0;
            if (tab.dataset.tab === 'flights') {
                const activeSub = targetView.querySelector('.flights-sub-view.active');
                if (activeSub) activeSub.scrollTop = 0;
            }
            // Trigger enter animation
            requestAnimationFrame(() => targetView.classList.add('view-enter'));

            if (tab.dataset.tab === 'home') {
                setTimeout(() => {
                    if (homeMap) {
                        homeMap.invalidateSize();
                        if (_homePendingBounds) {
                            homeMap.fitBounds(_homePendingBounds, { padding: [50, 50] });
                            _homePendingBounds = null;
                        }
                    }
                    // 语言切换后重新渲染首页卡片
                    if (_homePendingRender) {
                        _homePendingRender = false;
                        try { renderHomeRoutes(); } catch (e) { console.error('[SkyTrace] re-render home:', e); }
                    }
                }, 100);
                document.querySelector('.home-flights-overlay')?.style.setProperty('display', 'flex');
            } else {
                document.querySelector('.home-flights-overlay')?.style.setProperty('display', 'none');
            }
            if (tab.dataset.tab === 'calendar') initCalendar();
            _updateFabVisibility();
        });
    });

    // 行程子标签
    document.querySelectorAll('.flights-sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.flights-sub-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.flights-sub-view').forEach(v => { v.classList.remove('active'); v.classList.remove('view-enter'); });
            tab.classList.add('active');
            const subtab = tab.dataset.subtab;
            if (subtab === 'list') {
                const sv = document.getElementById('flights-list-subview'); sv.classList.add('active'); requestAnimationFrame(() => sv.classList.add('view-enter'));
            }
            else if (subtab === 'fmap') {
                const sv = document.getElementById('flights-map-subview'); sv.classList.add('active'); requestAnimationFrame(() => sv.classList.add('view-enter'));
                initFlightsMap();
                // 地图子页使用 flex 布局，延迟刷新尺寸确保高度正确
                setTimeout(() => { if (fmap) fmap.invalidateSize(); }, 200);
            }
            else if (subtab === 'fstats') {
                const sv = document.getElementById('flights-stats-subview'); sv.classList.add('active'); requestAnimationFrame(() => sv.classList.add('view-enter'));
                loadStats();
            }
            _updateFabVisibility();
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

    // Initial FAB state
    _updateFabVisibility();
}

// ==================== 模态框 ====================
function openAddModal() {
    currentFlightId = null;
    document.getElementById('modal-title').textContent = t('addTripTitle');
    document.getElementById('flight-form').reset();
    document.getElementById('flight-id').value = '';
    document.getElementById('flight-date').value = new Date().toISOString().split('T')[0];
    // Reset advanced fields and day offset
    const advCheck = document.getElementById('show-advanced-fields');
    if (advCheck) { advCheck.checked = false; _toggleAdvancedFields(false); }
    _setDayOffsetBadge(0);
    // Clear airport hints
    ['departure-hint', 'arrival-hint', 'stopover-hint'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = ''; el.style.display = 'none'; } });
    document.getElementById('flight-modal').classList.add('active');
    // 滚动到顶部
    const formEl = document.getElementById('flight-form');
    if (formEl) formEl.scrollTop = 0;
}
function closeModal() {
    document.getElementById('flight-modal').classList.remove('active');
    document.getElementById('dep-suggestions').classList.remove('active');
    document.getElementById('arr-suggestions').classList.remove('active');
    const stopSug = document.getElementById('stopover-suggestions');
    if (stopSug) stopSug.classList.remove('active');
}
function closeDetailModal() { document.getElementById('detail-modal').classList.remove('active'); }

// ==================== 航班详情 ====================
function formatDateDetail(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const datePart = d.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
    const weekday = d.toLocaleDateString(getLocale(), { weekday: 'long' });
    return `<span class="detail-date-main">${datePart}</span><span class="detail-date-weekday">${weekday}</span>`;
}

function showFlightDetail(flightId) {
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;
    currentFlightId = flightId;
    const depAirport = flight.dep_airport || {};
    const arrAirport = flight.arr_airport || {};
    const statusInfo = flight.status_info || {};
    const progress = statusInfo.progress || 0;
    const isActive = statusInfo.status === 'in_flight';
    const logo = getAirlineLogoHtml(flight.flight_no);
    const airlineName = typeof translateAirline === 'function' ? translateAirline(flight.airline) : (flight.airline || '');

    // 登机口/行李信息 - 单列显示在乘机信息上部
    const gateDisplay = flight.dep_gate || (statusInfo.status !== 'completed' ? t('gatePending') : '-');
    const gateRows = [];
    gateRows.push(`<div class="detail-boarding-row"><span class="detail-boarding-label">${t('depGate') || '出发登机口'}</span><span class="detail-boarding-value ${!flight.dep_gate && statusInfo.status !== 'completed' ? 'text-warning' : ''}">${gateDisplay}</span></div>`);
    if (flight.checkin_counter) gateRows.push(`<div class="detail-boarding-row"><span class="detail-boarding-label">${t('checkinCounter') || '值机柜台'}</span><span class="detail-boarding-value">${flight.checkin_counter}</span></div>`);
    if (flight.baggage_carousel) gateRows.push(`<div class="detail-boarding-row"><span class="detail-boarding-label">${t('baggageCarousel') || '行李转盘'}</span><span class="detail-boarding-value">${flight.baggage_carousel}</span></div>`);

    // 座位/舱位/机型卡片 — 登机信息在上部单列，乘机信息在下部网格
    const depTerminalFmt = formatTerminal(flight.dep_terminal);
    const arrTerminalFmt = formatTerminal(flight.arr_terminal);
    let seatCardHtml = `<div class="detail-card">
        <div class="detail-card-title">💺 ${t('seatInfo') || '乘机信息'}</div>
        ${gateRows.length > 0 ? `<div class="detail-boarding-section">${gateRows.join('')}</div>` : ''}
        <div class="detail-info-grid detail-info-grid-bordered">
            <div class="detail-info-item"><div class="detail-info-label">${t('aircraftLabel')}</div><div class="detail-info-value">${flight.aircraft || '-'}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('seatLabel')}</div><div class="detail-info-value">${flight.seat || '-'}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('cabinLabel')}</div><div class="detail-info-value">${getCabinText(flight.class)}</div></div>
            <div class="detail-info-item"><div class="detail-info-label">${t('distanceLabel')}</div><div class="detail-info-value">${(flight.distance || 0).toLocaleString()} km</div></div>
        </div>
    </div>`;

    const detailContent = document.getElementById('detail-content');
    detailContent.innerHTML = `
        <div class="detail-flight-header">
            <div class="detail-flight-logo">${logo}</div>
            <div class="detail-flight-info">
                <div class="detail-flight-no">${flight.flight_no} ${getAllianceBadgeHtml(flight.flight_no)}</div>
                <div class="detail-flight-airline">${airlineName}</div>
            </div>
            <div class="detail-flight-status"><span class="flight-status ${statusInfo.status || 'upcoming'}">${getStatusText(statusInfo)}</span></div>
        </div>
        <div class="detail-date-row">${formatDateDetail(flight.date)}</div>
        <div class="detail-route">
            <div class="detail-point departure">
                <div class="detail-code">${flight.departure}</div>
                ${depTerminalFmt ? `<div class="detail-terminal">${depTerminalFmt}</div>` : ''}
                <div class="detail-city">${getAirportCity(depAirport)}</div><div class="detail-time">${flight.dep_time}</div>
            </div>
            <div class="detail-arrow">${isActive ? `<div class="flight-progress-mini"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div><div class="progress-plane" style="left:${progress}%">✈</div></div><div class="progress-text">${renderCountdown(statusInfo.countdown)}</div></div>` : '<div class="detail-route-line"><div class="detail-route-dot"></div><div class="detail-route-dash"></div><span class="detail-route-plane">✈</span><div class="detail-route-dash"></div><div class="detail-route-dot"></div></div>'}${renderStopoverHtml(flight)}</div>
            <div class="detail-point arrival">
                <div class="detail-code">${flight.arrival}</div>
                ${arrTerminalFmt ? `<div class="detail-terminal">${arrTerminalFmt}</div>` : ''}
                <div class="detail-city">${getAirportCity(arrAirport)}</div><div class="detail-time">${formatArrTime(flight)}</div>
            </div>
        </div>
        ${seatCardHtml}
        ${statusInfo.status !== 'completed' ? `<div class="detail-card"><div class="detail-card-title">⏱️ ${t('keyTimeline')}</div><div class="detail-reminder-item"><span>${t('checkinOpen')}</span><span>${formatDateTime(statusInfo.checkin_open)}</span></div><div class="detail-reminder-item"><span>${t('checkinClose')}</span><span>${formatDateTime(statusInfo.checkin_close)}</span></div><div class="detail-reminder-item"><span>${t('boardingStart')}</span><span>${formatDateTime(statusInfo.boarding_time)}</span></div></div>` : ''}
        ${flight.notes ? `<div class="detail-card"><div class="detail-card-title">📝 ${t('noteLabel')}</div><div style="font-size:14px;">${flight.notes}</div></div>` : ''}
        <div class="weather-container" id="detail-weather"></div>
        <div class="detail-delete-section"><button class="btn-danger btn-delete-full" onclick="deleteFlight()">🗑️ ${t('deleteTrip')}</button></div>
    `;
    document.getElementById('detail-modal').classList.add('active');
    // 每次打开详情滚动到顶部
    detailContent.scrollTop = 0;
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
    document.getElementById('seat').value = flight.seat || '';
    document.getElementById('cabin-class').value = flight.class || 'economy';
    document.getElementById('notes').value = flight.notes || '';
    document.getElementById('stopover').value = flight.stopover || '';
    document.getElementById('arr-day-offset').value = String(flight.arr_day_offset !== undefined && flight.arr_day_offset !== null ? flight.arr_day_offset : (flight.arr_next_day ? 1 : 0));
    _setDayOffsetBadge(document.getElementById('arr-day-offset').value);
    // Show advanced fields if they have data
    const hasAdvanced = flight.stopover || flight.dep_terminal || flight.arr_terminal || flight.dep_gate || flight.aircraft || flight.seat;
    const advCheck = document.getElementById('show-advanced-fields');
    if (advCheck) { advCheck.checked = hasAdvanced; _toggleAdvancedFields(hasAdvanced); }
    document.getElementById('flight-modal').classList.add('active');
    // 滚动到顶部
    const formEl = document.getElementById('flight-form');
    if (formEl) formEl.scrollTop = 0;
    // Trigger airport name hints
    _showAirportHint('departure'); _showAirportHint('arrival'); _showAirportHint('stopover');
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
        seat: document.getElementById('seat').value.toUpperCase(),
        class: document.getElementById('cabin-class').value,
        notes: document.getElementById('notes').value,
        stopover: document.getElementById('stopover').value.toUpperCase(),
        arr_day_offset: parseInt(document.getElementById('arr-day-offset').value) || 0,
        status: 'scheduled'
    };
    // 编辑时保留 connected_group 等后台字段
    if (flightId) {
        const existing = flights.find(f => f.id === flightId);
        if (existing && existing.connected_group) {
            flight.connected_group = existing.connected_group;
        }
    }
    try {
        let savedFlight;
        if (flightId) {
            savedFlight = await (await fetch(`/api/flights/${flightId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flight) })).json();
        } else {
            savedFlight = await (await fetch('/api/flights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flight) })).json();
            // 自动关联: 检测5小时内转机
            if (savedFlight && savedFlight.id) {
                await _autoConnectFlight(savedFlight, flight);
            }
        }
        closeModal(); loadFlights(); loadStats();
    } catch (e) { alert(t('saveFailed')); }
}

/** 自动关联: 新航班与已有航班间<5h转机自动关联为联程 */
async function _autoConnectFlight(savedResp, flightData) {
    const MAX_TRANSFER_MS = 8 * 60 * 60 * 1000; // 8 hours
    const newId = savedResp.id;
    const newDep = flightData.departure;
    const newArr = flightData.arrival;
    const newDate = flightData.date;
    const newDepTime = flightData.dep_time;
    const newArrTime = flightData.arr_time;
    if (!newDate || (!newDepTime && !newArrTime)) return;

    let matchId = null;
    let matchGroup = null;

    for (const f of flights) {
        if (f.id === newId) continue;
        // Case 1: existing flight arrives at new flight's departure
        if (f.arrival === newDep && f.arr_time && newDepTime) {
            const arrDT = new Date(`${f.date}T${f.arr_time}`);
            const depDT = new Date(`${newDate}T${newDepTime}`);
            const gap = depDT - arrDT;
            if (gap > 0 && gap <= MAX_TRANSFER_MS) {
                matchId = f.id;
                matchGroup = f.connected_group;
                break;
            }
        }
        // Case 2: existing flight departs from new flight's arrival
        if (f.departure === newArr && f.dep_time && newArrTime) {
            const arrDT = new Date(`${newDate}T${newArrTime}`);
            const depDT = new Date(`${f.date}T${f.dep_time}`);
            const gap = depDT - arrDT;
            if (gap > 0 && gap <= MAX_TRANSFER_MS) {
                matchId = f.id;
                matchGroup = f.connected_group;
                break;
            }
        }
    }

    if (matchId) {
        const groupName = matchGroup || `group_${Date.now()}`;
        const idsToConnect = [newId, matchId];
        // Also include all flights already in this group
        if (matchGroup) {
            flights.forEach(f => { if (f.connected_group === matchGroup && !idsToConnect.includes(f.id)) idsToConnect.push(f.id); });
        }
        try {
            await fetch('/api/flights/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flight_ids: idsToConnect, group_name: groupName })
            });
        } catch (e) { /* silent fail */ }
    }
}

// ==================== 行程三字码搜索 ====================
function searchFlightsByAirport(query) {
    const code = query.trim().toUpperCase();
    const clearBtn = document.getElementById('flights-search-clear');
    const sugEl = document.getElementById('flights-search-suggestions');
    if (clearBtn) clearBtn.style.display = code.length > 0 ? 'flex' : 'none';
    if (code.length === 0) {
        filteredFlights = [...flights];
        renderFlightsList(currentStatusFilter);
        if (sugEl) sugEl.classList.remove('active');
        return;
    }
    // 显示匹配的机场三字码建议
    if (sugEl && code.length >= 1 && code.length < 3) {
        // 从已有航班中获取相关机场
        const matchedCodes = new Set();
        flights.forEach(f => {
            if (f.departure?.startsWith(code)) matchedCodes.add(f.departure);
            if (f.arrival?.startsWith(code)) matchedCodes.add(f.arrival);
            if (f.stopover?.startsWith(code)) matchedCodes.add(f.stopover);
        });
        // 也从全局 airports 中搜索
        Object.keys(airports).forEach(c => {
            if (c.startsWith(code) && !c.startsWith('_')) matchedCodes.add(c);
        });
        if (matchedCodes.size > 0) {
            sugEl.innerHTML = [...matchedCodes].slice(0, 6).map(c => {
                const a = airports[c];
                const label = a ? `${getAirportCity(a)} · ${getAirportName(a)}` : '';
                return `<div class="suggestion-item" onclick="document.getElementById('flights-search-input').value='${c}';searchFlightsByAirport('${c}')"><span class="suggestion-code">${c}</span><span class="suggestion-name">${label}</span></div>`;
            }).join('');
            sugEl.classList.add('active');
        } else {
            sugEl.classList.remove('active');
        }
    } else if (sugEl) {
        sugEl.classList.remove('active');
    }
    if (code.length < 2) return;
    filteredFlights = flights.filter(f =>
        (f.departure && f.departure.includes(code)) ||
        (f.arrival && f.arrival.includes(code)) ||
        (f.stopover && f.stopover.includes(code))
    );
    renderFlightsList(currentStatusFilter);
}
function clearFlightSearch() {
    const input = document.getElementById('flights-search-input');
    if (input) input.value = '';
    const sugEl = document.getElementById('flights-search-suggestions');
    if (sugEl) sugEl.classList.remove('active');
    filteredFlights = [...flights];
    renderFlightsList(currentStatusFilter);
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
    _showAirportHint(inputId);
}

// ==================== 机场名称提示 ====================
function _showAirportHint(inputId) {
    const code = (document.getElementById(inputId)?.value || '').toUpperCase().trim();
    const hintEl = document.getElementById(inputId + '-hint');
    if (!hintEl) return;
    if (code.length === 3 && airports[code]) {
        const a = airports[code];
        hintEl.textContent = getAirportCity(a) + ' · ' + getAirportName(a);
        hintEl.style.display = 'block';
    } else {
        hintEl.textContent = '';
        hintEl.style.display = 'none';
    }
}

// ==================== 高级字段折叠 ====================
function _toggleAdvancedFields(show) {
    const section = document.getElementById('advanced-fields');
    const arrow = document.getElementById('advanced-toggle-arrow');
    if (section) section.style.display = show ? 'block' : 'none';
    if (arrow) arrow.textContent = show ? '▲' : '▼';
}

// ==================== 日期偏移切换 ====================
function _cycleDayOffset() {
    const sel = document.getElementById('arr-day-offset');
    const badge = document.getElementById('day-offset-badge');
    const values = ['0', '1', '2', '-1'];
    const labels = ['+0', '+1', '+2', '-1'];
    let idx = values.indexOf(sel.value);
    idx = (idx + 1) % values.length;
    sel.value = values[idx];
    badge.textContent = labels[idx];
    badge.classList.toggle('active', idx !== 0);
}
function _setDayOffsetBadge(val) {
    const badge = document.getElementById('day-offset-badge');
    if (!badge) return;
    const v = parseInt(val) || 0;
    badge.textContent = v > 0 ? `+${v}` : `${v}`;
    badge.classList.toggle('active', v !== 0);
}
document.addEventListener('click', (e) => { if (!e.target.closest('.form-group')) document.querySelectorAll('.suggestions').forEach(el => el.classList.remove('active')); });

// ==================== 航班智能查询 ====================
let isLookingUp = false;
async function lookupFlight() {
    if (_isOffline) { const statusEl = document.getElementById('lookup-status'); if (statusEl) { statusEl.innerHTML = '📡 ' + (t('offlineBanner') || '离线模式 - 无法查询'); statusEl.className = 'lookup-status info'; } return; }
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
            // Auto-expand advanced fields if API filled terminal data
            if (result.dep_terminal || result.arr_terminal) {
                const advCheck = document.getElementById('show-advanced-fields');
                if (advCheck && !advCheck.checked) { advCheck.checked = true; _toggleAdvancedFields(true); }
            }
            // Show airport name hints
            _showAirportHint('departure'); _showAirportHint('arrival');
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
    // 加载 GitHub 同步配置
    _loadSyncConfigToUI();
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
        const resp = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api: apiName, key }) });
        if (!resp.ok) { resultEl.textContent = `❌ HTTP ${resp.status}`; resultEl.className = 'api-test-result error'; return; }
        const text = await resp.text();
        let result;
        try { result = JSON.parse(text); } catch (_) { resultEl.textContent = `❌ ${t('testFailed')}`; resultEl.className = 'api-test-result error'; return; }
        resultEl.textContent = result.message; resultEl.className = 'api-test-result ' + (result.success ? 'success' : 'error');
    } catch (e) { resultEl.textContent = `${t('testFailed')}: ${e.message || e}`; resultEl.className = 'api-test-result error'; }
}

// ==================== 强制刷新 ====================
async function forceRefreshApp() {
    const btn = document.getElementById('settings-refresh-btn');
    if (btn) { btn.classList.add('refreshing'); }
    try {
        // 清除所有 SW 缓存
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        // 通知 SW 重新安装
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        }
        // 延迟一下让用户看到动画
        await new Promise(r => setTimeout(r, 600));
        location.reload(true);
    } catch (e) {
        console.error('[SkyTrace] Refresh error:', e);
        location.reload(true);
    }
}

// ==================== GitHub 同步 ====================
const _GITHUB_API = 'https://api.github.com';
const _SYNC_TOKEN_KEY = 'skytrace_github_token';
const _SYNC_REPO_KEY = 'skytrace_github_repo';

function _getSyncConfig() {
    return {
        token: localStorage.getItem(_SYNC_TOKEN_KEY) || '',
        repo: localStorage.getItem(_SYNC_REPO_KEY) || 'LeeLe1001/SkyTrace',
    };
}

function _saveSyncConfig(token, repo) {
    if (token && !token.includes('****')) localStorage.setItem(_SYNC_TOKEN_KEY, token);
    if (repo) localStorage.setItem(_SYNC_REPO_KEY, repo);
}

function _loadSyncConfigToUI() {
    const cfg = _getSyncConfig();
    const tokenEl = document.getElementById('github-token');
    const repoEl = document.getElementById('github-repo');
    if (tokenEl && cfg.token) tokenEl.value = cfg.token.slice(0, 4) + '****' + cfg.token.slice(-4);
    if (repoEl && cfg.repo) repoEl.value = cfg.repo;
}

async function _githubApi(path, method, body, token) {
    const resp = await fetch(`${_GITHUB_API}${path}`, {
        method: method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
    return data;
}

async function testGithubSync() {
    const resultEl = document.getElementById('sync-result');
    const tokenEl = document.getElementById('github-token');
    const repoEl = document.getElementById('github-repo');
    const token = tokenEl.value.trim();
    const repo = repoEl.value.trim();

    if (!token || !repo) {
        resultEl.textContent = t('syncNeedConfig');
        resultEl.className = 'api-test-result error';
        return;
    }

    // 如果是打码的旧 token，用存储的真实值
    const realToken = token.includes('****') ? _getSyncConfig().token : token;
    if (!realToken) {
        resultEl.textContent = t('syncNeedConfig');
        resultEl.className = 'api-test-result error';
        return;
    }

    resultEl.textContent = t('testing');
    resultEl.className = 'api-test-result info';

    try {
        const data = await _githubApi(`/repos/${repo}`, 'GET', null, realToken);
        _saveSyncConfig(realToken, repo);
        resultEl.textContent = `✅ ${t('syncConnected')} — ${data.full_name} (${data.visibility})`;
        resultEl.className = 'api-test-result success';
    } catch (e) {
        resultEl.textContent = `❌ ${e.message}`;
        resultEl.className = 'api-test-result error';
    }
}

async function syncToGithub() {
    const resultEl = document.getElementById('sync-result');
    const tokenEl = document.getElementById('github-token');
    const repoEl = document.getElementById('github-repo');
    const token = tokenEl.value.trim();
    const repo = repoEl.value.trim();
    const realToken = token.includes('****') ? _getSyncConfig().token : token;

    if (!realToken || !repo) {
        resultEl.textContent = t('syncNeedConfig');
        resultEl.className = 'api-test-result error';
        return;
    }

    const btn = document.getElementById('sync-push-btn');
    if (btn) btn.disabled = true;
    resultEl.textContent = t('syncPushing');
    resultEl.className = 'api-test-result info';

    try {
        // 获取当前航班数据
        const flightsResp = await fetch('/api/flights');
        const flightsArray = await flightsResp.json();
        // 重新组装为 {flights: [...]} 格式
        const flightsData = { flights: Array.isArray(flightsArray) ? flightsArray : (flightsArray.flights || []) };
        // 清理 status_info 等运行时字段
        flightsData.flights = flightsData.flights.map(f => {
            const clean = { ...f };
            delete clean.status_info;
            delete clean.dep_airport;
            delete clean.arr_airport;
            delete clean.connected_flights_data;
            return clean;
        });

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(flightsData, null, 2))));

        // 获取文件当前 SHA (如果存在)
        let sha;
        try {
            const file = await _githubApi(`/repos/${repo}/contents/data/flights.json`, 'GET', null, realToken);
            sha = file.sha;
        } catch (e) { /* 文件不存在也没关系 */ }

        // 提交
        const commitMsg = `sync: update flights (${flightsData.flights.length} flights) via SkyTrace`;
        await _githubApi(`/repos/${repo}/contents/data/flights.json`, 'PUT', {
            message: commitMsg,
            content: content,
            sha: sha,
        }, realToken);

        _saveSyncConfig(realToken, repo);
        resultEl.textContent = `✅ ${t('syncPushSuccess')} (${flightsData.flights.length} ${t('syncFlightsUnit')})`;
        resultEl.className = 'api-test-result success';
    } catch (e) {
        resultEl.textContent = `❌ ${t('syncPushFailed')}: ${e.message}`;
        resultEl.className = 'api-test-result error';
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function syncFromGithub() {
    const resultEl = document.getElementById('sync-result');
    const tokenEl = document.getElementById('github-token');
    const repoEl = document.getElementById('github-repo');
    const token = tokenEl.value.trim();
    const repo = repoEl.value.trim();
    const realToken = token.includes('****') ? _getSyncConfig().token : token;

    if (!realToken || !repo) {
        resultEl.textContent = t('syncNeedConfig');
        resultEl.className = 'api-test-result error';
        return;
    }

    if (!confirm(t('syncPullConfirm'))) return;

    const btn = document.getElementById('sync-pull-btn');
    if (btn) btn.disabled = true;
    resultEl.textContent = t('syncPulling');
    resultEl.className = 'api-test-result info';

    try {
        const file = await _githubApi(`/repos/${repo}/contents/data/flights.json`, 'GET', null, realToken);
        const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
        const data = JSON.parse(decoded);
        const flights = data.flights || [];

        // 静态模式: 写入 localStorage
        if (window._skytraceStatic && window._skytraceStatic.isStatic()) {
            window._skytraceStatic.importFlights(JSON.stringify(data));
        } else {
            // 服务器模式: 通过后端保存 (暂不支持批量覆盖, 提示用户)
            // 实际上静态模式最常用此功能
            localStorage.setItem('skytrace_flights', JSON.stringify(data));
        }

        _saveSyncConfig(realToken, repo);
        resultEl.textContent = `✅ ${t('syncPullSuccess')} (${flights.length} ${t('syncFlightsUnit')})`;
        resultEl.className = 'api-test-result success';

        // 刷新页面以加载新数据
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        resultEl.textContent = `❌ ${t('syncPullFailed')}: ${e.message}`;
        resultEl.className = 'api-test-result error';
    } finally {
        if (btn) btn.disabled = false;
    }
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
    if (connectMode) {
        // 自动切换到行程列表页
        const flightsTab = document.querySelector('.mobile-nav-tab[data-tab="flights"]') || document.querySelector('.nav-tab[data-tab="flights"]');
        if (flightsTab) flightsTab.click();
        let bar = document.getElementById('connect-action-bar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'connect-action-bar'; bar.className = 'connect-action-bar'; const subview = document.getElementById('flights-list-subview'); if (subview) subview.appendChild(bar); }
        _updateConnectBar();
        bar.style.display = 'flex';
    } else { const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none'; }
    renderFlightsList();
}
function _updateConnectBar() {
    const bar = document.getElementById('connect-action-bar');
    if (!bar) return;
    const count = selectedConnectIds.size;
    // 检查已选航班是否包含已有联程
    const hasConnected = Array.from(selectedConnectIds).some(id => {
        const f = flights.find(fl => fl.id === id);
        return f && f.connected_group;
    });
    bar.innerHTML = `<span class="connect-bar-text">${count > 0 ? (t('selectedCount') || '{0} 已选').replace('{0}', count) : t('selectFlightsHint')}</span>
        <div class="connect-bar-actions">
            <button class="btn-primary btn-sm" onclick="confirmConnect()" id="btn-confirm-connect" ${count < 2 ? 'disabled' : ''}>🔗 ${t('confirmConnect')}</button>
            ${hasConnected ? `<button class="btn-warning btn-sm" onclick="disconnectSelected()">🔓 ${t('disconnectSelected') || t('disconnect')}</button>` : ''}
            <button class="btn-danger btn-sm" onclick="batchDeleteFlights()" id="btn-batch-delete" ${count < 1 ? 'disabled' : ''}>🗑️ ${t('deleteTrip')}</button>
            <button class="btn-secondary btn-sm" onclick="toggleConnectMode()">${t('cancel')}</button>
        </div>`;
}
function toggleConnectSelect(id) { if (selectedConnectIds.has(id)) selectedConnectIds.delete(id); else selectedConnectIds.add(id); _updateConnectBar(); renderFlightsList(); }
async function confirmConnect() {
    if (selectedConnectIds.size < 2) return;
    try { await fetch('/api/flights/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flight_ids: Array.from(selectedConnectIds) }) }); connectMode = false; selectedConnectIds.clear(); const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none'; loadFlights(); } catch (e) {}
}
async function batchDeleteFlights() {
    if (selectedConnectIds.size < 1) return;
    const count = selectedConnectIds.size;
    if (!confirm((t('confirmBatchDelete') || '确定要删除选中的 {0} 个航班吗？此操作不可恢复。').replace('{0}', count))) return;
    if (!confirm((t('confirmBatchDelete2') || '再次确认：删除 {0} 个航班？').replace('{0}', count))) return;
    try {
        const ids = Array.from(selectedConnectIds);
        for (const id of ids) { await fetch(`/api/flights/${id}`, { method: 'DELETE' }); }
        connectMode = false; selectedConnectIds.clear();
        const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none';
        loadFlights(); loadStats();
    } catch (e) { alert(t('deleteFailed')); }
}
async function disconnectSelected() {
    const ids = Array.from(selectedConnectIds).filter(id => {
        const f = flights.find(fl => fl.id === id);
        return f && f.connected_group;
    });
    if (ids.length === 0) return;
    if (!confirm(t('confirmDisconnect'))) return;
    try {
        await fetch('/api/flights/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flight_ids: ids }) });
        connectMode = false; selectedConnectIds.clear();
        const bar = document.getElementById('connect-action-bar'); if (bar) bar.style.display = 'none';
        loadFlights();
    } catch (e) {}
}
async function disconnectGroup(groupId) {
    try { await fetch('/api/flights/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: groupId }) }); loadFlights(); } catch (e) { console.error('[SkyTrace] disconnect error', e); }
}
window.disconnectGroup = disconnectGroup;

// ==================== 展开/折叠 ====================
function toggleWeekdayDetail(el) { const d = el.querySelector('.fun-card-expand-detail'); const h = el.querySelector('.expand-hint'); if (!d) return; const hidden = d.style.display === 'none'; d.style.display = hidden ? 'block' : 'none'; if (h) h.textContent = hidden ? '▲' : '▼'; }
function toggleMonthDetail(el, month) { const p = el.querySelector('.month-detail-popup'); if (!p) return; document.querySelectorAll('.month-detail-popup').forEach(x => { if (x !== p) x.style.display = 'none'; }); p.style.display = p.style.display === 'none' ? 'block' : 'none'; }

// ==================== 分享/导出 ====================
function shareFlightCard() {
    const flight = flights.find(f => f.id === currentFlightId);
    if (!flight) return;
    const dep = flight.dep_airport || {}, arr = flight.arr_airport || {};
    const logo = getAirlineLogoHtml(flight.flight_no);
    const airlineName = typeof translateAirline === 'function' ? translateAirline(flight.airline) : (flight.airline || '');

    // Calculate duration (reuse calcDuration which handles timezone)
    const duration = calcDuration(flight);

    // Fun fact based on distance
    let funFact = '';
    const dist = flight.distance || 0;
    if (dist > 10000) funFact = `🌍 ${t('longHaulFlight') || '洲际飞行'}`;
    else if (dist > 5000) funFact = `🛫 ${t('mediumHaulFlight') || '远程飞行'}`;
    else if (dist > 2000) funFact = `✈️ ${t('midRangeFlight') || '中程飞行'}`;
    else if (dist > 0) funFact = `🛩️ ${t('shortHaulFlight') || '短途飞行'}`;

    const depT = formatTerminal(flight.dep_terminal);
    const arrT = formatTerminal(flight.arr_terminal);
    const stopoverText = flight.stopover ? `<div class="share-stopover">${t('stopoverVia')} ${flight.stopover}</div>` : '';

    document.getElementById('share-card').innerHTML = `<div class="share-card-inner">
        <div class="share-card-header">
            <span class="share-logo">✈️ SkyTrace</span>
            <span class="share-date">${formatDate(flight.date)}</span>
        </div>
        <div class="share-airline-row">${logo}<span class="share-airline-name">${airlineName}</span></div>
        <div class="share-route">
            <div class="share-point">
                <div class="share-code">${flight.departure}</div>
                ${depT ? `<div class="share-terminal">${depT}</div>` : ''}
                <div class="share-city">${getAirportCity(dep)}</div>
                <div class="share-time">${flight.dep_time}</div>
            </div>
            <div class="share-arrow">
                <div class="share-flight-no">${flight.flight_no}</div>
                <div class="share-line">───── ✈ ─────</div>
                ${stopoverText}
                ${duration ? `<div class="share-duration">${duration}</div>` : ''}
                <div class="share-distance">${dist.toLocaleString()} km</div>
            </div>
            <div class="share-point">
                <div class="share-code">${flight.arrival}</div>
                ${arrT ? `<div class="share-terminal">${arrT}</div>` : ''}
                <div class="share-city">${getAirportCity(arr)}</div>
                <div class="share-time">${formatArrTimeText(flight)}</div>
            </div>
        </div>
        <div class="share-details">
            <div class="share-detail-item"><span class="share-detail-label">${t('aircraftLabel')}</span><span>${flight.aircraft || '-'}</span></div>
            <div class="share-detail-item"><span class="share-detail-label">${t('cabinLabel')}</span><span>${getCabinText(flight.class)}</span></div>
            <div class="share-detail-item"><span class="share-detail-label">${t('seatLabel')}</span><span>${flight.seat || '-'}</span></div>
            <div class="share-detail-item"><span class="share-detail-label">${t('distanceLabel') || '距离'}</span><span>${dist.toLocaleString()} km</span></div>
        </div>
        ${funFact ? `<div class="share-fun-fact">${funFact}</div>` : ''}
        <div class="share-footer"><span>Generated by SkyTrace</span><span>${new Date().toLocaleDateString(getLocale())}</span></div>
    </div>`;
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
