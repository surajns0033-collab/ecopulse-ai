import { getWeather } from '../services/environmentalData.js';
import { logAction } from './activityLog';

function getWeatherPrecautions(weather) {
  const tips = [];
  const description = String(weather?.description || '').toLowerCase();
  const { temp, humidity, windSpeed: wind } = weather;

  if (/thunder|storm/.test(description)) {
    tips.push('Stay indoors during lightning; avoid open grounds, isolated trees, metal fencing, and water bodies.');
  } else if (/rain|shower|drizzle/.test(description)) {
    tips.push('Carry rain protection and avoid walking or driving through waterlogged roads—you cannot judge drain depth safely.');
  }
  if (Number.isFinite(temp) && temp >= 38) {
    tips.push('High heat: avoid strenuous outdoor activity from roughly noon to 4 PM, carry water, and take shade breaks.');
  } else if (Number.isFinite(temp) && temp >= 33) {
    tips.push('It is hot: hydrate regularly, use shade, and never leave children, older adults, or pets in a parked vehicle.');
  } else if (Number.isFinite(temp) && temp <= 12) {
    tips.push('Dress in warm layers, especially for children, older adults, and early-morning travel.');
  }
  if (Number.isFinite(wind) && wind >= 10) {
    tips.push('Strong wind: secure loose balcony items and keep away from weak branches, temporary sheets, and unstable hoardings.');
  }
  if (Number.isFinite(humidity) && humidity >= 80 && Number.isFinite(temp) && temp >= 28) {
    tips.push('High heat plus humidity can make exertion harder—slow down, hydrate, and take cooling breaks.');
  }
  if (!tips.length) {
    tips.push('No special weather hazard is evident from the current reading; normal precautions and hydration are appropriate.');
  }
  return tips.slice(0, 4);
}

export async function handleWeather(lat, lng, city, userId, { signal, forecast } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'Which city should I check for weather?',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const weather = await getWeather(lat, lng, { signal });
  const displayCity = city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (!weather) {
    return {
      text: `I couldn't verify the current weather for **${displayCity}** right now.`,
      cards: [],
      actions: [],
      status: 'unavailable',
    };
  }

  logAction(userId, 'weather_fetched', { city: displayCity });
  const precautions = getWeatherPrecautions(weather);

  return {
    text: `${forecast ? "I couldn't verify a forecast for the time you asked about. " : ''}Here's the current weather in **${displayCity}**. 🌤️\n\n🌡️ Temperature: **${weather.temp}°C**${Number.isFinite(weather.feelsLike) ? ` (feels like ${weather.feelsLike}°C)` : ''}\n💧 Humidity: ${Number.isFinite(weather.humidity) ? `${weather.humidity}%` : 'unavailable'}\n💨 Wind: ${Number.isFinite(weather.windSpeed) ? `${weather.windSpeed} m/s` : 'unavailable'}\n☁️ Conditions: ${weather.description}\n\n🛡️ **Precautions based on the current reading**\n${precautions.map((tip) => `• ${tip}`).join('\n')}\n\nSource: [${weather.source}](${weather.sourceUrl}). These are current-condition precautions, not a severe-weather warning or medical advice.`,
    cards: [],
    actions: [
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
      { label: '💊 AQI Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
    ],
    status: 'success',
  };
}
