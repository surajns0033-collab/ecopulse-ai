import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAiHandler } from '../server/aiCore.js';
import { handler, shortHistory, chat } from './proxyFixtures.mjs';

test('search fallback forwards the latest question without private history or system context', async (t) => {
  const query = 'Find the Open-Meteo air quality reference';
  const source = 'https://open-meteo.com/en/docs/air-quality-api';
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.tavily.com/search') return Response.json({}, { status: 503 });
    if (url.endsWith('models?pageSize=1000')) {
      return Response.json({ models: [{ name: 'models/gemini-example-flash', supportedGenerationMethods: ['generateContent'] }] });
    }
    const body = JSON.parse(options.body);
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: query }] }]);
    assert.equal(body.systemInstruction, undefined);
    return Response.json({ candidates: [{
      content: { parts: [{ text: 'Open-Meteo publishes the reference.' }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: source, title: 'Air quality reference' } }] },
    }] });
  });
  const response = await chat({ useSearch: true, system: 'Private system context', messages: [
    { role: 'user', text: 'Earlier private question' }, { role: 'user', text: query },
  ] });
  assert.equal(response.status, 200);
  assert.equal(response.result.sources[0].url, source);
  assert.equal(fetch.mock.callCount(), 3);
});


test('the proxy distinguishes token-limited output from a complete Gemini or compatible reply', async t => {
  let limited = true;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('models?pageSize=1000')) {
      return Response.json({ models: [{ name: 'models/gemini-example-flash', supportedGenerationMethods: ['generateContent'] }] });
    }
    if (url.includes(':generateContent')) {
      return Response.json({ candidates: [{
        finishReason: limited ? 'MAX_TOKENS' : 'STOP', content: { parts: [{ text: 'School advice' }] },
      }] });
    }
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    return Response.json({ choices: [{
      finish_reason: limited ? 'length' : 'stop', message: { content: 'School advice' },
    }] });
  });
  const compatible = makeAiHandler({ OPENAI_BASE_URL: 'https://example.invalid/v1', OPENAI_API_KEY: 'test-provider-key' });
  for (const serve of [handler, compatible]) {
    limited = true;
    const partial = await chat({ messages: shortHistory }, serve);
    assert.equal(partial.status, 200);
    assert.equal(partial.result.truncated, true);
    limited = false;
    const complete = await chat({ messages: shortHistory }, serve);
    assert.equal(complete.result.text, 'School advice');
    assert.equal(complete.result.truncated, undefined);
  }
});

test('a slow known Gemini model leaves the remaining time for the configured text fallback', async t => {
  const primary = new AbortController();
  const deadline = new AbortController();
  const attempts = [primary.signal, new AbortController().signal];
  t.mock.method(AbortSignal, 'timeout', ms => ms === 30_000 ? deadline.signal : attempts.shift());
  const endpoints = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    endpoints.push(new URL(url).pathname);
    if (endpoints.length === 1) {
      assert.match(url, /models\/gemini-configured:generateContent$/);
      primary.abort();
      assert.equal(options.signal.aborted, true);
      throw primary.signal.reason;
    }
    // The next provider receives a separate attempt signal.
    assert.equal(new URL(url).hostname, 'example.invalid');
    assert.equal(options.signal.aborted, false);
    return Response.json({ choices: [{ message: { content: 'Group deliveries to avoid extra trips.' } }] });
  });
  const serve = makeAiHandler({
    GEMINI_API_KEY: 'test-gemini-key', GEMINI_MODEL: 'gemini-configured',
    OPENAI_BASE_URL: 'https://example.invalid/v1', OPENAI_API_KEY: 'test-backup-key', OPENAI_MODEL: 'test-backup',
  });
  const response = await chat({ messages: shortHistory }, serve);
  assert.equal(deadline.signal.aborted, false);
  assert.equal(response.status, 200);
  assert.equal(response.result.provider, 'openai:test-backup');
  assert.equal(endpoints.length, 2);
});
