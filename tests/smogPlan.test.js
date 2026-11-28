import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmogPlan, getSmogPlan, startSmogPlan } from '../src/agent/smogPlan.js';
import { AWAITING_SMOG_PROFILE, parseSmogProfile } from '../src/agent/smogProfile.js';
import { now, city, profile, modeled } from './planFixtures.mjs';

test('high AQI changes the advice for an outdoor worker and a sensitive household', () => {
  const plan = buildSmogPlan(profile, { city, aqi: modeled, now });
  assert.match(plan.text, /AQI: 171 — Unhealthy/);
  assert.match(plan.text, /Open-Meteo \/ CAMS modeled U\.S\. AQI · source time: 2026-11-27 04:30 UTC/);
  assert.match(plan.text, /Move strenuous exercise indoors/);
  assert.match(plan.text, /take breaks in a cleaner indoor space/);
  assert.match(plan.text, /household members you flagged as sensitive/);
  assert.match(plan.text, /Run HEPA in one cleaner-air room/);
  assert.match(plan.text, /gas stove runs/);
  assert.equal(plan.text.match(/\*\*Direct impact:\*\*/g).length, 5);
  assert.equal(plan.cards[0].data.aqi, 171);
});

test('missing, stale and undated AQI never become current recommendations', () => {
  for (const [aqi, expected] of [
    [null, /unavailable/],
    [{ ...modeled, timestamp: '2026-11-26T04:30:00Z' }, /no recent timestamp/],
    [{ ...modeled, timestamp: null }, /no recent timestamp/],
  ]) {
    const plan = buildSmogPlan(parseSmogProfile('skip'), { city, aqi, now });
    assert.match(plan.text, expected);
    assert.match(plan.text, /household sensitivity: not stated/);
    assert.match(plan.text, /no commute mode was assumed/);
    assert.doesNotMatch(plan.text, /171|N95|Run HEPA in/);
    assert.deepEqual(plan.cards, []);
  }
});

test('zero is a valid reading and does not trigger high exposure advice', () => {
  const plan = buildSmogPlan(profile, { city, aqi: { ...modeled, aqi: 0 }, now });
  assert.match(plan.text, /AQI: 0 — Good/);
  assert.doesNotMatch(plan.text, /Move strenuous exercise indoors|N95/);
});

test('forecast selection ignores elapsed, nighttime and invalid hours in the city time zone', () => {
  const forecast = { timeZone: 'Asia/Kolkata', hours: [
    { time: Date.parse('2026-11-27T04:00:00Z'), aqi: 5 },
    { time: Date.parse('2026-11-27T18:00:00Z'), aqi: 8 },
    { time: Date.parse('2026-11-27T06:00:00Z'), aqi: null },
    { time: Date.parse('2026-11-27T08:00:00Z'), aqi: 157 },
    { time: Date.parse('2026-11-27T09:00:00Z'), aqi: 167 },
  ] };
  const plan = buildSmogPlan(profile, { city, forecast, now });
  assert.match(plan.text, /Asia\/Kolkata\), forecast U\.S\. AQI 157/);
  assert.match(plan.text, /Lower does not mean safe/);
  const noDaytime = buildSmogPlan(profile, { city, forecast: { ...forecast, hours: forecast.hours.slice(0, 3) }, now });
  assert.match(noDaytime.text, /no upcoming daytime forecast/);
});

test('asking for a plan without a resolved city never requests data or device location', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', assert.fail);
  assert.equal(startSmogPlan(city).pending, AWAITING_SMOG_PROFILE);
  const plan = await getSmogPlan('I commute by transit', { city: null });
  assert.equal(plan.status, 'needs_location');
  assert.equal(plan.actions[0].action, 'REQUEST_LOCATION');
  assert.equal(fetch.mock.callCount(), 0);
});

test('new city and lifestyle use their own readings, forecast, and advice', async (t) => {
  const navi = { city, lat: 19.03, lng: 73.03 };
  const bengaluru = { city: 'Bengaluru', lat: 12.97, lng: 77.59 };
  t.mock.method(Date, 'now', () => now);
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    const { searchParams: params, hostname } = new URL(url);
    const place = params.get('latitude') === '19.03' ? navi : bengaluru;
    assert.equal(params.get('longitude'), String(place.lng));
    const index = place === navi ? 171 : 42;
    if (hostname === 'api.open-meteo.com') return Response.json({ current: { temperature_2m: 25, wind_speed_10m: 4 } });
    if (params.has('hourly')) {
      assert.equal(params.get('timeformat'), 'unixtime');
      return Response.json({ timezone: 'Asia/Kolkata', current: { time: now / 1000 },
        hourly: { time: [now / 1000 + 3600], us_aqi: [index + 1] } });
    }
    return Response.json({ current: { us_aqi: index, time: '2026-11-27T04:30' } });
  });
  const before = await getSmogPlan('I commute by car; I have a HEPA purifier.', navi);
  const after = await getSmogPlan('I commute by transit and have no purifier.', bengaluru);
  assert.match(before.text, /Navi Mumbai.*\n\n[^\n]*AQI: 171/);
  assert.match(after.text, /Bengaluru.*\n\n[^\n]*AQI: 42/);
  assert.match(after.text, /forecast U\.S\. AQI 43/);
  assert.match(after.text, /Keep the long leg on transit/);
  assert.doesNotMatch(after.text, /Navi Mumbai|171|Run HEPA in/);
  assert.equal(after.cards[0].data.city, 'Bengaluru');
  assert.equal(fetch.mock.callCount(), 6);
});

test('moderate AQI adds a sensitive-household precaution only when a sensitivity was stated', () => {
  const plan = (aqi, household = profile) => buildSmogPlan(household, { city, aqi: { ...modeled, aqi }, now }).text;
  assert.match(plan(50), /AQI: 50 — Good/);
  assert.doesNotMatch(plan(50), /household members you flagged/);
  assert.match(plan(51), /AQI: 51 — Moderate/);
  assert.match(plan(51), /household members you flagged/);
  assert.doesNotMatch(plan(51, parseSmogProfile('I commute by bus.')), /household members you flagged/);
});

test('the 101 and 151 AQI thresholds change the actual outdoor and cycling advice', () => {
  const cyclist = parseSmogProfile('I cycle to work.');
  const plan = (aqi) => buildSmogPlan(cyclist, { city, aqi: { ...modeled, aqi }, now }).text;
  assert.doesNotMatch(plan(100), /Shorten prolonged outdoor exertion/);
  assert.match(plan(101), /Shorten prolonged outdoor exertion/);
  assert.match(plan(150), /Use quieter internal streets/);
  const unhealthy = plan(151);
  assert.match(unhealthy, /Move strenuous exercise indoors/);
  assert.match(unhealthy, /Avoid strenuous roadside exercise today; use transit/);
  assert.match(unhealthy, /Walking and cycling have no tailpipe emissions/);
});
