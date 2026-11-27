const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_CHARS = 1_800_000 // Up to 1.35 MB decoded. Chat resizes supported photos before upload.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const CHAT_FIELDS = new Set(['messages', 'system', 'images', 'useSearch', 'temperature', 'maxTokens', 'timeoutMs', 'mode', 'model'])

export class ChatRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireValid(condition, message) {
  if (!condition) throw new ChatRequestError(400, message)
}

function checkSize(bytes) {
  if (bytes > MAX_BODY_BYTES) throw new ChatRequestError(413, 'Chat request is too large')
}

async function readBody(req) {
  const body = req.body
  if (body !== undefined) {
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) return { body, preParsed: true }
    checkSize(Buffer.byteLength(body))
    return { body: JSON.parse(body.toString()) }
  }

  const chunks = []
  let bytes = 0
  // Leave the HTTP stream open so the caller can return a 413 instead of resetting the connection.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    checkSize(bytes)
    chunks.push(buffer)
  }
  return { body: JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) }
}

function readMessages(messages) {
  requireValid(Array.isArray(messages) && messages.length >= 1 && messages.length <= 16, 'Send between 1 and 16 messages')
  let chars = 0
  const history = messages.map((entry) => {
    const valid = record(entry) && Object.keys(entry).every((key) => key === 'role' || key === 'text') &&
      ['user', 'assistant', 'ai', 'model'].includes(entry.role) && typeof entry.text === 'string' && entry.text.length <= 16_000 && entry.text.trim()
    requireValid(valid, 'Each message needs a valid role and non-empty text')
    chars += entry.text.length
    return { role: entry.role === 'user' ? 'user' : 'assistant', text: entry.text.trim() }
  })
  requireValid(chars <= 48_000 && history.at(-1).role === 'user', 'History must fit the chat limit and end with a user message')
  return history
}

function matchesImageType(mimeType, base64) {
  // Inspect a bounded prefix, leaving the original payload intact for the provider.
  const header = Buffer.from(base64.slice(0, 512), 'base64')
  if (mimeType === 'image/png') return header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  if (mimeType === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
  if (mimeType === 'image/webp') return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
  if (header.length < 16 || header.toString('ascii', 4, 8) !== 'ftyp') return false

  // HEIC and HEIF share the ISO media container. The brand may be the major
  // brand or a compatible brand following the four-byte minor version.
  const size = header.readUInt32BE(0)
  const end = Math.min(size, header.length)
  const brands = [header.toString('ascii', 8, 12)]
  for (let i = 16; i + 4 <= end; i += 4) brands.push(header.toString('ascii', i, i + 4))
  return size >= 16 && brands.some(brand => /^(?:hei[csxm]|hev[csxm]|mif1|msf1)$/.test(brand))
}

function readImages(images) {
  requireValid(Array.isArray(images) && images.length <= 1, 'Attach at most one supported photo')
  return images.map((image) => {
    const valid = record(image) && Object.keys(image).every((key) => key === 'mimeType' || key === 'base64') && IMAGE_TYPES.has(image.mimeType) &&
      typeof image.base64 === 'string' && image.base64.length <= MAX_IMAGE_CHARS && image.base64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)
    requireValid(valid, 'Use a supported photo within the attachment size limit')
    requireValid(matchesImageType(image.mimeType, image.base64), 'The photo format must match the selected file type')
    return { mimeType: image.mimeType, base64: image.base64 }
  })
}

export async function readChatRequest(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') throw new ChatRequestError(403, 'Cross-site chat requests are not allowed')
  const mediaType = req.headers?.['content-type']?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') throw new ChatRequestError(415, 'Use application/json for chat requests')
  checkSize(Number(req.headers?.['content-length']))

  let input
  try {
    input = await readBody(req)
  } catch (err) {
    if (err instanceof ChatRequestError) throw err
    throw new ChatRequestError(400, 'Invalid JSON chat request')
  }

  const { body, preParsed } = input
  requireValid(record(body), 'Chat request must be a JSON object')
  if (body.mode === 'talk' || body.mode === 'bot') throw new ChatRequestError(410, 'Voice replies are no longer available')
  requireValid(Object.keys(body).every((key) => CHAT_FIELDS.has(key)), 'Chat request has unsupported fields')

  const { useSearch = false, system = '', temperature = 0.7, maxTokens = 600, timeoutMs = 30_000, mode = '', model = '' } = body
  requireValid(mode === '' || mode === 'chat', 'Unsupported chat mode')
  // Accept the old client field without letting a request select the upstream model.
  requireValid(typeof model === 'string' && model.length <= 128, 'Invalid model field')
  requireValid(typeof system === 'string' && system.length <= 24_000 && typeof useSearch === 'boolean', 'Invalid system or search options')
  requireValid(Number.isFinite(temperature) && temperature >= 0 && temperature <= 2, 'Invalid temperature')
  requireValid(Number.isInteger(maxTokens) && maxTokens >= 64 && maxTokens <= 2048, 'Invalid output length')
  requireValid(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, 'Invalid request timeout')
  const messages = readMessages(body.messages)
  const images = readImages(body.images === undefined ? [] : body.images)
  requireValid(!useSearch || images.length === 0, 'Search cannot include a photo')

  // Vercel can supply an already-parsed object. Check exact bytes only after bounding each field.
  if (preParsed) checkSize(Buffer.byteLength(JSON.stringify(body)))
  return {
    system: useSearch ? '' : system,
    messages: useSearch ? [messages.at(-1)] : messages,
    images, useSearch, temperature, maxTokens, timeoutMs: Math.min(timeoutMs, 40_000),
  }
}
