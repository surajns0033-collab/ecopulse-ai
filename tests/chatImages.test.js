import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAiHandler } from '../server/aiCore.js';
import { readChatRequest } from '../server/chatRequest.js';
import { chatHeaders, shortHistory, chat } from './proxyFixtures.mjs';

test('a valid photo is attached exactly once, to the latest user turn', async (t) => {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx2kAAAAASUVORK5CYII=';
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    const { model, messages } = JSON.parse(options.body);
    assert.equal(model, 'configured-test-model');
    assert.deepEqual(messages, [
      { role: 'user', content: 'First turn' },
      { role: 'assistant', content: 'First reply' },
      { role: 'user', content: [
        { type: 'text', text: 'Describe this photo' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
      ] },
    ]);
    return Response.json({ choices: [{ message: { content: 'Photo checked.' } }] });
  });
  const response = await chat({
    model: 'client-model-field',
    messages: [{ role: 'user', text: 'First turn' }, { role: 'ai', text: 'First reply' }, { role: 'user', text: 'Describe this photo' }],
    images: [{ mimeType: 'image/png', base64 }],
  }, makeAiHandler({ OPENAI_BASE_URL: 'https://example.invalid/v1', OPENAI_API_KEY: 'test-provider-key', OPENAI_MODEL: 'configured-test-model' }));
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});


test('photo headers must match their declared media type before anything is sent upstream', async t => {
  const calls = t.mock.method(globalThis, 'fetch', assert.fail);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx2kAAAAASUVORK5CYII=';
  for (const mimeType of ['image/jpeg', 'image/webp', 'image/heic', 'image/heif']) {
    const reply = await chat({ messages: shortHistory, images: [{ mimeType, base64: png }] });
    assert.equal(reply.status, 400);
  }
  assert.equal(calls.mock.callCount(), 0);
});

test('supported image headers retain their original bytes', async () => {
  const headers = {
    'image/jpeg': Buffer.from([255, 216, 255, 224]),
    'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
    'image/heic': Buffer.from('00000018667479706d69663100000000686569636d696631', 'hex'),
    'image/heif': Buffer.from('00000010667479706d69663100000000', 'hex'),
  };
  for (const [mimeType, data] of Object.entries(headers)) {
    const image = { mimeType, base64: data.toString('base64') };
    const request = await readChatRequest({ headers: chatHeaders, body: { messages: shortHistory, images: [image] } });
    assert.deepEqual(request.images, [image]);
  }
});
