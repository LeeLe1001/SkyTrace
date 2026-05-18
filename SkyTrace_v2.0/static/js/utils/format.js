/**
 * SkyTrace v2.0 — 格式化工具
 */

/** 格式化航站楼显示 */
export function formatTerminal(terminal) {
  if (!terminal) return '';
  if (terminal === 'MAIN') return 'MAIN';
  if (/^\d+$/.test(terminal)) return `T${terminal}`;
  if (/^[A-E]$/i.test(terminal)) return `Terminal ${terminal.toUpperCase()}`;
  return terminal;
}

/** 格式化飞行时长 */
export function formatDuration(flight) {
  if (!flight.dep_time || !flight.arr_time) return '';
  try {
    const [dh, dm] = flight.dep_time.split(':').map(Number);
    const [ah, am] = flight.arr_time.split(':').map(Number);
    let minutes = (ah * 60 + am) - (dh * 60 + dm);
    const offset = parseInt(flight.arr_day_offset) || 0;
    if (offset) minutes += offset * 24 * 60;
    if (minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  } catch (e) {
    return '';
  }
}

/** 格式化到达时间 (含跨日标识) */
export function formatArrTime(flight) {
  if (!flight.arr_time) return '';
  const offset = getDayOffset(flight);
  if (offset && offset !== 0) {
    const sign = offset > 0 ? '+' : '';
    return `${flight.arr_time}<sup class="next-day-sup">${sign}${offset}</sup>`;
  }
  return flight.arr_time;
}

/** 获取日期偏移 */
export function getDayOffset(flight) {
  if (flight.arr_day_offset !== undefined && flight.arr_day_offset !== null)
    return parseInt(flight.arr_day_offset) || 0;
  if (flight.arr_next_day) return 1;
  return 0;
}

/** 格式化日期 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch (e) {
    return dateStr;
  }
}

/** 标准化航班号 */
export function normalizeFlightNo(flightNo) {
  return (flightNo || '').replace(/[\s\-]/g, '').toUpperCase();
}

/** 提取航空公司代码 */
export function extractAirlineCode(flightNo) {
  const m = normalizeFlightNo(flightNo).match(/^([A-Z0-9]{2})/);
  return m ? m[1] : '';
}
