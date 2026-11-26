// Current environmental estimates from Open-Meteo, or configured station providers.

const rawWaqi = import.meta.env?.VITE_WAQI_TOKEN || '';
const rawOwm = import.meta.env?.VITE_OPENWEATHER_KEY || import.meta.env?.VITE_OPENWEATHER_API_KEY || '';

function isConfiguredKey(val) {
  return Boolean(val && !val.startsWith('your_') && !val.includes('replace_with'));
}

const WAQI_TOKEN = isConfiguredKey(rawWaqi) ? rawWaqi : '';
const OWM_KEY = isConfiguredKey(rawOwm) ? rawOwm : '';

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const apiCache = new Map();

function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  if (value != null) apiCache.set(key, { value, ts: Date.now() });
  return value;
}

function toUtcIso(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr) return null;
  return timeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}Z`;
}

function requestSignal(signal, timeout = 5000) {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

// Weather code -> human readable description (WMO codes used by Open-Meteo)
function wmoDescription(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57].includes(code)) return 'Freezing drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if (code === 95) return 'Thunderstorms';
  if ([96, 99].includes(code)) return 'Thunderstorms with hail';
  return 'Unknown';
}

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
        if (json.status === 'ok' && Number.isFinite(json.data?.aqi)) {
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
      if (Number.isFinite(cur.us_aqi)) {
        return setCached(cacheKey, {
          aqi: Math.round(cur.us_aqi),
          pm25: cur.pm2_5 != null ? Math.round(cur.pm2_5 * 10) / 10 : null,
          pm10: cur.pm10 != null ? Math.round(cur.pm10 * 10) / 10 : null,
          no2: cur.nitrogen_dioxide != null ? Math.round(cur.nitrogen_dioxide * 10) / 10 : null,
          o3: cur.ozone != null ? Math.round(cur.ozone * 10) / 10 : null,
          co: cur.carbon_monoxide != null ? Math.round(cur.carbon_monoxide) : null,
          so2: cur.sulphur_dioxide != null ? Math.round(cur.sulphur_dioxide * 10) / 10 : null,
          scale: 'U.S. AQI',
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

/** Next 24 hours of AQI data for planning lower-exposure outdoor windows. */
export async function getAirQualityForecast(lat, lng, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `aqi-forecast:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi&hourly=us_aqi,pm2_5,pm10&forecast_days=2&timezone=auto`;
    const res = await fetch(url, { signal: requestSignal(signal, 6000) });
    if (!res.ok) return null;
    const json = await res.json();
    const times = json.hourly?.time || [];
    const currentTime = json.current?.time;
    if (!currentTime) return null;
    const start = times.findIndex((time) => time >= currentTime);
    if (start < 0) return null;
    const hours = times.slice(start, start + 24).map((time, offset) => {
      const index = start + offset;
      return {
        time,
        aqi: json.hourly?.us_aqi?.[index] == null ? null : Math.round(json.hourly.us_aqi[index]),
        pm25: json.hourly?.pm2_5?.[index] == null ? null : Math.round(json.hourly.pm2_5[index] * 10) / 10,
        pm10: json.hourly?.pm10?.[index] == null ? null : Math.round(json.hourly.pm10[index] * 10) / 10,
      };
    }).filter((hour) => Number.isFinite(hour.aqi));
    return setCached(cacheKey, { hours, source: 'Open-Meteo Air Quality', sourceUrl: url });
  } catch (err) {
    signal?.throwIfAborted();
    console.warn('Open-Meteo AQI forecast failed:', err.message);
    return null;
  }
}

/**
 * Get current weather — tries OpenWeatherMap (if real key configured), then Open-Meteo (free, no key needed)
 */
export async function getWeather(lat, lng, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `weather:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (OWM_KEY) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
      const res = await fetch(url, { signal: requestSignal(signal) });
      if (res.ok) {
        const d = await res.json();
        if (Number.isFinite(d.main?.temp)) {
          return setCached(cacheKey, {
            temp: Math.round(d.main.temp),
            feelsLike: Number.isFinite(d.main.feels_like) ? Math.round(d.main.feels_like) : null,
            humidity: d.main?.humidity ?? null,
            windSpeed: d.wind?.speed ?? null,
            description: d.weather?.[0]?.description || 'Unknown',
            icon: d.weather?.[0]?.icon || null,
            timestamp: Number.isFinite(d.dt) ? new Date(d.dt * 1000).toISOString() : null,
            source: 'OpenWeatherMap',
            sourceUrl: 'https://openweathermap.org/current',
          });
        }
      }
    } catch (err) {
      signal?.throwIfAborted();
      console.warn('OpenWeatherMap failed:', err.message);
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=ms&timezone=GMT`;
    const res = await fetch(url, { signal: requestSignal(signal) });
    if (res.ok) {
      const d = await res.json();
      const cur = d.current || {};
      if (!Number.isFinite(cur.temperature_2m)) return null;
      return setCached(cacheKey, {
        temp: Math.round(cur.temperature_2m),
        feelsLike: Number.isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : null,
        humidity: cur.relative_humidity_2m ?? null,
        windSpeed: cur.wind_speed_10m ?? null,
        description: Number.isFinite(cur.weather_code) ? wmoDescription(cur.weather_code) : 'Unknown',
        icon: null,
        timestamp: toUtcIso(cur.time),
        source: 'Open-Meteo',
        sourceUrl: url,
      });
    }
  } catch (err) {
    signal?.throwIfAborted();
    console.warn('Open-Meteo failed:', err.message);
  }

  return null;
}

export function getGoogleMapsUrl(lat, lng, query = '') {
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return 'https://maps.google.com';
}

export function getAQICategory(aqi) {
  if (aqi == null) return { label: 'Unknown', color: '#94a3b8', bg: '#f1f5f9' };
  if (aqi <= 50)  return { label: 'Good', color: '#16a34a', bg: '#dcfce7' };
  if (aqi <= 100) return { label: 'Moderate', color: '#ca8a04', bg: '#fef9c3' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', color: '#ea580c', bg: '#ffedd5' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#e11d48', bg: '#ffe4e6' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#9333ea', bg: '#f3e8ff' };
  return { label: 'Hazardous', color: '#881337', bg: '#ffe4e6' };
}

export function getAQIInsight(aqiData) {
  if (!Number.isFinite(aqiData?.aqi)) return null;
  const { aqi } = aqiData;
  if (aqi > 300) return 'Air quality is hazardous. Stay indoors where possible and follow local health advisories.';
  if (aqi > 200) return 'Air quality is very unhealthy. Avoid outdoor exertion and wear a well-fitted N95 if you must go out.';
  if (aqi > 150) return 'Air quality is unhealthy. Reduce outdoor activity and wear a well-fitted N95 if you must go out.';
  if (aqi > 100) return 'Air quality is unhealthy for sensitive groups. Children, older adults, and people with heart or lung conditions should limit prolonged outdoor exposure.';
  if (aqi > 50)  return 'Air quality is moderate. Unusually sensitive people may want to reduce prolonged outdoor exertion.';
  return 'The reported AQI is in the Good range. Keep following any local advisories.';
}
