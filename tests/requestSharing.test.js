import assert from 'node:assert/strict';
import test from 'node:test';
import { getAirQuality } from '../src/services/airQuality.js';

test('overlapping environmental callers share a request and cancel independently', async t => {
  const first = new AbortController();
  const source = Promise.withResolvers();
  let upstream;
  const network = t.mock.method(globalThis, 'fetch', (_url, { signal }) => {
    upstream = signal;
    return source.promise;
  });
  const a = getAirQuality(19.123, 72.765, 'First', { signal: first.signal });
  const b = getAirQuality(19.123, 72.765, 'Second');
  await new Promise(resolve => setImmediate(resolve));
  first.abort();
  source.resolve(Response.json({ current: { us_aqi: 41, time: new Date().toISOString() } }));
  await assert.rejects(a, { name: 'AbortError' });
  assert.equal((await b).city, 'Second');
  assert.equal(upstream.aborted, false);
  assert.equal(network.mock.callCount(), 1);
});

test('an unavailable result can be retried and the successful value is cached', async t => {
  let ready = false;
  const calls = t.mock.method(globalThis, 'fetch', () => ready
    ? Response.json({ current: { us_aqi: 0, time: new Date().toISOString() } })
    : new Response(null, { status: 503 }));
  assert.equal(await getAirQuality(12.95, 77.62), null);
  ready = true;
  assert.equal((await getAirQuality(12.95, 77.62)).aqi, 0);
  assert.equal((await getAirQuality(12.95, 77.62)).aqi, 0);
  assert.equal(calls.mock.callCount(), 2);
});
