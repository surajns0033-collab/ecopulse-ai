import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeAiHandler } from '../server/aiCore.js';

const handler = makeAiHandler({ GEMINI_API_KEY: 'test-gemini-key', TAVILY_API_KEY: 'test-search-key' });

async function talk(body, res = new EventEmitter()) {
  const req = { url: '/api/ai/chat', method: 'POST', body: { mode: 'talk', ...body } };
  const headers = {};
  let result;
  res.setHeader = (name, value) => { headers[name] = value; };
  res.end = (text) => { result = JSON.parse(text); };
  await handler(req, res, () => assert.fail('Talk request was not handled'));
  return { status: res.statusCode, headers, result };
}

test('Talk uses exactly the configured text model with no discovery or auxiliary provider', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/models\/gemini-3\.1-flash-lite:generateContent$/);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Hello!' }] }]);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'not spoken', thought: true }, { text: 'Hey! How’s it going?' }] } }] });
  });
  const response = await talk({ messages: [{ role: 'user', text: 'Hello!' }], model: 'some-other-model' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.result.text, 'Hey! How’s it going?');
  assert.equal(fetch.mock.callCount(), 1);
});

test('a failed Talk web search never retries with ungrounded text', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    const body = JSON.parse(options.body);
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.query, 'Latest headlines for Mumbai');
    return Response.json({ answer: 'Unsourced answer', results: [] });
  });
  const response = await talk({ useSearch: true, messages: [{ role: 'user', text: 'Earlier private turn' }, { role: 'user', text: 'Latest headlines for Mumbai' }] });
  assert.equal(response.status, 503);
  assert.equal(response.result.text, undefined);
  assert.equal(fetch.mock.callCount(), 1);
});

test('an official link request searches the named domain in one basic query', async (t) => {
  const source = { title: 'Emergency Response Support System', url: 'https://112.gov.in/' };
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    const body = JSON.parse(options.body);
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.include_answer, false);
    assert.deepEqual(body.include_domains, ['112.gov.in']);
    return Response.json({ results: [source] });
  });
  const response = await talk({ useSearch: true, messages: [{ role: 'user', text: 'Find the official site on www.112.gov.in.' }] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.result.sources, [source]);
  assert.equal(fetch.mock.callCount(), 1);
});

test('cancelling a Talk request aborts the in-flight provider call', async (t) => {
  const res = new EventEmitter();
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    res.emit('close');
    assert.equal(signal.aborted, true);
    signal.throwIfAborted();
  });
  const response = await talk({ messages: [{ role: 'user', text: 'Hello!' }] }, res);
  assert.equal(response.result, undefined);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(res.listenerCount('close'), 0);
});
