import { WAQI_TOKEN, coordinateKey, environmentJson, getCached, setCached, toUtcIso } from './environmentCache.js';

function stationReading(json) {
  const data = json?.data;
  if (json?.status !== 'ok' || !Number.isFinite(data?.aqi) || data.aqi < 0) return null;
  // WAQI pollutant subindices cannot be displayed as concentrations.
  const station = data.city?.name || null;
  return { aqi: data.aqi, station, city: station, timestamp: data.time?.iso || null,
    source: 'World Air Quality Index', sourceUrl: 'https://aqicn.org/map/' };
}

function concentration(value, precision = 10) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * precision) / precision : null;
}

function modeledReading(current, sourceUrl) {
  if (!Number.isFinite(current?.us_aqi) || current.us_aqi < 0) return null;
  return {
    aqi: Math.round(current.us_aqi), pm25: concentration(current.pm2_5), pm10: concentration(current.pm10),
    no2: concentration(current.nitrogen_dioxide), o3: concentration(current.ozone),
    co: concentration(current.carbon_monoxide, 1), so2: concentration(current.sulphur_dioxide),
    scale: 'U.S. AQI', sourceType: 'modeled', city: null, timestamp: toUtcIso(current.time),
    source: 'Open-Meteo Air Quality', sourceUrl,
  };
}

export function isRecentAirQuality(reading, now = Date.now()) {
  if (!Number.isFinite(reading?.aqi) || reading.aqi < 0) return false;
  const age = now - Date.parse(reading.timestamp);
  return age >= -15 * 60_000 && age <= 2 * 60 * 60_000;
}

export async function readAirSources(lat, lng, signal, token = WAQI_TOKEN) {
  let station = null;
  if (token) {
    const url = `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${encodeURIComponent(token)}`;
    station = stationReading(await environmentJson(url, 'air.waqi', signal));
    if (isRecentAirQuality(station)) return station;
  }
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=GMT`;
  const json = await environmentJson(url, 'air.current', signal);
  const modeled = modeledReading(json?.current, url);
  if (isRecentAirQuality(modeled)) return modeled;
  return station || modeled;
}

export async function getAirQuality(lat, lng, cityLabel = null, { signal } = {}) {
  signal?.throwIfAborted();
  const key = coordinateKey('aqi', lat, lng);
  if (!key) return null;
  const reading = getCached(key) || setCached(key, await readAirSources(lat, lng, signal));
  return reading && cityLabel ? { ...reading, city: cityLabel } : reading;
}

export async function getCurrentAirQuality(lat, lng, city, options) {
  const reading = await getAirQuality(lat, lng, city, options);
  return isRecentAirQuality(reading) ? reading : null;
}

function forecastHours(json) {
  const currentTime = json?.current?.time;
  const times = json?.hourly?.time;
  if (!Number.isFinite(currentTime) || typeof json.timezone !== 'string' || !Array.isArray(times)) return null;
  const first = times.findIndex(time => Number.isFinite(time) && time >= currentTime);
  if (first < 0) return null;
  const hours = times.slice(first, first + 49).flatMap((time, offset) => {
    const aqi = json.hourly.us_aqi?.[first + offset];
    return Number.isFinite(time) && Number.isFinite(aqi) && aqi >= 0 ? [{ time: time * 1000, aqi: Math.round(aqi) }] : [];
  });
  return hours.length ? { hours, timeZone: json.timezone } : null;
}

export async function getAirQualityForecast(lat, lng, { signal } = {}) {
  signal?.throwIfAborted();
  const key = coordinateKey('aqi-forecast', lat, lng);
  if (!key) return null;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi&hourly=us_aqi&forecast_days=2&timezone=auto&timeformat=unixtime`;
  return setCached(key, forecastHours(await environmentJson(url, 'air.forecast', signal, 6000)));
}
