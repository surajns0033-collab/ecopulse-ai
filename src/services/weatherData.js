import { logFailure } from './diagnostics.js';
import { OWM_KEY, getCached, setCached, toUtcIso, requestSignal } from './environmentCache.js';

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
    } catch {
      signal?.throwIfAborted();
      logFailure('weather.openweather');
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
  } catch {
    signal?.throwIfAborted();
    logFailure('weather.openmeteo');
  }

  return null;
}
