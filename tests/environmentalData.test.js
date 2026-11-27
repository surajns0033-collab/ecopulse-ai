import test from 'node:test';
import assert from 'node:assert/strict';
import { getAirQuality, getAQICategory } from '../src/services/environmentalData.js';

test('the environmental cache reuses recent data but evicts old locations at a fixed size', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ current: { us_aqi: 50, time: '2026-11-27T04:30' } }));
  for (let i = 0; i < 128; i++) await getAirQuality(i / 10, 1);
  await getAirQuality(0, 1); // Refresh its recency without extending the time-to-live.
  assert.equal(fetch.mock.callCount(), 128);
  await getAirQuality(15, 1);
  await getAirQuality(0, 1);
  assert.equal(fetch.mock.callCount(), 129);
  await getAirQuality(0.1, 1);
  assert.equal(fetch.mock.callCount(), 130);
});

test('a cache hit does not let a reading outlive the original expiry', async (t) => {
  let now = Date.parse('2026-11-27T05:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ current: { us_aqi: 42, time: '2026-11-27T04:30' } }));
  const location = [48.86, 2.35];
  const first = await getAirQuality(...location);
  now += 2 * 60 * 1000;
  assert.equal(await getAirQuality(...location), first);
  now += 60 * 1000 + 1;
  const fresh = await getAirQuality(...location);
  assert.notEqual(fresh, first);
  assert.equal(fresh.aqi, 42);
  assert.equal(fetch.mock.callCount(), 2);
});

test('invalid negative provider data cannot be cached as good air', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ current: { us_aqi: -0.4, time: '2026-11-27T04:30' } }));
  assert.equal(await getAirQuality(12.97, 77.59), null);
  assert.equal(await getAirQuality(12.97, 77.59), null);
  assert.equal(fetch.mock.callCount(), 2);
});

function relativeLuminance(hex) {
  const [red, green, blue] = hex.slice(1).match(/../g).map(pair => {
    const srgb = parseInt(pair, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

test('all AQI labels meet the WCAG AA text contrast threshold on their badge background', () => {
  for (const value of [null, 0, 51, 101, 151, 201, 301]) {
    const { label, color, bg } = getAQICategory(value);
    const foreground = relativeLuminance(color);
    const background = relativeLuminance(bg);
    const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    assert.ok(contrast >= 4.5, label + ' contrast ratio: ' + contrast);
  }
});
