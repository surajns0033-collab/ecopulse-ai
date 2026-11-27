const rawWaqi = import.meta.env?.VITE_WAQI_TOKEN || '';
const rawOwm = import.meta.env?.VITE_OPENWEATHER_KEY || import.meta.env?.VITE_OPENWEATHER_API_KEY || '';

function isConfiguredKey(val) {
  return Boolean(val && !val.startsWith('your_') && !val.includes('replace_with'));
}

export const WAQI_TOKEN = isConfiguredKey(rawWaqi) ? rawWaqi : '';
export const OWM_KEY = isConfiguredKey(rawOwm) ? rawOwm : '';

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const CACHE_MAX_ENTRIES = 128;
const apiCache = new Map();

export function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  apiCache.delete(key);
  apiCache.set(key, entry);
  return entry.value;
}

export function setCached(key, value) {
  if (value != null) {
    apiCache.delete(key);
    apiCache.set(key, { value, ts: Date.now() });
    if (apiCache.size > CACHE_MAX_ENTRIES) apiCache.delete(apiCache.keys().next().value);
  }
  return value;
}

export function toUtcIso(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr) return null;
  return timeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}Z`;
}

export function requestSignal(signal, timeout = 5000) {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

// Weather code -> human readable description (WMO codes used by Open-Meteo)
