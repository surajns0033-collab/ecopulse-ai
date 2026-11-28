// AI client — single entry point for every model call in the app.
//
// The server-side proxy owns model credentials. If it is unavailable,
// callers use the verified rule-based answer rather than a browser API key.
//
// Nothing here invents data. If no model is reachable, callers must degrade
// gracefully with live API data / official contacts instead of guessing.

const PROXY = '/api/ai/chat';
const HEALTH = '/api/ai/health';

const state = {
  proxyUnavailableUntil: 0,
  proxyUnavailableReason: '',
  lastProvider: null,
  lastError: '',
};

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function postJson(url, body, timeoutMs, signal) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([t.signal, signal]) : t.signal,
    });
    let json = null;
    try { json = await res.json(); } catch { /* The host may return an HTML error page. */ }
    return { ok: res.ok, status: res.status, json };
  } finally {
    t.done();
  }
}

function normalizeMessages(messages) {
  return (messages || []).map(message => ({
    role: message.role === 'assistant' || message.role === 'ai' ? 'assistant' : 'user',
    text: typeof message.text === 'string' ? message.text.trim() : '',
  })).filter(message => message.text);
}

function readProxyReply({ ok, status, json }) {
  if (ok && typeof json?.text === 'string' && json.text.trim()) {
    state.lastProvider = typeof json.provider === 'string' ? json.provider : 'proxy';
    return { text: json.text, sources: Array.isArray(json.sources) ? json.sources : [], provider: state.lastProvider,
      ...(json.truncated === true ? { truncated: true } : {}) };
  }
  if (status === 404 || status === 405) {
    state.proxyUnavailableUntil = Date.now() + 5 * 60 * 1000;
    state.proxyUnavailableReason = 'AI endpoint not available on this host';
  } else {
    state.lastError = typeof json?.error === 'string' ? json.error : 'AI endpoint returned HTTP ' + status;
  }
  return null;
}

/** Ask the server-side proxy for a completion under the caller's deadline. */
export async function requestAI({ system = '', messages = [], images = [], temperature = 0.7, maxTokens = 600,
  timeoutMs = 30000, useSearch = false, signal } = {}) {
  const cleanMessages = normalizeMessages(messages);
  if (!cleanMessages.length || signal?.aborted || Date.now() <= state.proxyUnavailableUntil) return null;
  const payload = { system, messages: cleanMessages, images, temperature, maxTokens, timeoutMs, useSearch };
  try {
    return readProxyReply(await postJson(PROXY, payload, Math.min(timeoutMs, 40000) + 5000, signal));
  } catch (error) {
    if (!signal?.aborted) state.lastError = String(error?.message || error);
    return null;
  }
}

export async function getAIHealth() {
  try {
    const res = await fetch(HEALTH, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getAIState() {
  return { ...state };
}
