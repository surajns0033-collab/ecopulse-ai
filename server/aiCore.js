const state = {
  geminiModels: null,
  geminiModelsAt: 0,
  geminiWorkingModel: null,
  geminiDisabledUntil: 0,
  llm7DisabledUntil: 0,
  pollinationsDisabledUntil: 0,
  lastProvider: null,
  lastError: null,
}

const PLACEHOLDER = /^(your_|replace_with|changeme|xxx)/i

function realKey(value) {
  if (!value || typeof value !== 'string') return ''
  const key = value.trim()
  if (key.length < 12) return ''
  if (PLACEHOLDER.test(key)) return ''
  return key
}

async function fetchJson(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const raw = await res.text()
    let json = null
    try { json = JSON.parse(raw) } catch { /* not json */ }
    return { ok: res.ok, status: res.status, json, raw }
  } finally {
    clearTimeout(timer)
  }
}

function geminiErrorText(json, raw) {
  const message = json?.error?.message
  if (message) return message
  return (raw || '').slice(0, 220)
}

const MODEL_BLOCKLIST = /embedding|aqa|imagen|veo|tts|native-audio|live|image|thinking/i

async function listGeminiModels(key) {
  const now = Date.now()
  if (state.geminiModels && now - state.geminiModelsAt < 10 * 60 * 1000) {
    return state.geminiModels
  }
  const { ok, json } = await fetchJson(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    { headers: { 'x-goog-api-key': key } },
    15000
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
    const role = message.role === 'assistant' || message.role === 'model' || message.role === 'ai' ? 'model' : 'user'
    const text = typeof message.text === 'string' ? message.text.trim() : ''
    if (!text) continue
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].parts.push({ text })
    } else {
      out.push({ role, parts: [{ text }] })
    }
  }
  while (out.length && out[0].role !== 'user') out.shift()
  if (!out.length) out.push({ role: 'user', parts: [{ text: 'Hello' }] })

  const imageParts = (images || [])
    .filter((img) => img && img.base64)
    .map((img) => ({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: String(img.base64).replace(/^data:[^,]+,/, '') } }))
  if (imageParts.length) out[out.length - 1].parts.push(...imageParts)
  return out
}

async function callGemini(payload) {
  if (Date.now() < state.geminiDisabledUntil) throw new Error('Gemini key rejected earlier â€” skipped')

  const candidates = [state.geminiWorkingModel, payload.model].filter(Boolean)
  if (!state.geminiModels) {
    const listed = await listGeminiModels(payload.key)
    candidates.push(...listed)
  } else {
    candidates.push(...state.geminiModels)
  }
  const models = [...new Set(candidates)].slice(0, 4)
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
        body: JSON.stringify(body),
      },
      payload.timeoutMs || 45000
    )
    if (ok) {
      const candidate = json?.candidates?.[0]
      const text = (candidate?.content?.parts || [])
        .map((p) => p?.text || '')
        .join('')
        .trim()
      if (text) {
        state.geminiWorkingModel = model
        const chunks = candidate?.groundingMetadata?.groundingChunks || []
        const sources = chunks
          .map((chunk) => chunk?.web)
          .filter((web) => web?.uri)
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
  const hasImages = Array.isArray(payload.images) && payload.images.length > 0
  const messages = [
    ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
    ...(payload.messages || []).map((m) => {
      const role = m.role === 'ai' ? 'assistant' : m.role
      if (!hasImages || role !== 'user') return { role, content: m.text }
      return {
        role,
        content: [
          { type: 'text', text: m.text },
          ...payload.images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${String(img.base64).replace(/^data:[^,]+,/, '')}` },
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
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        max_tokens: Math.min(Math.max(payload.maxTokens || 600, 64), 2048),
      }),
    },
    payload.timeoutMs || 45000
  )
  if (!ok) throw new Error(`OpenAI-compatible ${status}: ${geminiErrorText(json, raw)}`)
  const text = json?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI-compatible provider returned an empty response')
  return { text, provider: `openai:${model}` }
}

async function callTavilySearch(payload, env) {
  const key = realKey(env.TAVILY_API_KEY)
  if (!key) throw new Error('No Tavily search key configured')
  const query = [...(payload.messages || [])].reverse().find((message) => message.role !== 'assistant')?.text?.trim()
  if (!query) throw new Error('No search query supplied')

  const { ok, status, json, raw } = await fetchJson(
    'https://api.tavily.com/search',
    {
      method: 'POST',
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
    payload.timeoutMs || 45000
  )
  if (!ok) throw new Error(`Tavily ${status}: ${geminiErrorText(json, raw)}`)

  const sources = (json?.results || [])
    .filter((result) => result?.url)
    .map((result) => ({ title: result.title || 'Web source', url: result.url }))
    .slice(0, 5)
  const answer = String(json?.answer || '').trim()
  const text = answer || (json?.results || []).slice(0, 4).map((result) => (
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
      body: JSON.stringify({
        model: 'gpt-oss:20b',
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        // This endpoint's reasoning can consume part of the output allowance.
        max_tokens: Math.min(Math.max(payload.maxTokens || 600, 1000), 2400),
      }),
    },
    payload.timeoutMs || 45000
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
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
        max_tokens: Math.min(Math.max(payload.maxTokens || 500, 64), 1200),
      }),
    },
    payload.timeoutMs || 40000
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

export function makeAiHandler(env) {
  return async function aiHandler(req, res, next) {
    const url = req.url || ''
    if (!url.startsWith('/api/ai/')) return next()

    if (url.startsWith('/api/ai/health') && req.method === 'GET') {
      const geminiKey = realKey(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GOOGLE_API_KEY)
      const openaiReady = Boolean(
        (realKey(env.OPENAI_API_KEY) && (env.OPENAI_BASE_URL || '').trim()) || realKey(env.OPENROUTER_API_KEY)
      )
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        geminiKey: Boolean(geminiKey),
        geminiDisabled: Date.now() < state.geminiDisabledUntil,
        geminiModel: state.geminiWorkingModel,
        openaiCompatible: openaiReady,
        openRouterFree: Boolean(realKey(env.OPENROUTER_API_KEY)),
        tavilySearch: Boolean(realKey(env.TAVILY_API_KEY)),
        keyless: Date.now() >= state.llm7DisabledUntil || Date.now() >= state.pollinationsDisabledUntil,
        keylessLlm7: Date.now() >= state.llm7DisabledUntil,
        keylessPollinations: Date.now() >= state.pollinationsDisabledUntil,
        lastProvider: state.lastProvider,
        lastError: state.lastError,
      }))
      return
    }

    if (!url.startsWith('/api/ai/chat')) return next()
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ error: 'Use POST' }))
      return
    }

    let payload
    try {
      payload = await readJsonBody(req)
    } catch (err) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Bad request body: ${err.message}` }))
      return
    }

    const geminiKey = realKey(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GOOGLE_API_KEY)
    const attempts = []

    const providers = []
    if (payload.useSearch) {
      providers.push({ name: 'tavily-search', run: () => callTavilySearch(payload, env) })
    }
    if (geminiKey) {
      providers.push({
        name: 'gemini',
        run: () => callGemini({
          key: geminiKey,
          contents: buildGeminiContents(payload.messages, payload.images),
          system: payload.system,
          model: env.GEMINI_MODEL,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
          timeoutMs: payload.timeoutMs,
          useSearch: payload.useSearch,
        }),
      })
    }
    if (!payload.useSearch) {
      providers.push({ name: 'openai-compatible', run: () => callOpenAICompatible(payload, env) })
      providers.push({ name: 'keyless-llm7', run: () => callLlm7(payload) })
      providers.push({ name: 'keyless-pollinations', run: () => callPollinations(payload) })
    }

    for (const provider of providers) {
      try {
        const result = await provider.run()
        state.lastProvider = result.provider
        state.lastError = null
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ...result, attempts }))
        return
      } catch (err) {
        attempts.push({ provider: provider.name, error: err.message })
      }
    }

    state.lastProvider = null
    state.lastError = attempts.map((a) => `${a.provider}: ${a.error}`).join(' | ')
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: 'All AI providers failed',
      attempts,
      hint: 'Add a valid GEMINI_API_KEY (https://aistudio.google.com/apikey) to .env and restart the dev server.',
    }))
  }
}

function readJsonBody(req) {
  if (req.body != null) {
    if (typeof req.body === 'object') return Promise.resolve(req.body)
    try { return Promise.resolve(JSON.parse(String(req.body))) } catch (err) { return Promise.reject(err) }
  }
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}


