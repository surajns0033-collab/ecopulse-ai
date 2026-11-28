import assert from 'node:assert/strict';
import test from 'node:test';
import { getAirQuality, getAirQualityForecast, readAirSources } from '../src/services/airQuality.js';
import { getWeather, readWeatherSources } from '../src/services/weatherData.js';

test('fresh station data needs one request and station subindices never become concentrations', async t => {
  const station = { aqi: 202, city: { name: 'Station A' }, iaqi: { pm25: { v: 202 } }, time: { iso: new Date().toISOString() } };
  const calls = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ok', data: station }));
  const data = await readAirSources(22, 73, undefined, 'fixture');
  assert.equal(calls.mock.callCount(), 1);
  assert.equal(data.station, 'Station A');
  assert.equal(data.aqi, 202);
  assert.equal(data.pm25, undefined);
});

test('a stale station cannot mask a fresh modeled reading, and missing pollution is never zero', async t => {
  const previous = new Date(Date.now() - 4 * 3600000).toISOString();
  const calls = t.mock.method(globalThis, 'fetch', async url => url.includes('waqi.info')
    ? Response.json({ status: 'ok', data: { aqi: 290, time: { iso: previous } } })
    : Response.json({ current: { us_aqi: 76.1, pm2_5: 0, pm10: -1, ozone: 'missing', time: new Date().toISOString() } }));
  const data = await readAirSources(22, 73, undefined, 'fixture');
  assert.equal(calls.mock.callCount(), 2);
  assert.equal(data.sourceType, 'modeled');
  assert.equal(data.aqi, 76);
  assert.equal(data.pm25, 0);
  assert.equal(data.pm10, null);
  assert.equal(data.o3, null);
});

test('fresh weather from either provider keeps a true zero temperature and wind speed', async t => {
  let station = true;
  const calls = t.mock.method(globalThis, 'fetch', async url => url.includes('openweathermap')
    ? Response.json(station ? { main: { temp: 0, feels_like: -2 }, wind: { speed: 0 }, dt: 1 } : {})
    : Response.json({ current: { temperature_2m: 0, wind_speed_10m: 0, weather_code: 0 } }));
  const first = await readWeatherSources(22, 73, undefined, 'fixture');
  assert.equal(first.temp, 0);
  assert.equal(first.windSpeed, 0);
  assert.equal(first.timestamp, '1970-01-01T00:00:01.000Z');
  station = false;
  const second = await readWeatherSources(22, 73, undefined, 'fixture');
  assert.equal(second.temp, 0);
  assert.equal(second.description, 'Clear sky');
  assert.equal(calls.mock.callCount(), 3);
});

test('invalid coordinates stop all environmental requests before networking', async t => {
  t.mock.method(globalThis, 'fetch', assert.fail);
  for (const lookup of [getAirQuality, getAirQualityForecast, getWeather]) {
    assert.equal(await lookup(-91, 73), null);
    assert.equal(await lookup(22, 181), null);
    assert.equal(await lookup(null, 73), null);
  }
});
