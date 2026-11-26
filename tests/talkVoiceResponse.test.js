import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_UNAVAILABLE_TEXT, getChatResponse, getVoiceResponse } from '../src/services/geminiService.js';

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
    assert.match(body.system, /most recent explicit correction/);
    assert.deepEqual(body.messages, [messages[0], { ...messages[1], role: 'assistant' }, messages[2]]);
    assert.deepEqual(body.images, []);
    return Response.json({ text: JSON.stringify({ text: 'You said you take the bus.', locale: 'en-IN' }) });
  });
  assert.deepEqual(await getVoiceResponse(messages, { language: 'en-IN' }), { text: 'You said you take the bus.', locale: 'en-IN' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('Chat carries recent corrections in conversation but leaves them out of search', async (t) => {
  const messages = [
    { role: 'user', text: 'I drive to work.' },
    { role: 'user', text: 'Correction: I take the bus now.' },
  ];
  const context = 'Private context';
  const fetch = t.mock.method(globalThis, 'fetch', async (_, options) => {
    const body = JSON.parse(options.body);
    if (!body.useSearch) {
      assert.deepEqual(body.messages, messages);
      assert.match(body.system, /most recent explicit correction/);
      return Response.json({ text: 'Got it.' });
    }
    assert.deepEqual(body.messages, [{ role: 'user', text: 'Search the web for electric buses' }]);
    assert.ok(!body.system.includes(context));
    return Response.json({ text: 'Unsourced search result' });
  });
  assert.equal(await getChatResponse(messages, context), 'Got it.');
  assert.equal(await getChatResponse([...messages, { role: 'user', text: 'Search the web for electric buses' }], context, { useSearch: true }), AI_UNAVAILABLE_TEXT);
  assert.equal(await getChatResponse([{ role: 'ai', text: 'Do not search this' }], context, { useSearch: true }), AI_UNAVAILABLE_TEXT);
  assert.equal(fetch.mock.callCount(), 2);
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
