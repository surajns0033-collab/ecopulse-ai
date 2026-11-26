import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAiHandler } from '../server/aiCore.js';

const handler = makeAiHandler({ GEMINI_API_KEY: 'test-gemini-key', TAVILY_API_KEY: 'test-search-key' });

async function chat(body) {
  const req = { url: '/api/ai/chat', method: 'POST', body };
  const headers = {};
  let result;
  const res = {
    setHeader: (name, value) => { headers[name] = value; },
    end: (text) => { result = JSON.parse(text); },
  };
  await handler(req, res, () => assert.fail('Chat request was not handled'));
  return { status: res.statusCode, headers, result };
}

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
