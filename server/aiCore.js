import { logFailure } from '../src/services/diagnostics.js';
import { ChatRequestError, readChatRequest } from './chatRequest.js';
import { state, realKey } from './providerHttp.js';
import { callGemini } from './geminiProvider.js';
import { compatibleProvider, callOpenAICompatible } from './compatibleProvider.js';
import { callTavilySearch, callLlm7, callPollinations } from './textProviders.js';

function sendJson(res, status, data) {
  if (status >= 500) logFailure(status === 500 ? 'chat.request' : 'chat.provider', status)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(data))
}

function providerRoutes(payload, env, key) {
  const routes = []
  if (payload.useSearch && realKey(env.TAVILY_API_KEY)) routes.push(request => callTavilySearch(request, env))
  if (key && Date.now() >= state.geminiDisabledUntil) routes.push(request => callGemini({ ...request, key, model: env.GEMINI_MODEL }))
  if (payload.useSearch) return routes

  const compatible = compatibleProvider(env)
  if (compatible) routes.push(request => callOpenAICompatible(request, compatible))
  if (!payload.images.length) {
    if (Date.now() >= state.llm7DisabledUntil) routes.push(callLlm7)
    if (Date.now() >= state.pollinationsDisabledUntil) routes.push(callPollinations)
  }
  return routes
}

async function firstAvailableReply(payload, routes, shared, endTime) {
  for (const [index, run] of routes.entries()) {
    if (shared.aborted) break
    const remaining = Math.floor(endTime - performance.now())
    if (remaining <= 0) break
    // Reserve part of the remaining request time for another eligible route.
    const attempt = index === routes.length - 1 ? shared : AbortSignal.any([
      shared, AbortSignal.timeout(Math.max(1, Math.floor(remaining * 0.7))),
    ])
    try {
      const result = await run({ ...payload, signal: attempt })
      if (!attempt.aborted && (!payload.useSearch || result.sources?.length)) return result
    } catch { /* Continue within the same request deadline. */ }
  }
  return null
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
    const endTime = performance.now() + payload.timeoutMs
    try {
      const result = await firstAvailableReply(payload, providerRoutes(payload, env, geminiKey), signal, endTime)
      if (result && !signal.aborted) return sendJson(res, 200, result)
      if (disconnected.signal.aborted) return
      if (deadline.aborted || performance.now() >= endTime) return sendJson(res, 504, { error: 'AI request timed out' })
      return sendJson(res, 502, { error: 'AI service is temporarily unavailable' })
    } finally {
      res.off?.('close', onClose)
    }
  }
}
