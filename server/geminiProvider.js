import { state, fetchJson, geminiErrorText, isWebUrl } from './providerHttp.js';

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

async function* geminiCandidates(payload) {
  const seen = new Set()
  for (const model of [payload.model, state.geminiWorkingModel]) {
    if (!model || seen.has(model)) continue
    seen.add(model)
    yield model
  }
  // Discover alternatives only if the configured or last working model could
  // not answer. A slow catalogue must not delay an already known model.
  const listed = await listGeminiModels(payload.key, payload.signal)
  for (const model of listed) {
    if (seen.has(model)) continue
    if (seen.size >= 4) return
    seen.add(model)
    yield model
  }
}

function geminiResult(candidate, model) {
  const text = (candidate?.content?.parts || []).filter(part => !part?.thought)
    .map(part => part?.text || '').join('').trim()
  if (!text) return null
  const sources = []
  const seen = new Set()
  for (const { web } of candidate.groundingMetadata?.groundingChunks || []) {
    if (!isWebUrl(web?.uri) || seen.has(web.uri)) continue
    seen.add(web.uri)
    sources.push({ title: web.title || 'Web source', url: web.uri })
    if (sources.length === 6) break
  }
  return { text, sources, provider: 'gemini:' + model, ...(candidate.finishReason === 'MAX_TOKENS' ? { truncated: true } : {}) }
}

export async function callGemini(payload) {
  if (Date.now() < state.geminiDisabledUntil) throw new Error('Gemini key rejected earlier; skipping request')
  const body = JSON.stringify({
    systemInstruction: payload.system ? { parts: [{ text: payload.system }] } : undefined,
    contents: buildGeminiContents(payload.messages, payload.images),
    tools: payload.useSearch ? [{ google_search: {} }] : undefined,
    generationConfig: { temperature: payload.temperature, maxOutputTokens: payload.maxTokens, topP: 0.95 },
  })
  let lastError
  for await (const model of geminiCandidates(payload)) {
    const { ok, status, json, raw } = await fetchJson(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': payload.key }, signal: payload.signal, body },
    )
    if (ok) {
      const result = geminiResult(json?.candidates?.[0], model)
      if (result) {
        if (!payload.model) state.geminiWorkingModel = model
        return result
      }
      lastError = new Error('Gemini returned an empty response')
      continue
    }
    const message = geminiErrorText(json, raw)
    lastError = new Error('Gemini ' + status + ': ' + message)
    if (/API key not valid|API_KEY_INVALID/i.test(message)) {
      state.geminiDisabledUntil = Date.now() + 5 * 60 * 1000
      break
    }
  }
  throw lastError || new Error('No Gemini model returned an answer')
}
