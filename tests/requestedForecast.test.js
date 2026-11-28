import assert from 'node:assert/strict';
import test from 'node:test';
import { asksForForecast, routePlaceRequest } from '../src/agent/placeContext.js';
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

test('clock-time AQI questions select that local hour even without the word forecast', () => {
  const midday = Date.parse('2026-11-28T06:30:00Z');
  const evening = { timeZone: 'Asia/Kolkata', hours: [
    { time: Date.parse('2026-11-28T11:30:00Z'), aqi: 160 },
    { time: Date.parse('2026-11-28T12:30:00Z'), aqi: 112 },
  ] };
  for (const question of ['What will the AQI be in Delhi at 6 pm?', 'AQI in Delhi at 18:00?', 'At 6 pm, what will the AQI be in Delhi?']) {
    assert.equal(asksForForecast(question), true, question);
    const answer = describeRequestedForecast(evening, question, midday);
    assert.match(answer.text, /18:00.*Asia\/Kolkata.*modeled U.S. AQI 112/);
    assert.doesNotMatch(answer.text, /160/);
  }
  assert.equal(asksForForecast('I left at 6 pm yesterday. What is the AQI right now?'), false);
  assert.equal(asksForForecast('I left at 6 pm yesterday, what is the AQI right now?'), false);
  assert.equal(describeRequestedForecast(evening, 'What was the AQI yesterday at 6 pm?', midday).status, 'unavailable');
});

test('time qualifiers stay out of city lookup and an earlier journey does not select the forecast hour', () => {
  const question = 'I left home at 6 am yesterday. What will the AQI be in Delhi, India tomorrow at 9 am?';
  assert.equal(routePlaceRequest(question).place, 'Delhi, India');
  assert.match(describeRequestedForecast(forecast, question, now).text, /09:00.*modeled U.S. AQI 98/);
  assert.equal(routePlaceRequest('What was the AQI in Delhi, India yesterday at 6 pm?').place, 'Delhi, India');
  const commute = 'Delhi mein 6 pm ka AQI kya hoga?';
  assert.equal(routePlaceRequest(commute).place, 'Delhi');
  assert.equal(asksForForecast(commute), true);
});
