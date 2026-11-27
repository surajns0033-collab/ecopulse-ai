import { ChatRequestError, readChatRequest } from './chatRequest.js'

const state = {
  geminiModels: null,
  geminiModelsAt: 0,
  geminiWorkingModel: null,
  geminiDisabledUntil: 0,
  llm7DisabledUntil: 0,
  pollinationsDisabledUntil: 0,
}

const PLACEHOLDER = /^(your_|replace_with|changeme|xxx)/i

function realKey(value) {
  if (!value || typeof value !== 'string') return ''
  const key = value.trim()
  if (key.length < 12) return ''
  if (PLACEHOLDER.test(key)) return ''
  return key
}

async function fetchJson(url, options) {
  options.signal.throwIfAborted()
  const res = await fetch(url, options)
  const raw = await res.text()
  options.signal.throwIfAborted()
  let json = null
  try { json = JSON.parse(raw) } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, raw }
}

function geminiErrorText(json, raw) {
  const message = json?.error?.message
  if (message) return message
  return (raw || '').slice(0, 220)
}

function isWebUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

const MODEL_BLOCKLIST = /embedding|aqa|imagen|veo|tts|native-audio|live|image|thinking/i

async function listGeminiModels(key, signal) {
  const now = Date.now()
  if (state.geminiModels && now - state.geminiModelsAt < 10 * 60 * 1000) {
    return state.geminiModels
  }
  const { ok, json } = await fetchJson(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    { headers: { 'x-goog-api-key': key }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) },
  )
  if (!ok) {
    const msg = geminiErrorText(json, '')
    if (/API key not valid|API_KEY_INVALID|permission/i.test(msg)) {
      state.geminiDisabledUntil = now + 5 * 60 * 1000
    }
    throw new Error(`Gemini model list failed: ${msg}`)
  }
  const models = (json?.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((name) => name && !MODEL_BLOCKLIST.test(name))
    .sort((a, b) => {
      const score = (n) => (/flash(?!.*lite)/i.test(n) ? 3 : 0) + (/flash/i.test(n) ? 2 : 0) + (/pro/i.test(n) ? 1 : 0)
      return score(b) - score(a)
    })
  state.geminiModels = models
  state.geminiModelsAt = now
  return models
}

function buildGeminiContents(messages, images) {
  const out = []
  for (const message of messages || []) {
    const role = message.role === 'assistant' ? 'model' : 'user'
    const { text } = message
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].parts.push({ text })
    } else {
      out.push({ role, parts: [{ text }] })
    }
  }
  while (out.length && out[0].role !== 'user') out.shift()
  const imageParts = images.map(({ mimeType, base64 }) => ({ inlineData: { mimeType, data: base64 } }))
  if (imageParts.length) out.at(-1).parts.push(...imageParts)
  return out
}

async function callGemini(payload) {
  if (Date.now() < state.geminiDisabledUntil) throw new Error('Gemini key rejected earlier; skipping request')

  const listed = await listGeminiModels(payload.key, payload.signal)
  const models = [...new Set([payload.model, state.geminiWorkingModel, ...listed].filter(Boolean))].slice(0, 4)
  if (!models.length) throw new Error('No Gemini text model available for this key')

  let lastError = null
  for (const model of models) {
    const body = {
      systemInstruction: payload.system ? { parts: [{ text: payload.system }] } : undefined,
      contents: payload.contents,
      tools: payload.useSearch ? [{ google_search: {} }] : undefined,
      generationConfig: {
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        maxOutputTokens: Math.min(Math.max(payload.maxTokens || 600, 64), 2048),
        topP: 0.95,
      },
    }
    const { ok, status, json, raw } = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': payload.key },
        signal: payload.signal,
        body: JSON.stringify(body),
      },
    )
    if (ok) {
      const candidate = json?.candidates?.[0]
      const text = (candidate?.content?.parts || [])
        .filter((part) => !part?.thought)
        .map((p) => p?.text || '')
        .join('')
        .trim()
      if (text) {
        if (!payload.model) state.geminiWorkingModel = model
        const chunks = candidate?.groundingMetadata?.groundingChunks || []
        const sources = chunks
          .map((chunk) => chunk?.web)
          .filter((web) => isWebUrl(web?.uri))
          .map((web) => ({ title: web.title || 'Web source', url: web.uri }))
          .filter((source, index, list) => list.findIndex((item) => item.url === source.url) === index)
          .slice(0, 6)
        return { text, sources, provider: `gemini:${model}` }
      }
      lastError = new Error('Gemini returned an empty response')
      continue
    }

    const message = geminiErrorText(json, raw)
    lastError = new Error(`Gemini ${status}: ${message}`)
    if (/API key not valid|API_KEY_INVALID/i.test(message)) {
      state.geminiDisabledUntil = Date.now() + 5 * 60 * 1000
      break
    }
    if (status === 404 || /not found|not supported/i.test(message)) continue
  }
  throw lastError || new Error('Gemini request failed')
}

async function callOpenAICompatible(payload, env) {
  const openRouterKey = realKey(env.OPENROUTER_API_KEY)
  const base = (env.OPENAI_BASE_URL || (openRouterKey ? 'https://openrouter.ai/api/v1' : '')).trim().replace(/\/+$/, '')
  const key = realKey(env.OPENAI_API_KEY || env.AI_GATEWAY_KEY || openRouterKey)
  if (!base || !key) throw new Error('No OpenAI-compatible provider configured')

  const model = env.OPENAI_MODEL || env.OPENROUTER_MODEL || (openRouterKey ? 'openrouter/free' : 'gpt-4o-mini')
  const messages = [
    ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
    ...payload.messages.map((m, index) => {
      if (!payload.images.length || index !== payload.messages.length - 1) return { role: m.role, content: m.text }
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.text },
          ...payload.images.map(({ mimeType, base64 }) => ({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          })),
        ],
      }
    }),
  ]
  const { ok, status, json, raw } = await fetchJson(
    `${base}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: payload.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        max_tokens: Math.min(Math.max(payload.maxTokens || 600, 64), 2048),
      }),
    },
  )
  if (!ok) throw new Error(`OpenAI-compatible ${status}: ${geminiErrorText(json, raw)}`)
  const text = json?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI-compatible provider returned an empty response')
  return { text, provider: `openai:${model}` }
}

async function callTavilySearch(payload, env) {
  const key = realKey(env.TAVILY_API_KEY)
  if (!key) throw new Error('No Tavily search key configured')
  const query = payload.messages[0].text

  const { ok, status, json, raw } = await fetchJson(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      signal: payload.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: 5,
        include_answer: 'basic',
        include_raw_content: false,
      }),
    },
  )
  if (!ok) throw new Error(`Tavily ${status}: ${geminiErrorText(json, raw)}`)

  const results = (json?.results || []).filter((result) => isWebUrl(result?.url))
  const sources = results
    .map((result) => ({ title: result.title || 'Web source', url: result.url }))
    .slice(0, 5)
  const answer = String(json?.answer || '').trim()
  const text = answer || results.slice(0, 4).map((result) => (
    `**${result.title || 'Source'}**\n${String(result.content || '').slice(0, 500)}`
  )).join('\n\n')
  if (!text) throw new Error('Tavily returned no answer or search results')
  return { text, sources, provider: 'tavily-search' }
}

async function callLlm7(payload) {
  if (Array.isArray(payload.images) && payload.images.length) {
    throw new Error('LLM7 text model does not support images')
  }
  if (Date.now() < state.llm7DisabledUntil) throw new Error('LLM7 provider cooling down')

  const messages = [
    ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
    ...(payload.messages || []).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.text,
    })),
  ]
  const { ok, status, json, raw } = await fetchJson(
    'https://api.llm7.io/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: payload.signal,
      body: JSON.stringify({
        model: 'gpt-oss:20b',
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        // This endpoint's reasoning can consume part of the output allowance.
        max_tokens: Math.min(Math.max(payload.maxTokens || 600, 1000), 2400),
      }),
    },
  )
  if (!ok) {
    const detail = geminiErrorText(json, raw)
    if (status === 402 || status === 403 || status === 429) {
      const retryMatch = detail.match(/retry (?:after|in) (\d+)\s*(?:s|seconds?)/i)
      state.llm7DisabledUntil = Date.now() + Math.max(Number(retryMatch?.[1] || 30), 15) * 1000
    }
    throw new Error(`LLM7 ${status}: ${detail}`)
  }
  const text = json?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('LLM7 returned an empty response')
  return { text, provider: 'llm7:gpt-oss-20b' }
}

async function callPollinations(payload) {
  if (Array.isArray(payload.images) && payload.images.length) {
    // The keyless endpoint is text-only. Refuse rather than hallucinate a photo description.
    throw new Error('Keyless provider does not support images')
  }
  if (Date.now() < state.pollinationsDisabledUntil) throw new Error('Keyless provider cooling down')

  const messages = [
    ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
    ...(payload.messages || []).map((m) => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.text })),
  ]
  const { ok, status, json, raw } = await fetchJson(
    'https://text.pollinations.ai/openai',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: payload.signal,
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        max_tokens: Math.min(Math.max(payload.maxTokens || 500, 64), 1200),
      }),
    },
  )
  if (!ok) {
    const detail = geminiErrorText(json, raw)
    const retryMatch = detail.match(/retry after (\d+)\s*s/i)
    const retrySeconds = retryMatch ? Number(retryMatch[1]) : 0
    if (status === 402 || status === 429 || status === 403) {
      state.pollinationsDisabledUntil = Date.now() + Math.max(retrySeconds, 15) * 1000
    }
    throw new Error(`Keyless provider ${status}: ${detail}`)
  }
  const text = json?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Keyless provider returned an empty response')
  return { text, provider: 'pollinations' }
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(data))
}

export function makeAiHandler(env) {
  const geminiKey = realKey(env.GEMINI_API_KEY) || realKey(env.GOOGLE_API_KEY) || realKey(env.VITE_GEMINI_API_KEY)
  return async function aiHandler(req, res, next) {
    const path = (req.url || '').split('?', 1)[0]
    if (path === '/api/ai/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok' })

    if (path !== '/api/ai/chat') return next()
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJson(res, 405, { error: 'Use POST' })
    }

    let payload
    try {
      payload = await readChatRequest(req)
    } catch (err) {
      if (err instanceof ChatRequestError) return sendJson(res, err.status, { error: err.message })
      return sendJson(res, 500, { error: 'Chat request could not be processed' })
    }

    const deadline = AbortSignal.timeout(payload.timeoutMs)
    const disconnected = new AbortController()
    const signal = AbortSignal.any([deadline, disconnected.signal])
    const onClose = () => { if (!res.writableEnded) disconnected.abort() }
    res.once?.('close', onClose)
    if (res.destroyed) onClose()
    payload.signal = signal

    const providers = []
    if (payload.useSearch) providers.push(() => callTavilySearch(payload, env))
    if (geminiKey) {
      providers.push(() => callGemini({
        key: geminiKey,
        contents: buildGeminiContents(payload.messages, payload.images),
        system: payload.system,
        model: env.GEMINI_MODEL,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        signal,
        useSearch: payload.useSearch,
      }))
    }
    if (!payload.useSearch) {
      providers.push(() => callOpenAICompatible(payload, env), () => callLlm7(payload), () => callPollinations(payload))
    }

    try {
      for (const run of providers) {
        if (signal.aborted) break
        try {
          const result = await run()
          if (signal.aborted) break
          if (payload.useSearch && !result.sources?.length) continue
          return sendJson(res, 200, result)
        } catch { /* Try the next configured route within the same request budget. */ }
      }
      if (disconnected.signal.aborted) return
      if (deadline.aborted) return sendJson(res, 504, { error: 'AI request timed out' })
      return sendJson(res, 502, { error: 'AI service is temporarily unavailable' })
    } finally {
      res.off?.('close', onClose)
    }
  }
}
