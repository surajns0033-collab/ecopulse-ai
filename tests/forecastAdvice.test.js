import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmogPlan, getSmogPlan } from '../src/agent/smogPlan.js';
import { parseSmogProfile } from '../src/agent/smogProfile.js';
import { now, city, profile, modeled } from './planFixtures.mjs';

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

test('only recent, nonnegative wind measurements influence the smog plan', () => {
  const now = Date.parse('2026-01-05T08:00:00Z');
  const profile = parseSmogProfile('bus commute');
  const plan = weather => buildSmogPlan(profile, { city: 'Delhi', now, weather }).text;
  assert.match(plan({ timestamp: new Date(now).toISOString(), windSpeed: 0 }), /dispersion/i);
  for (const weather of [null, { windSpeed: 0 }, { timestamp: new Date(now - 4 * 3600000).toISOString(), windSpeed: 0 },
    { timestamp: new Date(now).toISOString(), windSpeed: -1 }]) assert.doesNotMatch(plan(weather), /dispersion/i);
});
