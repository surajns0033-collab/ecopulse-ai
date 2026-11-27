import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmogPlan, getSmogPlan, startSmogPlan } from '../src/agent/smogPlan.js';
import { AWAITING_SMOG_PROFILE, parseSmogProfile } from '../src/agent/smogProfile.js';

const now = Date.parse('2026-11-27T05:00:00Z');
const city = 'Navi Mumbai';
const profile = parseSmogProfile('Car commute, outdoor work, gas stove, HEPA purifier, one child.');
const modeled = { aqi: 171, timestamp: '2026-11-27T04:30:00Z', source: 'Open-Meteo Air Quality', sourceType: 'modeled' };

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

test('very unhealthy and hazardous AQI escalate avoidance rather than repeating regular commute advice', () => {
  const pupil = parseSmogProfile('Metro to school; no purifier.');
  const plan = (aqi) => buildSmogPlan(pupil, { city, aqi: { ...modeled, aqi }, now }).text;
  assert.match(plan(200), /Move strenuous exercise indoors/);
  const veryUnhealthy = plan(201);
  assert.match(veryUnhealthy, /AQI: 201 — Very Unhealthy/);
  assert.match(veryUnhealthy, /Avoid outdoor exertion/);
  assert.match(plan(300), /Avoid outdoor exertion/);
  assert.match(plan(301), /AQI: 301 — Hazardous/);
  assert.match(plan(301), /postpone non-essential trips/);
  assert.match(plan(301), /recheck AQI before both legs/);
});

test('ventilation and filtration advice stay distinct when outdoor air is unhealthy', () => {
  const low = buildSmogPlan(profile, { city, aqi: { ...modeled, aqi: 42 }, now }).text;
  const high = buildSmogPlan(profile, { city, aqi: modeled, now }).text;
  assert.match(low, /Check outdoor air before opening windows/);
  assert.doesNotMatch(low, /keep windows closed/);
  assert.match(high, /If safe, keep windows closed while outdoor air is poor/);
  assert.match(high, /never block exhaust vents/);
  assert.match(high, /vents outdoors while the gas stove runs/);
});

test('the source age cutoff and clock-skew allowance never turn an out-of-window reading into current data', () => {
  const reading = (time) => buildSmogPlan(profile, { city, aqi: { ...modeled, timestamp: new Date(time).toISOString() }, now });
  const twoHours = 2 * 60 * 60 * 1000;
  const fifteenMinutes = 15 * 60 * 1000;
  assert.equal(reading(now - twoHours).cards[0].data.aqi, modeled.aqi);
  assert.equal(reading(now - twoHours - 1).cards.length, 0);
  assert.equal(reading(now + fifteenMinutes).cards[0].data.aqi, modeled.aqi);
  assert.equal(reading(now + fifteenMinutes + 1).cards.length, 0);
});

test('if two daytime slots tie, choose the earlier slot and ignore readings beyond the next day', () => {
  const forecast = {
    timeZone: 'Asia/Kolkata',
    hours: [
      { time: Date.parse('2026-11-27T09:30:00Z'), aqi: 82 },
      { time: Date.parse('2026-11-27T08:30:00Z'), aqi: 82 },
      { time: Date.parse('2026-11-28T08:30:00Z'), aqi: 15 },
    ],
  };
  const plan = buildSmogPlan(profile, { city, forecast, now });
  assert.match(plan.text, /2:00\s*pm \(Asia\/Kolkata\), forecast U\.S\. AQI 82/i);
  assert.doesNotMatch(plan.text, /forecast U\.S\. AQI 15/);
});

test('an unknown forecast timezone is not silently replaced with the device timezone', () => {
  const forecast = { timeZone: 'Unknown/Timezone', hours: [{ time: now + 60 * 60 * 1000, aqi: 21 }] };
  const result = buildSmogPlan(profile, { city, forecast, now });
  assert.match(result.text, /no upcoming daytime forecast/);
  assert.doesNotMatch(result.text, /forecast U\.S\. AQI 21/);
});

test('a forecast that is still unhealthy is not presented as a safe outdoor window', () => {
  const forecast = { timeZone: 'Asia/Kolkata', hours: [
    { time: Date.parse('2026-11-27T11:00:00Z'), aqi: 176 },
    { time: Date.parse('2026-11-27T13:00:00Z'), aqi: 23 }, // After local daytime hours.
  ] };
  const result = buildSmogPlan(profile, { city, forecast, now });
  assert.match(result.text, /forecast U\.S\. AQI 176/);
  assert.match(result.text, /Even the lowest forecast is unhealthy; consider postponing/);
  assert.doesNotMatch(result.text, /forecast U\.S\. AQI 23/);
});

test('an unavailable current AQI feed still produces useful guidance and labels the forecast separately', async (t) => {
  t.mock.method(Date, 'now', () => now);
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    const endpoint = new URL(url);
    if (!endpoint.searchParams.has('hourly')) return Response.json({}, { status: 503 });
    return Response.json({ timezone: 'Asia/Kolkata', current: { time: now / 1000 },
      hourly: { time: [now / 1000 + 3600], us_aqi: [103] } });
  });
  const result = await getSmogPlan('I take the bus and use a DIY filter.', { city: 'Pune', lat: 18.52, lng: 73.86 });
  assert.match(result.text, /clean-air plan — Pune/);
  assert.match(result.text, /Current AQI:\*\* unavailable/);
  assert.match(result.text, /forecast U\.S\. AQI 103/);
  assert.match(result.text, /Keep your existing filtered-air setup unobstructed/);
  assert.doesNotMatch(result.text, /Current AQI: 103|Run HEPA in/);
  assert.deepEqual(result.cards, []);
  assert.equal(fetch.mock.callCount(), 3);
});

test('a sensitive household and a school get an actionable warning at a forecast AQI of 101', () => {
  const hour = Date.parse('2026-11-27T08:00:00Z');
  for (const details of ['one child', 'our school assembly', 'I commute by metro']) {
    const input = parseSmogProfile(details);
    const forecast = aqi => ({ timeZone: 'Asia/Kolkata', hours: [{ time: hour, aqi }] });
    const plan = aqi => buildSmogPlan(input, { city, forecast: forecast(aqi), now }).text;
    assert.doesNotMatch(plan(100), /still unhealthy for sensitive groups/);
    assert.equal(plan(101).includes('still unhealthy for sensitive groups'), details !== 'I commute by metro');
  }
});
