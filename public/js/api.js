import { API_BASE } from './config.js';

const TOKEN_KEY = 'tt_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Keine Verbindung zum Server. Bitte prüfe dein Internet.', 0, 'network');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* leere Antwort */
  }
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(data.message || 'Das hat leider nicht geklappt.', res.status, data.error);
  }
  return data;
}

// Letzte Abfahrtstafel offline verfügbar halten (FR-4 / PRD 12).
export async function cachedGet(path) {
  const key = `tt_cache:${path}`;
  try {
    const data = await api('GET', path);
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
    return { data, offline: false };
  } catch (e) {
    if (e.code === 'network') {
      const raw = localStorage.getItem(key);
      if (raw) {
        const { at, data } = JSON.parse(raw);
        return { data, offline: true, at };
      }
    }
    throw e;
  }
}
