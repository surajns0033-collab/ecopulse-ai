export const state = {
  geminiModels: null,
  geminiModelsAt: 0,
  geminiWorkingModel: null,
  geminiDisabledUntil: 0,
  llm7DisabledUntil: 0,
  pollinationsDisabledUntil: 0,
}

const PLACEHOLDER = /^(your_|replace_with|changeme|xxx)/i

export function realKey(value) {
  if (!value || typeof value !== 'string') return ''
  const key = value.trim()
  if (key.length < 12) return ''
  if (PLACEHOLDER.test(key)) return ''
  return key
}

export async function fetchJson(url, options) {
  options.signal.throwIfAborted()
  const res = await fetch(url, options)
  const raw = await res.text()
  options.signal.throwIfAborted()
  let json = null
  try { json = JSON.parse(raw) } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, raw }
}

export function geminiErrorText(json, raw) {
  const message = json?.error?.message
  if (message) return message
  return (raw || '').slice(0, 220)
}

export function isWebUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

export function compatibleReply(json, provider) {
  const choice = json?.choices?.[0]
  const text = choice?.message?.content?.trim()
  if (!text) throw new Error('Provider returned an empty response')
  return { text, provider, ...(choice.finish_reason === 'length' ? { truncated: true } : {}) }
}
