import { OWM_KEY, coordinateKey, environmentJson, cachedRead, toUtcIso } from './environmentCache.js';

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

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function stationTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const time = new Date(seconds * 1000);
  return Number.isFinite(time.getTime()) ? time.toISOString() : null;
}

function stationWeather(data) {
  if (!Number.isFinite(data?.main?.temp)) return null;
  return {
    temp: Math.round(data.main.temp), feelsLike: rounded(data.main.feels_like), humidity: data.main.humidity ?? null,
    windSpeed: data.wind?.speed ?? null, description: data.weather?.[0]?.description || 'Unknown', icon: data.weather?.[0]?.icon || null,
    timestamp: stationTimestamp(data.dt), source: 'OpenWeatherMap', sourceUrl: 'https://openweathermap.org/current',
  };
}

function modeledWeather(current, sourceUrl) {
  if (!Number.isFinite(current?.temperature_2m)) return null;
  return {
    temp: Math.round(current.temperature_2m), feelsLike: rounded(current.apparent_temperature),
    humidity: current.relative_humidity_2m ?? null, windSpeed: current.wind_speed_10m ?? null,
    description: wmoDescription(current.weather_code), icon: null, timestamp: toUtcIso(current.time), source: 'Open-Meteo', sourceUrl,
  };
}

export async function readWeatherSources(lat, lng, signal, token = OWM_KEY) {
  if (token) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${encodeURIComponent(token)}&units=metric`;
    const reading = stationWeather(await environmentJson(url, 'weather.openweather', signal));
    if (reading) return reading;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=ms&timezone=GMT`;
  const json = await environmentJson(url, 'weather.openmeteo', signal);
  return modeledWeather(json?.current, url);
}

export async function getWeather(lat, lng, { signal } = {}) {
  signal?.throwIfAborted();
  const key = coordinateKey('weather', lat, lng);
  if (!key) return null;
  return cachedRead(key, signal, shared => readWeatherSources(lat, lng, shared));
}
