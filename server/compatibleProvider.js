import { realKey, fetchJson, geminiErrorText, compatibleReply } from './providerHttp.js';

export function compatibleProvider(env) {
  const openRouterKey = realKey(env.OPENROUTER_API_KEY)
  const base = (env.OPENAI_BASE_URL || (openRouterKey ? 'https://openrouter.ai/api/v1' : '')).trim().replace(/\/+$/, '')
  const key = realKey(env.OPENAI_API_KEY || env.AI_GATEWAY_KEY || openRouterKey)
  if (!base || !key) return null

  const model = env.OPENAI_MODEL || env.OPENROUTER_MODEL || (openRouterKey ? 'openrouter/free' : 'gpt-4o-mini')
  return { base, key, model }
}

export async function callOpenAICompatible(payload, { base, key, model }) {
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
  return compatibleReply(json, `openai:${model}`)
}
