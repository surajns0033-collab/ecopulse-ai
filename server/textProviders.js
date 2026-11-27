import { state, realKey, fetchJson, geminiErrorText, isWebUrl, compatibleReply } from './providerHttp.js';

export async function callTavilySearch(payload, env) {
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

export async function callLlm7(payload) {
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
  return compatibleReply(json, 'llm7:gpt-oss-20b')
}

export async function callPollinations(payload) {
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
  return compatibleReply(json, 'pollinations')
}
