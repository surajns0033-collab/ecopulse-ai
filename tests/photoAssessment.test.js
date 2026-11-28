import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeEnvironmentalImage, getJsonResponse } from '../src/services/geminiService.js';

test('missing, low and out-of-range model certainty request a human observation', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ text: JSON.stringify(payload) }));
  for (const confidence of [undefined, 0.1, 1.5]) {
    payload = { description: 'Haze is visible.', category: 'air', severity: 'mild', confidence };
    const result = await analyzeEnvironmentalImage('fixture', 'image/jpeg');
    assert.equal(result.uncertain, true);
    assert.equal(result.severity, undefined);
  }
  payload = { description: 'Smoke appears above a bin.', category: 'burning', severity: 'mild',
    confidence: 0.91, actions: ['Review the photo', {}], visibleText: ['A12', {}] };
  const result = await analyzeEnvironmentalImage('fixture', 'image/jpeg');
  assert.equal(result.category, 'burning');
  assert.deepEqual(result.visibleText, ['A12']);
  assert.deepEqual(result.actions, ['Review the photo']);
});

test('cancelled requests do not contact the provider or continue a photo turn', async t => {
  const calls = t.mock.method(globalThis, 'fetch', assert.fail);
  const signal = AbortSignal.abort();
  await assert.rejects(analyzeEnvironmentalImage('fixture', 'image/jpeg', '', signal), { name: 'AbortError' });
  await assert.rejects(getJsonResponse('Draft a report', '', { signal }), { name: 'AbortError' });
  assert.equal(calls.mock.callCount(), 0);
});
