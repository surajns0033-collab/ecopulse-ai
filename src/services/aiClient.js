import { logFailure } from './diagnostics.js';

// Every model call goes through the credentialed server proxy.
const PROXY = '/api/ai/chat';
let proxyUnavailableUntil = 0;

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
    const provider = typeof json.provider === 'string' ? json.provider : 'proxy';
    return { text: json.text, sources: Array.isArray(json.sources) ? json.sources : [], provider,
      ...(json.truncated === true ? { truncated: true } : {}) };
  }
  if (status === 404 || status === 405) {
    proxyUnavailableUntil = Date.now() + 5 * 60 * 1000;
  } else {
    logFailure('chat.provider', status);
  }
  return null;
}

/** Ask the server-side proxy for a completion under the caller's deadline. */
export async function requestAI({ system = '', messages = [], images = [], temperature = 0.7, maxTokens = 600,
  timeoutMs = 30000, useSearch = false, signal } = {}) {
  const cleanMessages = normalizeMessages(messages);
  if (!cleanMessages.length || signal?.aborted || Date.now() <= proxyUnavailableUntil) return null;
  const payload = { system, messages: cleanMessages, images, temperature, maxTokens, timeoutMs, useSearch };
  try {
    return readProxyReply(await postJson(PROXY, payload, Math.min(timeoutMs, 40000) + 5000, signal));
  } catch {
    if (!signal?.aborted) logFailure('chat.request');
    return null;
  }
}
