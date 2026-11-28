import { chatRequestSchema } from './chatValidation.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024

export class ChatRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
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
  if (body?.mode === 'talk' || body?.mode === 'bot') throw new ChatRequestError(410, 'Voice replies are no longer available')
  if (Array.isArray(body?.messages) && body.messages.length > 16) throw new ChatRequestError(400, 'Send between 1 and 16 messages')
  if (Array.isArray(body?.images) && body.images.length > 1) throw new ChatRequestError(400, 'Attach at most one supported photo')
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) throw new ChatRequestError(400, 'Invalid chat fields, options, history or photo')
  if (preParsed) checkSize(Buffer.byteLength(JSON.stringify(body)))
  for (const { mimeType, base64 } of parsed.data.images) {
    if (!matchesImageType(mimeType, base64)) throw new ChatRequestError(400, 'The photo format must match the selected file type')
  }
  return parsed.data
}
