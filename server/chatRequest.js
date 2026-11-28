import { supportedDimensions } from '../src/services/imageDimensions.js';
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

function validateHeaders(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') throw new ChatRequestError(403, 'Cross-site chat requests are not allowed')
  const mediaType = req.headers?.['content-type']?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') throw new ChatRequestError(415, 'Use application/json for chat requests')
  checkSize(Number(req.headers?.['content-length']))
}

async function parseBody(req) {
  try {
    return await readBody(req)
  } catch (err) {
    if (err instanceof ChatRequestError) throw err
    throw new ChatRequestError(400, 'Invalid JSON chat request')
  }
}

function validateFields(body) {
  if (body?.mode === 'talk' || body?.mode === 'bot') throw new ChatRequestError(410, 'Voice replies are no longer available')
  if (Array.isArray(body?.messages) && body.messages.length > 16) throw new ChatRequestError(400, 'Send between 1 and 16 messages')
  if (Array.isArray(body?.images) && body.images.length > 1) throw new ChatRequestError(400, 'Attach at most one supported photo')
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) throw new ChatRequestError(400, 'Invalid chat fields, options, history or photo')
  return parsed.data
}

export async function readChatRequest(req) {
  validateHeaders(req)
  const { body, preParsed } = await parseBody(req)
  const data = validateFields(body)
  if (preParsed) checkSize(Buffer.byteLength(JSON.stringify(body)))
  for (const image of data.images) {
    if (!supportedDimensions(Buffer.from(image.base64, 'base64'), image.mimeType)) {
      throw new ChatRequestError(400, 'The photo format or dimensions are unsupported')
    }
  }
  return data
}
