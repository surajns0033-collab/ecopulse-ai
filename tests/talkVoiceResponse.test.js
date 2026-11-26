import test from 'node:test';
import assert from 'node:assert/strict';
import { getVoiceResponse } from '../src/services/geminiService.js';

test('a normal voice request includes earlier text, but sets the reply language from the latest turn', async (t) => {
  const messages = [
    { role: 'user', text: 'मला बसने प्रवास करायला आवडतं.' },
    { role: 'ai', text: 'तुम्ही कामालाही बसने जाता का?' },
    { role: 'user', text: 'Yes, I do. Which commute did I mention?' },
  ];
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/ai/chat');
    const body = JSON.parse(options.body);
    assert.equal(body.mode, 'talk');
    assert.match(body.system, /Reply in English .*even if earlier turns used another language/);
    assert.deepEqual(body.messages, [messages[0], { ...messages[1], role: 'assistant' }, messages[2]]);
    assert.deepEqual(body.images, []);
    return Response.json({ text: JSON.stringify({ text: 'You said you take the bus.', locale: 'en-IN' }) });
  });
  assert.deepEqual(await getVoiceResponse(messages, { language: 'en-IN' }), { text: 'You said you take the bus.', locale: 'en-IN' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('web search uses only the requested query and still requires a source', async (t) => {
  const messages = [{ role: 'user', text: 'Earlier private text' }, { role: 'user', text: 'Search the web for local AQI' }];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.useSearch, true);
    assert.deepEqual(body.messages, messages.slice(-1));
    return Response.json({ text: 'Unsourced text' });
  });
  assert.equal(await getVoiceResponse(messages, { useSearch: true }), null);
});

test('malformed model protocol is not read aloud', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ text: '{"locale":"Invalid locale!","text":"Hello"}' }));
  assert.equal(await getVoiceResponse([{ role: 'user', text: 'Hello' }]), null);
});
