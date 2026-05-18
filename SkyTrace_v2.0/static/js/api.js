/**
 * SkyTrace v2.0 — API 调用封装
 *
 * 用法:
 *   import { api } from './api.js';
 *   const flights = await api.getFlights();
 */
import { store } from './store.js';

const BASE = '';

async function request(path, options = {}) {
  const url = BASE + path;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  try {
    const resp = await fetch(url, config);
    if (resp.status === 401) {
      const data = await resp.json().catch(() => ({}));
      if (data.auth_required) {
        store.set('authNeeded', true);
      }
      throw new ApiError(resp.status, data.error || 'Authentication required');
    }
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new ApiError(resp.status, data.error || `HTTP ${resp.status}`);
    }
    return await resp.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    store.set('offline', true);
    throw new ApiError(0, 'Network error');
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export const api = {
  // ---- Auth ----
  getAuthState: () => request('/api/auth/state'),
  setup: (username, password, displayName) =>
    request('/api/setup', { method: 'POST', body: JSON.stringify({ username, password, display_name: displayName }) }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (password) =>
    request('/api/auth/password', { method: 'PUT', body: JSON.stringify({ password }) }),

  // ---- Flights ----
  getFlights: () => request('/api/flights'),
  addFlight: (data) => request('/api/flights', { method: 'POST', body: JSON.stringify(data) }),
  updateFlight: (id, data) => request(`/api/flights/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFlight: (id) => request(`/api/flights/${id}`, { method: 'DELETE' }),
  connectFlights: (flightIds) =>
    request('/api/flights/connect', { method: 'POST', body: JSON.stringify({ flight_ids: flightIds }) }),
  disconnectFlights: (flightIds) =>
    request('/api/flights/disconnect', { method: 'POST', body: JSON.stringify({ flight_ids: flightIds }) }),

  // ---- Lookup ----
  lookupFlight: (flightNo, date) =>
    request(`/api/flight/lookup?flight_no=${encodeURIComponent(flightNo)}&date=${encodeURIComponent(date || '')}`),
  getFlightStatus: (flightNo, date) =>
    request(`/api/flight/status?flight_no=${encodeURIComponent(flightNo)}&date=${encodeURIComponent(date || '')}`),

  // ---- Settings ----
  getSettings: () => request('/api/settings'),
  saveSettings: (data) => request('/api/settings', { method: 'POST', body: JSON.stringify(data) }),
  testApiConnection: (apiName, key) =>
    request('/api/settings/test', { method: 'POST', body: JSON.stringify({ api: apiName, key }) }),

  // ---- Data ----
  getAirports: () => request('/api/airports'),
  searchAirports: (q) => request(`/api/airports/search?q=${encodeURIComponent(q)}`),
  getAirlines: () => request('/api/airlines'),

  // ---- Stats ----
  getStats: (year) => request(`/api/stats${year ? '?year=' + year : ''}`),

  // ---- Backup ----
  testBackup: (token, repo) =>
    request('/api/backup/github/test', { method: 'POST', body: JSON.stringify({ token, repo }) }),
  pushBackup: () => request('/api/backup/github/push', { method: 'POST' }),
  pullBackup: () => request('/api/backup/github/pull', { method: 'POST' }),

  // ---- Admin ----
  getUsers: () => request('/api/admin/users'),
  createUser: (data) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, password) =>
    request(`/api/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
};

export { ApiError };
export default api;
