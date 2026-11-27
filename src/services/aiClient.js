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

/**
 * Ask the AI for a text completion.
 * @returns {Promise<{text: string, provider: string}|null>} null when no model is reachable.
 */
export async function requestAI({
  system = '',
  messages = [],
  images = [],
  temperature = 0.7,
  maxTokens = 600,
  timeoutMs = 30000,
  useSearch = false,
  signal,
} = {}) {
  const cleanMessages = (messages || [])
    .map((m) => ({ role: m.role === 'assistant' || m.role === 'ai' ? 'assistant' : 'user', text: (m.text || '').trim() }))
    .filter((m) => m.text);

  if (!cleanMessages.length || signal?.aborted) return null;

  const payload = {
    system,
    messages: cleanMessages,
    images,
    temperature,
    maxTokens,
    timeoutMs,
    useSearch,
  };

  // All credentials and provider fallbacks stay in the server proxy.
  if (Date.now() > state.proxyUnavailableUntil) {
    try {
      const { ok, status, json } = await postJson(PROXY, payload, Math.min(timeoutMs, 40_000) + 5_000, signal);
      if (ok && json?.text) {
        state.lastProvider = json.provider || 'proxy';
        return { text: json.text, sources: json.sources || [], provider: state.lastProvider };
      }
      if (status === 404 || status === 405) {
        // Static hosting / proxy not present — skip it for a while.
        state.proxyUnavailableUntil = Date.now() + 5 * 60 * 1000;
        state.proxyUnavailableReason = 'AI endpoint not available on this host';
      } else {
        state.lastError = json?.error || `AI endpoint returned HTTP ${status}`;
      }
    } catch (err) {
      if (signal?.aborted) return null;
      state.lastError = String(err?.message || err);
    }
  }

  return null;
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
