import { WAQI_TOKEN, getCached, setCached, toUtcIso, requestSignal } from './environmentCache.js';

/**
 * Get real-time AQI data: tries WAQI (if real token configured), then Open-Meteo Air Quality (free, any global location)
 * Returns null if both fail (never returns fabricated data)
 */
export async function getAirQuality(lat, lng, cityLabel = null, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `aqi:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cityLabel ? { ...cached, city: cityLabel } : cached;

  // 1. Try WAQI only if user configured a real WAQI token
  if (WAQI_TOKEN) {
    try {
      const url = `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${WAQI_TOKEN}`;
      const res = await fetch(url, { signal: requestSignal(signal) });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok' && Number.isFinite(json.data?.aqi) && json.data.aqi >= 0) {
          const d = json.data;
          return setCached(cacheKey, {
            aqi: d.aqi ?? null,
            // WAQI's IAQI fields are subindices, not pollutant concentrations.
            station: d.city?.name || cityLabel || null,
            city: cityLabel || d.city?.name || null,
            timestamp: d.time?.iso || null,
            source: 'World Air Quality Index',
            sourceUrl: 'https://aqicn.org/map/',
          });
        }
      }
    } catch (err) {
      signal?.throwIfAborted();
      console.warn('WAQI fetch failed:', err.message);
    }
  }

  // 2. Open-Meteo Air Quality API — completely free, no key needed, works for any lat/lng worldwide
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=GMT`;
    const res = await fetch(url, { signal: requestSignal(signal) });
    if (res.ok) {
      const json = await res.json();
      const cur = json.current || {};
      if (Number.isFinite(cur.us_aqi) && cur.us_aqi >= 0) {
        return setCached(cacheKey, {
          aqi: Math.round(cur.us_aqi),
          pm25: cur.pm2_5 != null ? Math.round(cur.pm2_5 * 10) / 10 : null,
          pm10: cur.pm10 != null ? Math.round(cur.pm10 * 10) / 10 : null,
          no2: cur.nitrogen_dioxide != null ? Math.round(cur.nitrogen_dioxide * 10) / 10 : null,
          o3: cur.ozone != null ? Math.round(cur.ozone * 10) / 10 : null,
          co: cur.carbon_monoxide != null ? Math.round(cur.carbon_monoxide) : null,
          so2: cur.sulphur_dioxide != null ? Math.round(cur.sulphur_dioxide * 10) / 10 : null,
          scale: 'U.S. AQI',
          sourceType: 'modeled',
          city: cityLabel || null,
          timestamp: toUtcIso(cur.time),
          source: 'Open-Meteo Air Quality',
          sourceUrl: url,
        });
      }
    }
  } catch (err) {
    signal?.throwIfAborted();
    console.warn('Open-Meteo AQI fetch failed:', err.message);
  }

  return null;
}

export function isRecentAirQuality(reading, now = Date.now()) {
  if (!Number.isFinite(reading?.aqi) || reading.aqi < 0) return false;
  const age = now - Date.parse(reading.timestamp);
  return age >= -15 * 60_000 && age <= 2 * 60 * 60_000;
}

export async function getCurrentAirQuality(lat, lng, city, options) {
  const reading = await getAirQuality(lat, lng, city, options);
  return isRecentAirQuality(reading) ? reading : null;
}

/** Next 24 hours of AQI data for planning lower-exposure outdoor windows. */
export async function getAirQualityForecast(lat, lng, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `aqi-forecast:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // Unix times remain absolute while `timezone=auto` gives the city's display zone.
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi&hourly=us_aqi&forecast_days=2&timezone=auto&timeformat=unixtime`;
    const res = await fetch(url, { signal: requestSignal(signal, 6000) });
    if (!res.ok) return null;
    const json = await res.json();
    const times = json.hourly?.time || [];
    const currentTime = json.current?.time;
    if (!Number.isFinite(currentTime) || typeof json.timezone !== 'string') return null;
    const start = times.findIndex((time) => time >= currentTime);
    if (start < 0) return null;
    const hours = times.slice(start, start + 25).flatMap((time, offset) => {
      const aqi = json.hourly?.us_aqi?.[start + offset];
      return Number.isFinite(time) && Number.isFinite(aqi) && aqi >= 0
        ? [{ time: time * 1000, aqi: Math.round(aqi) }] : [];
    });
    return hours.length ? setCached(cacheKey, { hours, timeZone: json.timezone }) : null;
  } catch (err) {
    signal?.throwIfAborted();
    console.warn('Open-Meteo AQI forecast failed:', err.message);
    return null;
  }
}
