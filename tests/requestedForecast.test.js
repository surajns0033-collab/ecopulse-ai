import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRequestedForecast } from '../src/agent/requestedForecast.js';

// A fixture crosses local midnight in India while the UTC calendar date is unchanged.
const now = Date.parse('2026-11-27T18:00:00Z');
const hours = [
  ['2026-11-27T18:15:00Z', 49], ['2026-11-28T02:30:00Z', 162],
  ['2026-11-28T03:30:00Z', 98], ['2026-11-28T10:30:00Z', 77],
].map(([time, aqi]) => ({ time: Date.parse(time), aqi }));
const forecast = { timeZone: 'Asia/Kolkata', hours };

test('a requested local morning uses only available forecast slots and flags the higher school exposure', () => {
  const result = describeRequestedForecast(forecast, 'School assembly tomorrow morning?', now);
  assert.equal(result.status, 'success');
  assert.match(result.text, /98–162/);
  assert.match(result.text, /Asia\/Kolkata/);
  assert.match(result.text, /indoor alternative/);
  assert.doesNotMatch(result.text, /49|current AQI/i);
  assert.match(describeRequestedForecast(forecast, 'Delhi mein kal subah school assembly?', now).text, /98–162/);
});

test('unsupported horizons, missing slots and invalid time zones stay unavailable', () => {
  for (const [data, message] of [[null, 'tomorrow'], [{ ...forecast, timeZone: 'Unknown/Zone' }, 'tomorrow'],
    [forecast, 'next week'], [forecast, 'tomorrow at 5 pm']]) {
    assert.equal(describeRequestedForecast(data, message, now).status, 'unavailable');
  }
  assert.match(describeRequestedForecast(forecast, 'tomorrow at 9 am', now).text, /modeled U.S. AQI 98\./);
});
