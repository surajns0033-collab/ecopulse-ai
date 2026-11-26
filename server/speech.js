const MODEL = 'gemini-3.8-flash-lite-tts'
const SAMPLE_RATE = 24000
const MAX_AUDIO_BYTES = SAMPLE_RATE * 2 * 30

function reject(res, status) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Natural voice is unavailable' }))
}

async function readText(req) {
  let body = req.body
  if (body == null) {
    const chunks = []
    let length = 0
    for await (const chunk of req) {
      length += Buffer.byteLength(chunk)
      if (length > 4096) return ''
      chunks.push(Buffer.from(chunk))
    }
    body = Buffer.concat(chunks)
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8')
  if (typeof body === 'string') body = JSON.parse(body)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  return text.length <= 360 && /[\p{L}\p{N}]/u.test(text) ? text.replace(/[<>]/g, '') : ''
}

async function* audioDeltas(body) {
  let pending = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    const lines = (pending + chunk).split('\n')
    pending = lines.pop()
    if (pending.length > 256000) throw new Error('Oversized speech event')
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      const event = JSON.parse(data)
      if (event.event_type === 'step.delta' && event.delta?.type === 'audio' && event.delta.data) {
        yield Buffer.from(event.delta.data, 'base64')
      }
    }
  }
}

export function makeSpeechHandler(env, request = fetch) {
  let retryAt = 0
  return async function speech(req, res, next) {
    if (req.url?.split('?')[0] !== '/api/ai/speech') return next()
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return reject(res, 405)
    if (req.headers?.['sec-fetch-site'] === 'cross-site') return reject(res, 403)

    const key = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim()
    if (!key || /^(?:your_|replace_with|changeme)/i.test(key)) return reject(res, 503)
    if (retryAt > Date.now()) {
      res.setHeader('Retry-After', String(Math.ceil((retryAt - Date.now()) / 1000)))
      return reject(res, 429)
    }

    let text
    try { text = await readText(req) } catch { return reject(res, 400) }
    if (!text) return reject(res, 400)

    const controller = new AbortController()
    const onClose = () => controller.abort()
    res.once('close', onClose)
    const timer = setTimeout(onClose, 15000)
    try {
      const upstream = await request('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
          response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: SAMPLE_RATE },
          generation_config: { speech_config: [{ voice: 'Sulafat' }] },
          store: false,
          stream: true,
        }),
      })
      if (!upstream.ok || !upstream.body) {
        if (upstream.status === 429) {
          const after = upstream.headers.get('retry-after')
          const seconds = Math.max(60, Number(after) || (Date.parse(after) - Date.now()) / 1000 || 0)
          retryAt = Date.now() + seconds * 1000
          res.setHeader('Retry-After', String(Math.ceil(seconds)))
        }
        await upstream.body?.cancel()
        return reject(res, upstream.status === 429 ? 429 : 503)
      }

      let bytes = 0
      for await (const audio of audioDeltas(upstream.body)) {
        if (controller.signal.aborted || bytes + audio.length > MAX_AUDIO_BYTES) break
        if (!audio.length) continue
        if (!bytes) {
          res.statusCode = 200
          // Headerless 24 kHz mono signed 16-bit little-endian PCM.
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('X-Content-Type-Options', 'nosniff')
        }
        bytes += audio.length
        res.write(audio)
      }
      if (res.destroyed) return
      if (!bytes) return reject(res, 503)
      res.end()
    } catch {
      if (!res.destroyed && !res.headersSent) return reject(res, 503)
      if (!res.destroyed) res.end()
    } finally {
      clearTimeout(timer)
      res.off('close', onClose)
    }
  }
}
