/**
 * SkyTrace - 前端应用逻辑
 */

// ==================== 全局变量 ====================
let map = null;
let tileLayer = null;
let airports = {};
let airlines = {};
let flights = [];
let filteredFlights = [];
let currentFlightId = null;
let arcLayers = [];
let currentStatusFilter = 'upcoming';
let connectMode = false;
let selectedConnectIds = new Set();
let currentStatsYear = 'all';
let cachedStatsData = null;

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
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function updateMapTiles(theme) {
    if (!map || !tileLayer) return;
    const url = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    tileLayer.setUrl(url);
}

// ==================== 语言切换 ====================
function toggleLangDropdown() {
    const dd = document.getElementById('lang-dropdown');
    dd.classList.toggle('active');
}

function switchLang(lang) {
    setLanguage(lang);
    document.getElementById('lang-dropdown').classList.remove('active');
}

// 点击外部关闭语言下拉
document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-switcher')) {
        const dd = document.getElementById('lang-dropdown');
        if (dd) dd.classList.remove('active');
    }
});

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    loadAirports();
    loadAirlines();
    loadFlights();
    loadStats();
    initTabs();
    applyI18n();
});

// ==================== 地图初始化 ====================
function initMap() {
    map = L.map('map', {
        center: [35, 105],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false
    });

    // 根据当前主题选择地图样式
    const theme = localStorage.getItem('skytrace-theme') || 'dark';
    const tileUrl = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    tileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // 添加缩放控件到右下角
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
}

// ==================== 数据加载 ====================
async function loadAirports() {
    try {
        const response = await fetch('/api/airports');
        airports = await response.json();
    } catch (error) {
        console.error('加载机场数据失败:', error);
    }
}

async function loadAirlines() {
    try {
        const response = await fetch('/api/airlines');
        airlines = await response.json();
    } catch (error) {
        console.error('加载航空公司数据失败:', error);
    }
}

async function loadFlights() {
    try {
        const response = await fetch('/api/flights');
        flights = await response.json();
        filteredFlights = [...flights];
        renderFlightsList();
        renderMapRoutes();
        updateMapStats();
        renderMapUpcomingPreview();
        initTimeFilterDefaults();
    } catch (error) {
        console.error('加载航班数据失败:', error);
    }
}

// 初始化时间筛选默认值
function initTimeFilterDefaults() {
    if (flights.length === 0) return;
    
    // 找到最早和最晚的航班日期
    const dates = flights.map(f => f.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    
    // 设置筛选器的最小日期
    const filterInputs = [
        'filter-start-date', 'filter-end-date',
        'map-filter-start', 'map-filter-end'
    ];
    filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.min = minDate;
    });
}

// ==================== 统计加载(增强版) ====================
async function loadStats(year) {
    try {
        if (year !== undefined) currentStatsYear = year;
        const yearParam = currentStatsYear && currentStatsYear !== 'all' ? `?year=${currentStatsYear}` : '';
        const response = await fetch('/api/stats' + yearParam);
        const stats = await response.json();
        cachedStatsData = stats;
        
        document.getElementById('total-flights').textContent = stats.total_flights;
        document.getElementById('total-distance').textContent = stats.total_distance.toLocaleString();
        document.getElementById('total-hours').textContent = stats.total_hours;
        document.getElementById('visited-airports').textContent = stats.visited_airports;
        document.getElementById('visited-countries').textContent = stats.visited_countries;
        document.getElementById('earth-rounds').textContent = (stats.total_distance / 40075).toFixed(2);

        // 渲染年份选择器
        renderYearSelector(stats.available_years);

        // 趣味统计
        renderFunStats(stats.fun_stats, stats.top_routes, stats.top_airlines);
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
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
        const pref = sp.window >= sp.aisle && sp.window >= sp.middle ? 'window' :
                     sp.aisle >= sp.middle ? 'aisle' : 'middle';
        const prefPct = Math.round((sp[pref] / totalSeats) * 100);
        const prefIcon = pref === 'window' ? '🪟' : pref === 'aisle' ? '🚶' : '💺';
        cards += `
            <div class="fun-card">
                <div class="fun-card-icon">${prefIcon}</div>
                <div class="fun-card-value">${t('seatPref_' + pref)}</div>
                <div class="fun-card-label">${t('favoriteSeat')}</div>
                <div class="fun-card-bar">
                    <div class="bar-segment bar-window" style="width:${Math.round(sp.window/totalSeats*100)}%" title="${t('seatPref_window')} ${sp.window}"></div>
                    <div class="bar-segment bar-aisle" style="width:${Math.round(sp.aisle/totalSeats*100)}%" title="${t('seatPref_aisle')} ${sp.aisle}"></div>
                    <div class="bar-segment bar-middle" style="width:${Math.round(sp.middle/totalSeats*100)}%" title="${t('seatPref_middle')} ${sp.middle}"></div>
                </div>
                <div class="fun-card-detail">${prefPct}%</div>
            </div>`;
    }

    // 舱位分布
    const cd = fun.cabin_distribution;
    if (cd && Object.keys(cd).length > 0) {
        const maxCabin = Object.entries(cd).sort((a,b) => b[1] - a[1])[0];
        const cabinIcon = maxCabin[0] === 'business' ? '💼' : maxCabin[0] === 'first' ? '👑' : '💺';
        cards += `
            <div class="fun-card">
                <div class="fun-card-icon">${cabinIcon}</div>
                <div class="fun-card-value">${getCabinText(maxCabin[0])}</div>
                <div class="fun-card-label">${t('favoriteCabin')}</div>
                <div class="fun-card-detail">${maxCabin[1]} ${t('flights').toLowerCase()}</div>
            </div>`;
    }

    // 最早航班
    if (fun.earliest_flight) {
        cards += `
            <div class="fun-card">
                <div class="fun-card-icon">🌅</div>
                <div class="fun-card-value">${fun.earliest_flight.dep_time}</div>
                <div class="fun-card-label">${t('earliestFlight')}</div>
                <div class="fun-card-detail">${fun.earliest_flight.flight_no} ${fun.earliest_flight.route}</div>
            </div>`;
    }

    // 最晚航班
    if (fun.latest_flight) {
        cards += `
            <div class="fun-card">
                <div class="fun-card-icon">🌙</div>
                <div class="fun-card-value">${fun.latest_flight.dep_time}</div>
                <div class="fun-card-label">${t('latestFlight')}</div>
                <div class="fun-card-detail">${fun.latest_flight.flight_no} ${fun.latest_flight.route}</div>
            </div>`;
    }

    // 最长航线
    if (fun.longest_flight) {
        cards += `
            <div class="fun-card">
                <div class="fun-card-icon">🛤️</div>
                <div class="fun-card-value">${fun.longest_flight.distance.toLocaleString()} km</div>
                <div class="fun-card-label">${t('longestFlight')}</div>
                <div class="fun-card-detail">${fun.longest_flight.flight_no} ${fun.longest_flight.route}</div>
            </div>`;
    }

    // 平均数据
    cards += `
        <div class="fun-card">
            <div class="fun-card-icon">📏</div>
            <div class="fun-card-value">${fun.avg_distance.toLocaleString()} km</div>
            <div class="fun-card-label">${t('avgDistance')}</div>
            <div class="fun-card-detail">${t('avgHours')}: ${fun.avg_hours}h</div>
        </div>`;

    // 星期分布 (可点击展开)
    const wd = fun.weekday_distribution;
    if (wd && wd.some(v => v > 0)) {
        const maxWd = wd.indexOf(Math.max(...wd));
        const wdNames = [t('wdMon'), t('wdTue'), t('wdWed'), t('wdThu'), t('wdFri'), t('wdSat'), t('wdSun')];
        const maxWdVal = Math.max(...wd);
        cards += `
            <div class="fun-card fun-card-wide fun-card-expandable" onclick="toggleWeekdayDetail(this)">
                <div class="fun-card-icon">📅</div>
                <div class="fun-card-value">${wdNames[maxWd]}</div>
                <div class="fun-card-label">${t('busiestDay')} <span class="expand-hint">▼</span></div>
                <div class="weekday-bars">
                    ${wd.map((v, i) => `
                        <div class="wd-bar-col">
                            <div class="wd-bar" style="height:${maxWdVal ? Math.round(v/maxWdVal*40) : 0}px" title="${wdNames[i]}: ${v}"></div>
                            <div class="wd-label">${wdNames[i].charAt(0)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="fun-card-expand-detail" style="display:none" id="weekday-expand-detail">
                    ${wd.map((v, i) => {
                        if (v === 0) return '';
                        const dayFlights = fun.weekday_flights?.[i] || [];
                        return `<div class="expand-day-section">
                            <div class="expand-day-title">${wdNames[i]} — ${v} ${t('flights')}</div>
                            <div class="expand-day-flights">${dayFlights.slice(0, 5).map(f => 
                                `<span class="expand-flight-tag">${f.flight_no} ${f.route} (${f.date})</span>`
                            ).join('')}${dayFlights.length > 5 ? `<span class="expand-more">+${dayFlights.length - 5}</span>` : ''}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    grid.innerHTML = cards;
    if (cards) section.style.display = 'block';

    // 排行榜
    renderRankings(topRoutes, topAirlines);
    // 月度图表
    renderMonthlyChart(fun.month_distribution);
}

function renderRankings(routes, airlines) {
    const routesList = document.getElementById('top-routes-list');
    const airlinesList = document.getElementById('top-airlines-list');
    if (!routesList || !airlinesList) return;

    if (routes && routes.length > 0) {
        const maxR = routes[0].count;
        routesList.innerHTML = routes.map((r, i) => `
            <div class="ranking-item">
                <span class="ranking-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                <span class="ranking-name">${r.route}</span>
                <div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${Math.round(r.count/maxR*100)}%"></div></div>
                <span class="ranking-count">${r.count}</span>
            </div>
        `).join('');
    }

    if (airlines && airlines.length > 0) {
        const maxA = airlines[0].count;
        airlinesList.innerHTML = airlines.map((a, i) => `
            <div class="ranking-item">
                <span class="ranking-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                <span class="ranking-name">${a.airline}</span>
                <div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${Math.round(a.count/maxA*100)}%"></div></div>
                <span class="ranking-count">${a.count}</span>
            </div>
        `).join('');
    }
}

function renderMonthlyChart(monthData) {
    const container = document.getElementById('monthly-chart');
    if (!container || !monthData) return;
    const months = Object.keys(monthData).sort();
    if (months.length === 0) { container.innerHTML = ''; return; }
    const max = Math.max(...Object.values(monthData));
    const monthFlights = cachedStatsData?.fun_stats?.month_flights || {};
    container.innerHTML = months.map(m => `
        <div class="month-bar-col month-bar-clickable" onclick="toggleMonthDetail(this, '${m}')">
            <div class="month-bar-value">${monthData[m]}</div>
            <div class="month-bar" style="height:${max ? Math.round(monthData[m]/max*120) : 0}px"></div>
            <div class="month-bar-label">${m.substring(5)}</div>
            <div class="month-detail-popup" style="display:none">
                ${(monthFlights[m] || []).slice(0, 8).map(f =>
                    `<div class="month-detail-item">${f.flight_no} ${f.route} <small>${f.date}</small></div>`
                ).join('')}
            </div>
        </div>
    `).join('');
}

// ==================== 地图渲染 ====================
function renderMapRoutes() {
    // 清除现有图层
    arcLayers.forEach(layer => map.removeLayer(layer));
    arcLayers = [];

    const visitedAirports = new Set();

    // 绘制航线弧线（使用筛选后的数据）
    filteredFlights.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;

        if (!dep || !arr || !dep.lat || !arr.lat) return;

        visitedAirports.add(flight.departure);
        visitedAirports.add(flight.arrival);

        // 使用 arc.js 生成大圆航线
        const generator = new arc.GreatCircle(
            { x: dep.lon, y: dep.lat },
            { x: arr.lon, y: arr.lat }
        );

        const arcLine = generator.Arc(50, { offset: 10 });

        arcLine.geometries.forEach(geo => {
            const coords = geo.coords.map(c => [c[1], c[0]]);
            
            // 绘制发光效果（底层）
            const glowLine = L.polyline(coords, {
                color: '#3b82f6',
                weight: 4,
                opacity: 0.3
            }).addTo(map);
            arcLayers.push(glowLine);

            // 绘制主线
            const mainLine = L.polyline(coords, {
                color: '#60a5fa',
                weight: 2,
                opacity: 0.8
            }).addTo(map);
            arcLayers.push(mainLine);
        });
    });

    // 绘制机场标记
    visitedAirports.forEach(code => {
        const airport = airports[code];
        if (!airport) return;

        const marker = L.circleMarker([airport.lat, airport.lon], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#ffffff',
            weight: 2,
            fillOpacity: 1
        }).addTo(map);

        marker.bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <div style="font-size: 18px; font-weight: bold; color: #3b82f6;">${code}</div>
                <div style="font-size: 13px; color: #666; margin-top: 4px;">${getAirportCity(airport)} · ${getAirportName(airport)}</div>
            </div>
        `, {
            className: 'airport-popup'
        });

        arcLayers.push(marker);
    });

    // 自动调整视图
    if (arcLayers.length > 0) {
        const group = L.featureGroup(arcLayers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }

    // 飞行中动画
    renderAnimatedFlightOnMap();
}

function updateMapStats() {
    let totalDistance = 0;
    const visitedAirports = new Set();

    // 使用筛选后的数据计算统计
    filteredFlights.forEach(flight => {
        totalDistance += flight.distance || 0;
        visitedAirports.add(flight.departure);
        visitedAirports.add(flight.arrival);
    });

    document.getElementById('stat-flights').textContent = filteredFlights.length;
    document.getElementById('stat-distance').textContent = totalDistance.toLocaleString();
    document.getElementById('stat-airports').textContent = visitedAirports.size;
}

// ==================== 时间筛选 ====================
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

function applyMapTimeFilter() {
    const startDate = document.getElementById('map-filter-start').value;
    const endDate = document.getElementById('map-filter-end').value;
    
    filteredFlights = flights.filter(f => {
        if (startDate && f.date < startDate) return false;
        if (endDate && f.date > endDate) return false;
        return true;
    });
    
    renderMapRoutes();
    updateMapStats();
}

function resetMapTimeFilter() {
    document.getElementById('map-filter-start').value = '';
    document.getElementById('map-filter-end').value = '';
    filteredFlights = [...flights];
    renderMapRoutes();
    updateMapStats();
}

// ==================== 航班列表渲染 ====================
function renderFlightsList(filter = currentStatusFilter) {
    currentStatusFilter = filter;
    const container = document.getElementById('flights-list');
    
    let displayFlights = filteredFlights;
    if (filter === 'upcoming') {
        displayFlights = filteredFlights.filter(f => 
            f.status_info.status !== 'completed'
        );
    } else if (filter === 'completed') {
        displayFlights = filteredFlights.filter(f => 
            f.status_info.status === 'completed'
        );
    }

    // 对联程航班分组
    const groupedFlights = groupConnectedFlights(displayFlights);

    if (displayFlights.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✈️</div>
                <div class="empty-state-text">${t('emptyTrips')}</div>
                <div class="empty-state-hint">${t('emptyHint')}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = groupedFlights.map(item => {
        if (item.isGroup) {
            // 联程组
            return `<div class="connected-group">
                <div class="connected-group-header">
                    <span class="connected-badge">🔗 ${t('connectedFlight')}</span>
                    <button class="btn-disconnect" onclick="event.stopPropagation();disconnectGroup('${item.groupId}')" title="${t('disconnect')}">✕</button>
                </div>
                ${item.flights.map(flight => renderFlightCard(flight)).join('')}
            </div>`;
        }
        return renderFlightCard(item);
    }).join('');
}

function renderFlightCard(flight) {
    const depAirport = flight.dep_airport || {};
        const arrAirport = flight.arr_airport || {};
        const statusInfo = flight.status_info || {};
        
        // 计算飞行时长
        const depTime = flight.dep_time;
        const arrTime = flight.arr_time;
        let duration = '';
        if (depTime && arrTime) {
            const dep = new Date(`2000-01-01 ${depTime}`);
            let arr = new Date(`2000-01-01 ${arrTime}`);
            if (arr < dep) arr.setDate(arr.getDate() + 1);
            const diff = (arr - dep) / 1000 / 60;
            const hours = Math.floor(diff / 60);
            const mins = Math.round(diff % 60);
            duration = `${hours}h ${mins}m`;
        }

        const statusClass = statusInfo.status === 'completed' ? 'completed' : 
                           statusInfo.status === 'checkin_open' ? 'checkin_open' :
                           statusInfo.status === 'boarding' ? 'boarding' : 'upcoming';
        
        const isSelected = selectedConnectIds.has(flight.id);
        const depTerminal = flight.dep_terminal ? `<span class="terminal-tag">T${flight.dep_terminal}</span>` : '';
        const arrTerminal = flight.arr_terminal ? `<span class="terminal-tag">T${flight.arr_terminal}</span>` : '';
        
        // 登机口 (待出行才显示)
        const showGate = statusInfo.status !== 'completed';
        const depGate = showGate ? `<div class="gate-info">${t('gateLabel')}: ${flight.dep_gate || t('gatePending')}</div>` : '';

        return `
            <div class="flight-card ${isSelected ? 'selected-connect' : ''}" onclick="${connectMode ? `toggleConnectSelect('${flight.id}')` : `showFlightDetail('${flight.id}')`}">
                ${connectMode ? `<div class="connect-checkbox">${isSelected ? '☑' : '☐'}</div>` : ''}
                <div class="flight-card-header">
                    <div class="flight-info">
                        <span class="flight-no">${flight.flight_no}</span>
                        <span class="flight-date">${formatDate(flight.date)}</span>
                    </div>
                    <span class="flight-status ${statusClass}">${getStatusText(statusInfo)}</span>
                </div>
                <div class="flight-route">
                    <div class="route-point departure">
                        <div class="airport-code">${flight.departure} ${depTerminal}</div>
                        <div class="airport-city">${getAirportCity(depAirport)}</div>
                        <div class="route-time">${flight.dep_time}</div>
                        ${depGate}
                    </div>
                    <div class="route-line">
                        <div class="route-line-graphic"></div>
                        <div class="route-duration">${duration}</div>
                        <div class="route-distance">${(flight.distance || 0).toLocaleString()} km</div>
                    </div>
                    <div class="route-point arrival">
                        <div class="airport-code">${flight.arrival} ${arrTerminal}</div>
                        <div class="airport-city">${getAirportCity(arrAirport)}</div>
                        <div class="route-time">${flight.arr_time}</div>
                    </div>
                </div>
                ${statusInfo.status === 'in_flight' ? `
                <div class="flight-progress-bar">
                    <div class="fill" style="width:${statusInfo.progress || 0}%"></div>
                </div>
                ` : ''}
                ${statusInfo.countdown ? `<div class="flight-countdown">${renderCountdown(statusInfo.countdown)}</div>` : ''}
            </div>
        `;
}

// ==================== 标签切换 ====================
function initTabs() {
    // 导航标签
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            const viewId = tab.dataset.tab + '-view';
            document.getElementById(viewId).classList.add('active');

            // 如果切换到地图，需要刷新大小
            if (tab.dataset.tab === 'map') {
                setTimeout(() => map.invalidateSize(), 100);
            }
            
            // 刷新统计
            if (tab.dataset.tab === 'stats') {
                loadStats();
            }

            // 初始化日历
            if (tab.dataset.tab === 'calendar') {
                initCalendar();
            }
        });
    });

    // 筛选标签
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderFlightsList(tab.dataset.filter);
        });
    });
}

// ==================== 模态框操作 ====================
function openAddModal() {
    currentFlightId = null;
    document.getElementById('modal-title').textContent = t('addTripTitle');
    document.getElementById('flight-form').reset();
    document.getElementById('flight-id').value = '';
    
    // 设置默认日期为今天
    document.getElementById('flight-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('flight-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('flight-modal').classList.remove('active');
    document.getElementById('dep-suggestions').classList.remove('active');
    document.getElementById('arr-suggestions').classList.remove('active');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
}

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

    const content = document.getElementById('detail-content');
    content.innerHTML = `
        <div class="detail-route">
            <div class="detail-point departure">
                <div class="detail-code">${flight.departure}</div>
                <div class="detail-city">${getAirportCity(depAirport)}</div>
                <div class="detail-time">${flight.dep_time}</div>
                ${flight.dep_terminal ? `<div class="detail-terminal">T${flight.dep_terminal}</div>` : ''}
                ${flight.dep_gate ? `<div class="detail-gate">${t('gateLabel')}: ${flight.dep_gate}</div>` : (statusInfo.status !== 'completed' ? `<div class="detail-gate pending">${t('gateLabel')}: ${t('gatePending')}</div>` : '')}
            </div>
            <div class="detail-arrow">
                ${isActive ? `<div class="flight-progress-mini">
                    <div class="progress-track">
                        <div class="progress-fill" style="width:${progress}%"></div>
                        <div class="progress-plane" style="left:${progress}%">✈</div>
                    </div>
                    <div class="progress-text">${renderCountdown(statusInfo.countdown)}</div>
                </div>` : '✈️ →'}
            </div>
            <div class="detail-point arrival">
                <div class="detail-code">${flight.arrival}</div>
                <div class="detail-city">${getAirportCity(arrAirport)}</div>
                <div class="detail-time">${flight.arr_time}</div>
                ${flight.arr_terminal ? `<div class="detail-terminal">T${flight.arr_terminal}</div>` : ''}
                ${flight.arr_gate ? `<div class="detail-gate">${t('gateLabel')}: ${flight.arr_gate}</div>` : ''}
            </div>
        </div>
        
        <div class="detail-info-grid">
            <div class="detail-info-item">
                <div class="detail-info-label">${t('flightNoLabel')}</div>
                <div class="detail-info-value">${flight.flight_no}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('dateLabel')}</div>
                <div class="detail-info-value">${formatDate(flight.date)}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('airlineLabel')}</div>
                <div class="detail-info-value">${flight.airline || '-'}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('aircraftLabel')}</div>
                <div class="detail-info-value">${flight.aircraft || '-'}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('seatLabel')}</div>
                <div class="detail-info-value">${flight.seat || '-'}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('cabinLabel')}</div>
                <div class="detail-info-value">${getCabinText(flight.class)}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('distanceLabel')}</div>
                <div class="detail-info-value">${(flight.distance || 0).toLocaleString()} km</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">${t('statusLabel')}</div>
                <div class="detail-info-value">${getStatusText(statusInfo)}</div>
            </div>
        </div>
        
        ${statusInfo.status !== 'completed' ? `
        <div class="detail-reminder">
            <div class="detail-reminder-title">${t('keyTimeline')}</div>
            <div class="detail-reminder-item">
                <span>${t('checkinOpen')}</span>
                <span>${formatDateTime(statusInfo.checkin_open)}</span>
            </div>
            <div class="detail-reminder-item">
                <span>${t('checkinClose')}</span>
                <span>${formatDateTime(statusInfo.checkin_close)}</span>
            </div>
            <div class="detail-reminder-item">
                <span>${t('boardingStart')}</span>
                <span>${formatDateTime(statusInfo.boarding_time)}</span>
            </div>
        </div>
        ` : ''}
        
        ${flight.notes ? `
        <div style="margin-top: 16px; padding: 14px; background: var(--bg-card); border-radius: 10px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">${t('noteLabel')}</div>
            <div style="font-size: 14px;">${flight.notes}</div>
        </div>
        ` : ''}
        
        <div class="weather-container" id="detail-weather"></div>
    `;

    document.getElementById('detail-modal').classList.add('active');

    // 异步加载天气
    if (statusInfo.status !== 'completed') {
        loadFlightWeather(flight).then(html => {
            const el = document.getElementById('detail-weather');
            if (el && html) el.innerHTML = html;
        });
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

    try {
        await fetch(`/api/flights/${currentFlightId}`, {
            method: 'DELETE'
        });
        closeDetailModal();
        loadFlights();
        loadStats();
    } catch (error) {
        console.error('Delete failed:', error);
        alert(t('deleteFailed'));
    }
}

// ==================== 保存航班 ====================
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
        if (flightId) {
            await fetch(`/api/flights/${flightId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flight)
            });
        } else {
            await fetch('/api/flights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flight)
            });
        }

        closeModal();
        loadFlights();
        loadStats();
    } catch (error) {
        console.error('Save failed:', error);
        alert(t('saveFailed'));
    }
}

// ==================== 机场搜索 ====================
async function searchAirport(input, suggestionsId) {
    const query = input.value.trim();
    const suggestionsEl = document.getElementById(suggestionsId);

    if (query.length < 1) {
        suggestionsEl.classList.remove('active');
        return;
    }

    try {
        const response = await fetch(`/api/airports/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();

        if (Object.keys(results).length === 0) {
            suggestionsEl.classList.remove('active');
            return;
        }

        suggestionsEl.innerHTML = Object.entries(results).slice(0, 8).map(([code, info]) => `
            <div class="suggestion-item" onclick="selectAirport('${input.id}', '${code}', '${suggestionsId}')">
                <span class="suggestion-code">${code}</span>
                <span class="suggestion-name">${getAirportCity(info)} - ${getAirportName(info)}</span>
            </div>
        `).join('');

        suggestionsEl.classList.add('active');
    } catch (error) {
        console.error('搜索失败:', error);
    }
}

function selectAirport(inputId, code, suggestionsId) {
    document.getElementById(inputId).value = code;
    document.getElementById(suggestionsId).classList.remove('active');
}

// 点击其他地方关闭建议
document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
        document.querySelectorAll('.suggestions').forEach(el => el.classList.remove('active'));
    }
});

// ==================== 航班智能查询 ====================
let lookupTimer = null;
let isLookingUp = false;

async function lookupFlight() {
    const flightNo = document.getElementById('flight-no').value.trim();
    const date = document.getElementById('flight-date').value;
    const statusEl = document.getElementById('lookup-status');
    const btnText = document.querySelector('.btn-lookup-text');
    const btnLoading = document.querySelector('.btn-lookup-loading');
    const btn = document.querySelector('.btn-lookup');
    
    if (!flightNo || flightNo.length < 3) {
        statusEl.textContent = '';
        statusEl.className = 'lookup-status';
        return;
    }
    
    if (isLookingUp) return;
    isLookingUp = true;
    
    // 显示加载状态
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    statusEl.innerHTML = '<span class="lookup-loading-text">' + t('lookupQuerying') + '</span>';
    statusEl.className = 'lookup-status info';
    
    try {
        const response = await fetch(`/api/flight/lookup?flight_no=${encodeURIComponent(flightNo)}&date=${date}`);
        const result = await response.json();
        
        if (result.success) {
            // 填充表单
            const fields = {
                'airline': result.airline,
                'departure': result.departure,
                'arrival': result.arrival,
                'dep-time': result.dep_time,
                'arr-time': result.arr_time,
                'aircraft': result.aircraft,
                'dep-terminal': result.dep_terminal,
                'arr-terminal': result.arr_terminal,
            };
            
            let filledCount = 0;
            for (const [id, value] of Object.entries(fields)) {
                if (value) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = value;
                        // 添加填充动画
                        el.classList.add('field-filled');
                        setTimeout(() => el.classList.remove('field-filled'), 800);
                        filledCount++;
                    }
                }
            }
            
            // 显示结果信息
            let sourceText = '';
            let sourceClass = 'info';
            switch (result.source) {
                case 'api':
                    sourceText = `✅ ${t('lookupApiSuccess')} (${result.api_source || 'API'})`;
                    sourceClass = 'success';
                    break;
                case 'schedule':
                    sourceText = '✅ ' + t('lookupScheduleSuccess');
                    sourceClass = 'success';
                    break;
                case 'history':
                    sourceText = '✅ ' + t('lookupHistorySuccess');
                    sourceClass = 'success';
                    break;
                default:
                    if (result.airline) {
                        sourceText = `ℹ️ ${t('lookupIdentified')} ${result.airline}`;
                        if (!result.api_configured) {
                            sourceText += ` · <a href="#" onclick="closeModal();openSettings();return false;" class="setup-api-link">${t('lookupConfigApi')}</a>`;
                        } else {
                            sourceText += ' · ' + t('lookupApiNoResult');
                        }
                    } else {
                        sourceText = '⚠️ ' + t('lookupNotFound');
                        if (!result.api_configured) {
                            sourceText += ` · <a href="#" onclick="closeModal();openSettings();return false;" class="setup-api-link">${t('lookupConfigApiLink')}</a>`;
                        }
                    }
                    break;
            }
            statusEl.innerHTML = sourceText;
            statusEl.className = 'lookup-status ' + sourceClass;
        } else {
            statusEl.textContent = '❌ ' + (result.error || '查询失败');
            statusEl.className = 'lookup-status error';
        }
    } catch (error) {
        console.error('Lookup failed:', error);
        statusEl.textContent = '❌ ' + t('lookupFailed');
        statusEl.className = 'lookup-status error';
    } finally {
        isLookingUp = false;
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// 航班号输入时: 自动识别航空公司 + 防抖自动查询
document.addEventListener('DOMContentLoaded', () => {
    const flightNoInput = document.getElementById('flight-no');
    if (flightNoInput) {
        flightNoInput.addEventListener('input', (e) => {
            const value = e.target.value.toUpperCase().replace(/[\s\-]/g, '');
            e.target.value = value;
            
            // 识别航空公司
            const match = value.match(/^([A-Z0-9]{2})/);
            if (match && airlines[match[1]]) {
                document.getElementById('airline').value = airlines[match[1]].name;
            }
            
            // 防抖自动查询: 输入停止 800ms 后自动查询
            if (lookupTimer) clearTimeout(lookupTimer);
            if (value.length >= 4) {
                lookupTimer = setTimeout(() => {
                    const dep = document.getElementById('departure').value.trim();
                    if (!dep) lookupFlight();  // 只在未填写出发机场时自动查询
                }, 800);
            }
        });
        
        // 按回车查询
        flightNoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (lookupTimer) clearTimeout(lookupTimer);
                if (e.target.value.trim().length >= 3) lookupFlight();
            }
        });
    }
    
    // 检查API配置状态
    checkApiStatus();
});

async function checkApiStatus() {
    try {
        const resp = await fetch('/api/settings');
        const settings = await resp.json();
        const badge = document.getElementById('api-badge');
        if (badge) {
            const hasApi = settings.aviationstack_key_set || settings.airlabs_key_set || settings.aerodata_key_set;
            if (hasApi) {
                badge.style.display = 'inline';
                badge.textContent = t('apiBadgeConnected');
                badge.className = 'api-badge connected';
            }
        }
    } catch (e) { /* ignore */ }
}

// ==================== 设置管理 ====================
async function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
    
    // 加载当前设置
    try {
        const resp = await fetch('/api/settings');
        const settings = await resp.json();
        
        document.getElementById('aviationstack-key').value = settings.aviationstack_key || '';
        document.getElementById('airlabs-key').value = settings.airlabs_key || '';
        document.getElementById('aerodata-key').value = settings.aerodata_key || '';
        
        // 更新状态标签
        updateApiStatusBadge('avstack', settings.aviationstack_key_set);
        updateApiStatusBadge('airlabs', settings.airlabs_key_set);
        updateApiStatusBadge('aerodata', settings.aerodata_key_set);
    } catch (e) {
        console.error('加载设置失败:', e);
    }
    
    // 加载缓存统计
    try {
        const resp = await fetch('/api/cache/stats');
        const stats = await resp.json();
        document.getElementById('cache-count').textContent = stats.total_cached || 0;
    } catch (e) { /* ignore */ }
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

function updateApiStatusBadge(prefix, isSet) {
    const el = document.getElementById(`${prefix}-status`);
    if (el) {
        el.textContent = isSet ? t('apiConfigured') : t('apiNotConfigured');
        el.className = 'api-status ' + (isSet ? 'configured' : '');
    }
}

async function saveSettings() {
    const settings = {
        aviationstack_key: document.getElementById('aviationstack-key').value.trim(),
        airlabs_key: document.getElementById('airlabs-key').value.trim(),
        aerodata_key: document.getElementById('aerodata-key').value.trim(),
    };
    
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        closeSettings();
        checkApiStatus();
    } catch (e) {
        alert(t('settingsSaveFailed'));
    }
}

async function testApi(apiName) {
    const keyMap = {
        'aviationstack': 'aviationstack-key',
        'airlabs': 'airlabs-key',
        'aerodata': 'aerodata-key'
    };
    const resultMap = {
        'aviationstack': 'avstack-result',
        'airlabs': 'airlabs-result',
        'aerodata': 'aerodata-result'
    };
    
    const key = document.getElementById(keyMap[apiName]).value.trim();
    const resultEl = document.getElementById(resultMap[apiName]);
    
    if (!key) {
        resultEl.textContent = t('testEnterKey');
        resultEl.className = 'api-test-result error';
        return;
    }
    
    resultEl.textContent = t('testing');
    resultEl.className = 'api-test-result info';
    
    try {
        const resp = await fetch('/api/settings/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api: apiName, key: key })
        });
        const result = await resp.json();
        resultEl.textContent = result.message;
        resultEl.className = 'api-test-result ' + (result.success ? 'success' : 'error');
    } catch (e) {
        resultEl.textContent = t('testFailed');
        resultEl.className = 'api-test-result error';
    }
}

// ==================== 工具函数 ====================

function getLocale() {
    return LANG_TAG[currentLang] || 'zh-CN';
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' };
    return date.toLocaleDateString(getLocale(), options);
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    return date.toLocaleString(getLocale(), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 根据当前语言获取机场城市名
function getAirportCity(airportObj) {
    if (!airportObj) return '';
    const langFieldMap = { zh: 'city', en: 'city_en', ja: 'city_ja', ko: 'city_ko', es: 'city_es' };
    const field = langFieldMap[currentLang];
    // 优先用对应语言, fallback: 非中文用英文, 最终用中文
    if (field && airportObj[field]) return airportObj[field];
    if (currentLang !== 'zh' && airportObj.city_en) return airportObj.city_en;
    return airportObj.city || airportObj.city_en || '';
}

// 根据当前语言获取机场名称
function getAirportName(airportObj) {
    if (!airportObj) return '';
    // 中文环境使用中文，其他语言优先英文
    if (currentLang === 'zh') return airportObj.name || airportObj.name_en || '';
    return airportObj.name_en || airportObj.name || '';
}

// 渲染倒计时文本 (后端返回 {key, args} 格式)
function renderCountdown(countdown) {
    if (!countdown) return '';
    if (typeof countdown === 'string') return countdown; // 兼容旧格式
    if (countdown.key) return t(countdown.key, ...(countdown.args || []));
    return '';
}

// 获取状态的本地化文本
function getStatusText(statusInfo) {
    if (!statusInfo || !statusInfo.status) return t('statusScheduled');
    const statusMap = {
        'scheduled': 'statusScheduled',
        'checkin_open': 'statusCheckin',
        'boarding': 'statusBoarding',
        'in_flight': 'statusInFlight',
        'completed': 'statusCompleted',
    };
    return t(statusMap[statusInfo.status] || 'statusUnknown');
}

// 获取舱位的本地化文本
function getCabinText(cabinValue) {
    if (!cabinValue) return '-';
    const cabinMap = {
        'economy': 'cabinEconomy',
        'premium_economy': 'cabinPremiumEconomy',
        'business': 'cabinBusiness',
        'first': 'cabinFirst',
        // 兼容旧数据中文值
        '经济舱': 'cabinEconomy',
        '超级经济舱': 'cabinPremiumEconomy',
        '公务舱': 'cabinBusiness',
        '头等舱': 'cabinFirst',
    };
    return t(cabinMap[cabinValue] || 'cabinEconomy');
}

// ==================== 日历视图 ====================
let calendarYear, calendarMonth;

function initCalendar() {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    renderCalendar();
}

function changeCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
}

function goCalendarToday() {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    renderCalendar();
}

function renderCalendar() {
    // Header label
    const label = document.getElementById('calendar-month-label');
    const dateObj = new Date(calendarYear, calendarMonth);
    label.textContent = dateObj.toLocaleDateString(getLocale(), { year: 'numeric', month: 'long' });

    // Weekday headers
    const weekdaysEl = document.getElementById('calendar-weekdays');
    const wdNames = [t('wdSun'), t('wdMon'), t('wdTue'), t('wdWed'), t('wdThu'), t('wdFri'), t('wdSat')];
    weekdaysEl.innerHTML = wdNames.map(d => `<div class="cal-weekday">${d}</div>`).join('');

    // Build flight map: date -> [flights]
    const flightMap = {};
    flights.forEach(f => {
        if (!flightMap[f.date]) flightMap[f.date] = [];
        flightMap[f.date].push(f);
    });

    // Calendar grid
    const grid = document.getElementById('calendar-grid');
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let html = '';
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayFlights = flightMap[dateStr] || [];
        const isToday = dateStr === todayStr;
        const hasFlights = dayFlights.length > 0;

        html += `<div class="cal-day${isToday ? ' today' : ''}${hasFlights ? ' has-flights' : ''}" 
                      onclick="showCalendarDayFlights('${dateStr}')">
            <span class="cal-day-num">${d}</span>
            ${hasFlights ? `<div class="cal-flight-dots">
                ${dayFlights.slice(0, 3).map(f => {
                    const cls = f.status_info?.status === 'completed' ? 'completed' : 'upcoming';
                    return `<span class="cal-dot ${cls}" title="${f.flight_no}"></span>`;
                }).join('')}
                ${dayFlights.length > 3 ? `<span class="cal-dot-more">+${dayFlights.length - 3}</span>` : ''}
            </div>` : ''}
        </div>`;
    }
    grid.innerHTML = html;
}

function showCalendarDayFlights(dateStr) {
    const container = document.getElementById('calendar-flight-detail');
    const dayFlights = flights.filter(f => f.date === dateStr);
    if (dayFlights.length === 0) {
        container.innerHTML = `<div class="cal-detail-empty">${formatDate(dateStr)} — ${t('emptyTrips')}</div>`;
        return;
    }
    container.innerHTML = `
        <div class="cal-detail-date">${formatDate(dateStr)}</div>
        ${dayFlights.map(f => {
            const dep = f.dep_airport || {};
            const arr = f.arr_airport || {};
            return `
                <div class="cal-flight-item" onclick="showFlightDetail('${f.id}')">
                    <div class="cal-flight-no">${f.flight_no}</div>
                    <div class="cal-flight-route">
                        <span>${f.departure}</span>
                        <span class="cal-arrow">→</span>
                        <span>${f.arrival}</span>
                    </div>
                    <div class="cal-flight-time">${f.dep_time} - ${f.arr_time}</div>
                    <span class="flight-status ${f.status_info?.status === 'completed' ? 'completed' : 'upcoming'}">
                        ${getStatusText(f.status_info)}
                    </span>
                </div>
            `;
        }).join('')}
    `;
}

// ==================== 天气显示 ====================
const weatherCache = {};
const WMO_WEATHER = {
    0: ['☀️', 'weatherClear'], 1: ['🌤️', 'weatherPartly'], 2: ['⛅', 'weatherCloudy'], 3: ['☁️', 'weatherOvercast'],
    45: ['🌫️', 'weatherFog'], 48: ['🌫️', 'weatherFog'],
    51: ['🌦️', 'weatherDrizzle'], 53: ['🌦️', 'weatherDrizzle'], 55: ['🌦️', 'weatherDrizzle'],
    61: ['🌧️', 'weatherRain'], 63: ['🌧️', 'weatherRain'], 65: ['🌧️', 'weatherHeavyRain'],
    71: ['🌨️', 'weatherSnow'], 73: ['🌨️', 'weatherSnow'], 75: ['🌨️', 'weatherHeavySnow'],
    80: ['🌧️', 'weatherShower'], 81: ['🌧️', 'weatherShower'], 82: ['⛈️', 'weatherStorm'],
    95: ['⛈️', 'weatherThunder'], 96: ['⛈️', 'weatherThunder'], 99: ['⛈️', 'weatherThunder'],
};

function getWeatherIcon(code) {
    return (WMO_WEATHER[code] || ['🌡️', 'weatherUnknown'])[0];
}

async function fetchWeather(lat, lon) {
    const key = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
    if (weatherCache[key]) return weatherCache[key];
    try {
        const resp = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        const result = await resp.json();
        if (result.success) {
            weatherCache[key] = result.data;
            return result.data;
        }
    } catch (e) { /* ignore */ }
    return null;
}

// ==================== 飞行进度动画增强 ====================
let animatedPlaneMarker = null;
let animationTimer = null;

function renderAnimatedFlightOnMap() {
    // 找到飞行中的航班
    const inFlightList = flights.filter(f => f.status_info?.status === 'in_flight');
    if (inFlightList.length === 0) return;

    inFlightList.forEach(flight => {
        const dep = flight.dep_airport;
        const arr = flight.arr_airport;
        if (!dep?.lat || !arr?.lat) return;
        const progress = (flight.status_info?.progress || 0) / 100;

        // 使用大圆线上的插值点
        const generator = new arc.GreatCircle(
            { x: dep.lon, y: dep.lat },
            { x: arr.lon, y: arr.lat }
        );
        const arcLine = generator.Arc(100, { offset: 10 });
        const coords = arcLine.geometries[0]?.coords || [];
        if (coords.length === 0) return;

        const idx = Math.min(Math.floor(progress * coords.length), coords.length - 1);
        const pos = coords[idx];
        const lat = pos[1], lon = pos[0];

        // 计算航向角
        const nextIdx = Math.min(idx + 1, coords.length - 1);
        const dLon = coords[nextIdx][0] - pos[0];
        const dLat = coords[nextIdx][1] - pos[1];
        const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;

        const planeIcon = L.divIcon({
            html: `<div class="animated-plane" style="transform: rotate(${angle}deg)">✈️</div>`,
            className: 'plane-icon-wrapper',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
        });

        const marker = L.marker([lat, lon], { icon: planeIcon }).addTo(map);
        marker.bindPopup(`
            <div style="text-align:center;padding:5px;">
                <div style="font-size:16px;font-weight:bold;color:#3b82f6;">${flight.flight_no}</div>
                <div style="font-size:13px;color:#666;">${flight.departure} → ${flight.arrival}</div>
                <div style="font-size:12px;color:#999;margin-top:4px;">${flight.status_info?.progress || 0}% ${renderCountdown(flight.status_info?.countdown)}</div>
            </div>
        `);
        arcLayers.push(marker);

        // 绘制虚线预测航线
        if (idx < coords.length - 1) {
            const remaining = coords.slice(idx).map(c => [c[1], c[0]]);
            const dashLine = L.polyline(remaining, {
                color: '#f59e0b',
                weight: 2,
                opacity: 0.6,
                dashArray: '8, 8',
            }).addTo(map);
            arcLayers.push(dashLine);
        }

        // 已飞过的实线（加粗高亮）
        if (idx > 0) {
            const flown = coords.slice(0, idx + 1).map(c => [c[1], c[0]]);
            const solidLine = L.polyline(flown, {
                color: '#10b981',
                weight: 3,
                opacity: 0.9,
            }).addTo(map);
            arcLayers.push(solidLine);
        }
    });
}

// ==================== 分享/导出飞行卡片 ====================
function shareFlightCard() {
    const flight = flights.find(f => f.id === currentFlightId);
    if (!flight) return;

    const dep = flight.dep_airport || {};
    const arr = flight.arr_airport || {};
    const card = document.getElementById('share-card');
    
    card.innerHTML = `
        <div class="share-card-inner">
            <div class="share-card-header">
                <span class="share-logo">✈️ SkyTrace</span>
                <span class="share-date">${formatDate(flight.date)}</span>
            </div>
            <div class="share-route">
                <div class="share-point">
                    <div class="share-code">${flight.departure}</div>
                    <div class="share-city">${getAirportCity(dep)}</div>
                    <div class="share-time">${flight.dep_time}</div>
                </div>
                <div class="share-arrow">
                    <div class="share-flight-no">${flight.flight_no}</div>
                    <div class="share-line">───── ✈ ─────</div>
                    <div class="share-distance">${(flight.distance || 0).toLocaleString()} km</div>
                </div>
                <div class="share-point">
                    <div class="share-code">${flight.arrival}</div>
                    <div class="share-city">${getAirportCity(arr)}</div>
                    <div class="share-time">${flight.arr_time}</div>
                </div>
            </div>
            <div class="share-details">
                <div class="share-detail-item">
                    <span class="share-detail-label">${t('airlineLabel')}</span>
                    <span>${flight.airline || '-'}</span>
                </div>
                <div class="share-detail-item">
                    <span class="share-detail-label">${t('aircraftLabel')}</span>
                    <span>${flight.aircraft || '-'}</span>
                </div>
                <div class="share-detail-item">
                    <span class="share-detail-label">${t('cabinLabel')}</span>
                    <span>${getCabinText(flight.class)}</span>
                </div>
                <div class="share-detail-item">
                    <span class="share-detail-label">${t('seatLabel')}</span>
                    <span>${flight.seat || '-'}</span>
                </div>
            </div>
            <div class="share-footer">
                <span>Generated by SkyTrace</span>
                <span>${new Date().toLocaleDateString(getLocale())}</span>
            </div>
        </div>
    `;

    document.getElementById('share-modal').classList.add('active');
}

function closeShareModal() {
    document.getElementById('share-modal').classList.remove('active');
}

async function downloadShareCard() {
    const card = document.getElementById('share-card');
    try {
        const canvas = await html2canvas(card, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
        });
        const link = document.createElement('a');
        link.download = `SkyTrace_${currentFlightId || 'flight'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (e) {
        console.error('Export failed:', e);
        alert('导出失败');
    }
}

async function exportAnnualReport() {
    // 生成年度飞行报告卡片
    const card = document.getElementById('share-card');
    const statsResp = await fetch('/api/stats');
    const stats = await statsResp.json();
    const fun = stats.fun_stats || {};
    const sp = fun.seat_preference || {};
    const totalSeats = sp.window + sp.aisle + sp.middle;
    const pref = sp.window >= sp.aisle && sp.window >= sp.middle ? 'window' :
                 sp.aisle >= sp.middle ? 'aisle' : 'middle';
    const prefText = totalSeats > 0 ? t('seatPref_' + pref) : '-';

    const topAirline = stats.top_airlines?.[0]?.airline || '-';
    const topRoute = stats.top_routes?.[0]?.route || '-';

    card.innerHTML = `
        <div class="share-card-inner share-report">
            <div class="share-card-header">
                <span class="share-logo">✈️ SkyTrace</span>
                <span class="share-date">${t('annualReport')} ${new Date().getFullYear()}</span>
            </div>
            <div class="report-hero">
                <div class="report-hero-value">${stats.total_flights}</div>
                <div class="report-hero-label">${t('totalFlights')}</div>
            </div>
            <div class="report-stats-row">
                <div class="report-stat">
                    <div class="report-stat-value">${stats.total_distance.toLocaleString()}</div>
                    <div class="report-stat-label">${t('totalDistance')}</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${stats.total_hours}h</div>
                    <div class="report-stat-label">${t('totalHours')}</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${stats.visited_airports}</div>
                    <div class="report-stat-label">${t('visitedAirports')}</div>
                </div>
            </div>
            <div class="report-insights">
                <div class="report-insight-item">
                    <span>🏆 ${t('topAirlines')}</span>
                    <strong>${topAirline}</strong>
                </div>
                <div class="report-insight-item">
                    <span>✈️ ${t('topRoutes')}</span>
                    <strong>${topRoute}</strong>
                </div>
                <div class="report-insight-item">
                    <span>${pref === 'window' ? '🪟' : pref === 'aisle' ? '🚶' : '💺'} ${t('favoriteSeat')}</span>
                    <strong>${prefText}</strong>
                </div>
                ${fun.earliest_flight ? `
                <div class="report-insight-item">
                    <span>🌅 ${t('earliestFlight')}</span>
                    <strong>${fun.earliest_flight.dep_time} ${fun.earliest_flight.flight_no}</strong>
                </div>` : ''}
            </div>
            <div class="share-footer">
                <span>Generated by SkyTrace</span>
                <span>${new Date().toLocaleDateString(getLocale())}</span>
            </div>
        </div>
    `;

    document.getElementById('share-modal').classList.add('active');
}

// ==================== 天气集成到航班详情 ====================
async function loadFlightWeather(flight) {
    const arr = flight.arr_airport;
    if (!arr?.lat) return '';
    const data = await fetchWeather(arr.lat, arr.lon);
    if (!data?.current) return '';
    const cur = data.current;
    const icon = getWeatherIcon(cur.weather_code);
    const temp = Math.round(cur.temperature_2m);
    return `
        <div class="weather-widget">
            <div class="weather-icon">${icon}</div>
            <div class="weather-info">
                <div class="weather-temp">${temp}°C</div>
                <div class="weather-label">${getAirportCity(arr)} ${t('weatherNow')}</div>
            </div>
        </div>
    `;
}

// ==================== 地图底部待出行预览 ====================
function renderMapUpcomingPreview() {
    const container = document.getElementById('map-upcoming-preview');
    if (!container) return;
    
    const upcoming = flights
        .filter(f => f.status_info?.status !== 'completed')
        .sort((a, b) => a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || ''));
    
    if (upcoming.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    const showFlights = upcoming.slice(0, 3);
    
    container.innerHTML = `
        <div class="upcoming-scroll">
            ${showFlights.map(f => {
                const dep = f.dep_airport || {};
                const arr = f.arr_airport || {};
                const statusInfo = f.status_info || {};
                const depTerminal = f.dep_terminal ? `T${f.dep_terminal}` : '';
                return `
                    <div class="upcoming-card" onclick="showFlightDetail('${f.id}')">
                        <div class="upcoming-header">
                            <span class="upcoming-flight-no">${f.flight_no}</span>
                            <span class="upcoming-countdown">${statusInfo.countdown ? renderCountdown(statusInfo.countdown) : formatDate(f.date)}</span>
                        </div>
                        <div class="upcoming-route">
                            <span class="upcoming-dep">${f.departure} ${depTerminal}</span>
                            <span class="upcoming-arrow">→</span>
                            <span class="upcoming-arr">${f.arrival}</span>
                        </div>
                        <div class="upcoming-time">${f.dep_time} - ${f.arr_time} · ${formatDate(f.date)}</div>
                        ${f.dep_gate ? `<div class="upcoming-gate">${t('gateLabel')}: ${f.dep_gate}</div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ==================== 联程功能 ====================
function groupConnectedFlights(flightsList) {
    const groups = {};
    const ungrouped = [];
    
    flightsList.forEach(f => {
        const gid = f.connected_group;
        if (gid) {
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(f);
        } else {
            ungrouped.push(f);
        }
    });
    
    const result = [];
    const addedGroups = new Set();
    
    flightsList.forEach(f => {
        const gid = f.connected_group;
        if (gid && !addedGroups.has(gid)) {
            addedGroups.add(gid);
            const groupFlights = groups[gid].sort((a, b) => 
                a.date.localeCompare(b.date) || (a.dep_time || '').localeCompare(b.dep_time || '')
            );
            result.push({ isGroup: true, groupId: gid, flights: groupFlights });
        } else if (!gid) {
            result.push(f);
        }
    });
    
    return result;
}

function toggleConnectMode() {
    connectMode = !connectMode;
    selectedConnectIds.clear();
    const btn = document.getElementById('btn-connect');
    
    if (connectMode) {
        btn.classList.add('active');
        // 显示确认浮窗
        let bar = document.getElementById('connect-action-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'connect-action-bar';
            bar.className = 'connect-action-bar';
            document.querySelector('.flights-container').appendChild(bar);
        }
        bar.innerHTML = `
            <span class="connect-bar-text">${t('selectFlightsHint')}</span>
            <button class="btn-primary btn-sm" onclick="confirmConnect()" id="btn-confirm-connect" disabled>${t('confirmConnect')}</button>
            <button class="btn-secondary btn-sm" onclick="toggleConnectMode()">${t('cancel')}</button>
        `;
        bar.style.display = 'flex';
    } else {
        btn.classList.remove('active');
        const bar = document.getElementById('connect-action-bar');
        if (bar) bar.style.display = 'none';
    }
    renderFlightsList();
}

function toggleConnectSelect(flightId) {
    if (selectedConnectIds.has(flightId)) {
        selectedConnectIds.delete(flightId);
    } else {
        selectedConnectIds.add(flightId);
    }
    
    const btn = document.getElementById('btn-confirm-connect');
    if (btn) btn.disabled = selectedConnectIds.size < 2;
    
    renderFlightsList();
}

async function confirmConnect() {
    if (selectedConnectIds.size < 2) return;
    try {
        await fetch('/api/flights/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flight_ids: Array.from(selectedConnectIds) })
        });
        connectMode = false;
        selectedConnectIds.clear();
        document.getElementById('btn-connect').classList.remove('active');
        const bar = document.getElementById('connect-action-bar');
        if (bar) bar.style.display = 'none';
        loadFlights();
    } catch (e) {
        console.error('Connect failed:', e);
    }
}

async function disconnectGroup(groupId) {
    if (!confirm(t('confirmDisconnect'))) return;
    try {
        await fetch('/api/flights/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId })
        });
        loadFlights();
    } catch (e) {
        console.error('Disconnect failed:', e);
    }
}

// ==================== 统计展开/折叠 ====================
function toggleWeekdayDetail(el) {
    const detail = el.querySelector('.fun-card-expand-detail');
    const hint = el.querySelector('.expand-hint');
    if (!detail) return;
    const isHidden = detail.style.display === 'none';
    detail.style.display = isHidden ? 'block' : 'none';
    if (hint) hint.textContent = isHidden ? '▲' : '▼';
}

function toggleMonthDetail(el, month) {
    const popup = el.querySelector('.month-detail-popup');
    if (!popup) return;
    // 关闭所有其他弹窗
    document.querySelectorAll('.month-detail-popup').forEach(p => {
        if (p !== popup) p.style.display = 'none';
    });
    const isHidden = popup.style.display === 'none';
    popup.style.display = isHidden ? 'block' : 'none';
}
