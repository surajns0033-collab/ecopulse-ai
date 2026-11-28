import { logFailure } from './diagnostics.js';

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

const pending = new Map();

// Each subscriber owns its wait. Only the last cancellation stops the shared fetch.
function subscribe(entry, signal) {
  entry.waiters++;
  return new Promise((resolve, reject) => {
    let active = true;
    function finish(callback, value) {
      if (!active) return;
      active = false;
      signal?.removeEventListener('abort', cancel);
      entry.waiters--;
      callback(value);
    }
    function cancel() {
      finish(reject, signal.reason);
      if (!entry.waiters) entry.controller.abort();
    }
    signal?.addEventListener('abort', cancel, { once: true });
    entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export async function cachedRead(key, signal, read) {
  signal?.throwIfAborted();
  const hit = getCached(key);
  if (hit !== null) return hit;
  let entry = pending.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return read(controller.signal);
    }).then(value => {
      controller.signal.throwIfAborted();
      return setCached(key, value);
    }).finally(() => {
      if (pending.get(key)?.controller === controller) pending.delete(key);
    });
    entry = { controller, promise, waiters: 0 };
    pending.set(key, entry);
  }
  return subscribe(entry, signal);
}

export function recentTimestamp(timestamp, now = Date.now()) {
  const age = now - Date.parse(timestamp);
  return age >= -15 * 60000 && age <= 2 * 3600000;
}

export function toUtcIso(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr) return null;
  return timeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}Z`;
}

export function requestSignal(signal, timeout = 5000) {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}



export function coordinateKey(kind, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${kind}:${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function environmentJson(url, operation, signal, timeout) {
  try {
    const response = await fetch(url, { signal: requestSignal(signal, timeout) });
    if (response.ok) return await response.json();
    logFailure(operation, response.status);
  } catch {
    signal?.throwIfAborted();
    logFailure(operation);
  }
  return null;
}
