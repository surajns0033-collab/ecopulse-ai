// AI client — single entry point for every model call in the app.
//
// Priority:
//   1. Server-side proxy  /api/ai/chat   (Gemini → OpenAI-compatible → keyless)
//   2. Direct Gemini call from the browser using VITE_GEMINI_API_KEY
//   3. null  → callers fall back to their verified rule-based answer
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
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, json, raw };
  } finally {
    t.done();
  }
}

/** Direct browser → Gemini REST call (works even when the dev proxy is absent). */
async function callGeminiDirect({ system, messages, images, temperature, maxTokens, timeoutMs, useSearch, model, signal }) {
  const key = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  if (!key || /^your_/i.test(key)) throw new Error('No browser Gemini key configured');

  const contents = [];
  for (const message of messages || []) {
    const role = message.role === 'ai' || message.role === 'assistant' ? 'model' : 'user';
    const text = (message.text || '').trim();
    if (!text) continue;
    if (contents.length && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Hello' }] });

  const imageParts = (images || [])
    .filter((img) => img?.base64)
    .map((img) => ({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: String(img.base64).replace(/^data:[^,]+,/, '') } }));
  if (imageParts.length) contents[contents.length - 1].parts.push(...imageParts);

  const body = {
    contents,
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      maxOutputTokens: Math.min(maxTokens || 600, 2048),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (useSearch) body.tools = [{ google_search: {} }];

  const models = [
    model,
    import.meta.env.VITE_GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter(Boolean);

  let lastError = null;
  for (const model of models) {
    const { ok, status, json, raw } = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      body,
      timeoutMs || 20000,
      signal,
    );
    if (ok) {
      const candidate = json?.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p?.text || '').join('').trim();
      if (text) {
        const sources = (candidate?.groundingMetadata?.groundingChunks || [])
          .map((chunk) => chunk?.web)
          .filter((web) => web?.uri)
          .map((web) => ({ title: web.title || 'Web source', url: web.uri }))
          .filter((source, index, list) => list.findIndex((item) => item.url === source.url) === index)
          .slice(0, 6);
        return { text, sources, provider: `gemini-direct:${model}` };
      }
      lastError = new Error('Gemini returned an empty response');
      continue;
    }
    const message = json?.error?.message || raw.slice(0, 200);
    lastError = new Error(`Gemini ${status}: ${message}`);
    if (/API key not valid|API_KEY_INVALID/i.test(message)) break;
  }
  throw lastError || new Error('Gemini request failed');
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
  mode,
  model = '',
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
    mode,
    model,
  };

  // 1. Server proxy (preferred — keeps keys private, handles CORS & provider fallback)
  if (Date.now() > state.proxyUnavailableUntil) {
    try {
      const { ok, status, json, raw } = await postJson(PROXY, payload, timeoutMs + 10000, signal);
      if (ok && json?.text) {
        state.lastProvider = json.provider || 'proxy';
        return { text: json.text, sources: json.sources || [], provider: state.lastProvider };
      }
      if (status === 404 || status === 405) {
        // Static hosting / proxy not present — skip it for a while.
        state.proxyUnavailableUntil = Date.now() + 5 * 60 * 1000;
        state.proxyUnavailableReason = 'AI endpoint not available on this host';
      } else {
        state.lastError = (json?.attempts || []).map((a) => `${a.provider}: ${a.error}`).join(' | ') || json?.error || raw.slice(0, 200);
      }
    } catch (err) {
      if (signal?.aborted) return null;
      state.lastError = String(err?.message || err);
    }
  }

  // 2. Direct Gemini from the browser (only if a real key is present)
  if (signal?.aborted || mode === 'talk') return null;
  try {
    const direct = await callGeminiDirect({ system, messages: cleanMessages, images, temperature, maxTokens, timeoutMs, useSearch, model, signal });
    state.lastProvider = direct.provider;
    return direct;
  } catch (err) {
    if (!/No browser Gemini key/i.test(err.message)) {
      state.lastError = [state.lastError, err.message].filter(Boolean).join(' | ');
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
