import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSpeechHandler } from '../server/speech.js';

class Reply extends EventEmitter {
  headers = {};
  chunks = [];
  headersSent = false;
  setHeader(name, value) { this.headers[name] = value; }
  write(value) { this.headersSent = true; this.chunks.push(Buffer.from(value)); }
  end(value) { if (value) this.write(value); }
}

const config = { GEMINI_API_KEY: 'test-server-only-key' };
const req = (text, options = {}) => ({ method: 'POST', url: '/api/ai/speech', body: { text }, ...options });
const notFound = () => assert.fail('Handler did not handle speech');

test('only the short reply goes to the free-tier speech model; split events stream as PCM', async () => {
  const pcm = Buffer.of(3, 14, 28, 1);
  const event = `data: ${JSON.stringify({ event_type: 'step.delta', delta: { type: 'audio', data: pcm.toString('base64') } })}\r\n\r\n`;
  const handler = makeSpeechHandler(config, async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/interactions$/);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-3.8-flash-lite-tts');
    assert.deepEqual(body.input, [{ type: 'user_input', content: [{ type: 'text', text: 'Which city should I check?' }] }]);
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(event.slice(0, 20)));
      controller.enqueue(encoder.encode(event.slice(20)));
      controller.close();
    } }));
  });
  const response = new Reply();
  await handler(req('Which city should I check?'), response, notFound);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Buffer.concat(response.chunks), pcm);
});

test('malformed, oversized or cross-site speech requests do not call the provider', async () => {
  const handler = makeSpeechHandler(config, () => assert.fail('Should not call speech provider'));
  for (const [request, status] of [
    [req('…'), 400], [req('a'.repeat(361)), 400], [req('Hi', { method: 'GET' }), 405],
    [req('Hi', { headers: { 'sec-fetch-site': 'cross-site' } }), 403],
  ]) {
    const response = new Reply();
    await handler(request, response, notFound);
    assert.equal(response.statusCode, status);
  }
});

test('a free-tier quota failure returns fallback status and does not retry repeatedly', async () => {
  let calls = 0;
  const handler = makeSpeechHandler(config, async () => { calls++; return new Response(null, { status: 429 }); });
  for (let i = 0; i < 2; i++) {
    const response = new Reply();
    await handler(req('Hello'), response, notFound);
    assert.equal(response.statusCode, 429);
  }
  assert.equal(calls, 1);
});
