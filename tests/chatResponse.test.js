import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_UNAVAILABLE_TEXT, getChatResponse } from '../src/services/geminiService.js';

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

test('search cites usable sources and degrades when every returned citation is malformed', async t => {
  const request = [{ role: 'user', text: 'Search the web for the AQI scale' }];
  let sources = [null, { title: 'missing URL' }, { title: 'Invalid', url: 'broken' },
    { title: '   ', url: 'https://example.org/no-title' }];
  const usable = { title: 'AQI guidance', url: 'https://www.airnow.gov/aqi/aqi-basics/' };
  t.mock.method(globalThis, 'fetch', () => Response.json({ text: 'Check the scale.', sources }));
  assert.equal(await getChatResponse(request, '', { useSearch: true }), AI_UNAVAILABLE_TEXT);
  sources = [...sources, usable];
  const answer = await getChatResponse(request, '', { useSearch: true });
  assert.match(answer, /Check the scale/);
  assert.ok(answer.includes(usable.url));
  assert.doesNotMatch(answer, /broken|missing URL/);
});
