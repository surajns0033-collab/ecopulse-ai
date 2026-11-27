import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { makeAiHandler } from '../server/aiCore.js';
import { handler, chatHeaders, shortHistory, runRequest, chat } from './proxyFixtures.mjs';

test('retired Talk and Bot clients cannot forward requests to any provider', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', assert.fail);
  for (const mode of ['talk', 'bot']) {
    for (const useSearch of [false, true]) {
      const response = await chat({ mode, useSearch, question: 'Voice question', messages: [{ role: 'user', text: 'Earlier private text' }] });
      assert.equal(response.status, 410);
      assert.equal(response.headers['Cache-Control'], 'no-store');
      assert.equal(response.result.text, undefined);
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('Chat still gets sourced Tavily results and sends only the latest search query', async (t) => {
  const source = { title: 'Open-Meteo Air Quality API', url: 'https://open-meteo.com/en/docs/air-quality-api' };
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    const body = JSON.parse(options.body);
    assert.equal(body.query, 'Find the source of the AQI forecast');
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.include_answer, 'basic');
    return Response.json({ answer: 'The forecast is available from Open-Meteo.', results: [source] });
  });
  const response = await chat({ useSearch: true, messages: [
    { role: 'user', text: 'Earlier private text' },
    { role: 'user', text: 'Find the source of the AQI forecast' },
  ] });
  assert.equal(response.status, 200);
  assert.equal(response.result.provider, 'tavily-search');
  assert.deepEqual(response.result.sources, [source]);
  assert.equal(fetch.mock.callCount(), 1);
});

test('malformed, cross-site and unsupported requests stop before any AI provider call', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', assert.fail);
  const valid = { messages: shortHistory };
  assert.equal((await chat(valid, handler, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await chat(valid, handler, { ...chatHeaders, 'sec-fetch-site': 'cross-site' })).status, 403);
  for (const body of [null, [], '{broken', { messages: [] }, { messages: [{ role: 'admin', text: 'Unsupported role' }] },
    { ...valid, timeoutMs: 'fast' }, { ...valid, images: [{ mimeType: 'text/plain', base64: 'YWJj' }] }]) {
    const response = await chat(body);
    assert.equal(response.status, 400);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.doesNotMatch(response.result.error, /broken|Unsupported role|YWJj/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('both parsed and streamed requests enforce a byte cap', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', assert.fail);
  const declared = await chat({ messages: shortHistory }, handler, { ...chatHeaders, 'content-length': String(2 * 1024 * 1024 + 1) });
  assert.equal(declared.status, 413);
  const req = Object.assign(Readable.from([Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024 + 1)]), {
    url: '/api/ai/chat', method: 'POST', headers: chatHeaders,
  });
  const actual = await runRequest(req);
  assert.equal(actual.status, 413);
  assert.equal(actual.result.error, 'Chat request is too large');
  assert.equal(fetch.mock.callCount(), 0);
});

test('streamed same-origin Guest chat forwards its validated JSON without an account', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.llm7.io/v1/chat/completions');
    assert.deepEqual(JSON.parse(options.body).messages, [{ role: 'user', content: shortHistory[0].text }]);
    return Response.json({ choices: [{ message: { content: 'Vent outdoors when cooking.' } }] });
  });
  const json = JSON.stringify({ messages: shortHistory });
  const req = Object.assign(Readable.from([json.slice(0, 7), json.slice(7)]), {
    url: '/api/ai/chat', method: 'POST', headers: { ...chatHeaders, 'sec-fetch-site': 'same-origin' },
  });
  const response = await runRequest(req, makeAiHandler({}));
  assert.equal(response.status, 200);
  assert.equal(response.result.text, 'Vent outdoors when cooking.');
  assert.equal(fetch.mock.callCount(), 1);
});


test('the shared deadline stops fallback attempts and caps client timeout requests', async (t) => {
  const deadline = new AbortController();
  const timer = t.mock.method(AbortSignal, 'timeout', ms =>
    ms === 40_000 ? deadline.signal : new AbortController().signal);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    deadline.abort();
    assert.equal(options.signal.aborted, true);
    return Response.json({}, { status: 503 });
  });
  const response = await chat({ useSearch: true, timeoutMs: 90_000, messages: shortHistory });
  assert.equal(response.status, 504);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(timer.mock.calls[0].arguments[0], 40_000);
});

test('disconnecting from Chat cancels the provider call without starting fallback', async (t) => {
  const res = new EventEmitter();
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    res.emit('close');
    assert.equal(options.signal.aborted, true);
    throw options.signal.reason;
  });
  const response = await chat({ useSearch: true, messages: shortHistory }, handler, chatHeaders, res);
  assert.equal(response.status, undefined);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(res.listenerCount('close'), 0);
});

test('upstream errors are not exposed in chat responses or health checks', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Private provider diagnostic' } }, { status: 502 }));
  const serve = makeAiHandler({ TAVILY_API_KEY: 'test-search-key' });
  const response = await chat({ useSearch: true, messages: shortHistory }, serve);
  assert.equal(response.status, 502);
  assert.deepEqual(response.result, { error: 'AI service is temporarily unavailable' });
  const health = await runRequest({ url: '/api/ai/health', method: 'GET' }, serve);
  assert.equal(health.status, 200);
  assert.deepEqual(health.result, { status: 'ok' });
});
