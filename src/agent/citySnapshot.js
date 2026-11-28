import { getAQIInsight, getAQICategory } from '../services/environmentalData.js';
import { isIndianPlace } from '../services/authorityDirectory.js';
import { logAction } from './activityLog';

export function citySnapshot({ city, lat, lng, liveAqi, liveWeather, userId }) {
  const outsideIndia = !isIndianPlace(city);
  const lines = [`📍 **${city} — live environmental snapshot**`];

  if (liveAqi) {
    const category = getAQICategory(liveAqi.aqi);
    lines.push(`🌬️ **${liveAqi.scale || 'AQI'} ${liveAqi.aqi} — ${category.label}** [${liveAqi.source}](${liveAqi.sourceUrl}) · ${liveAqi.sourceType} · ${liveAqi.timestamp}`);
  } else {
    lines.push('🌬️ Live air-quality data is temporarily unavailable.');
  }

  if (liveWeather) {
    lines.push(`🌤️ **${liveWeather.temp}°C**, ${liveWeather.description} ([${liveWeather.source}](${liveWeather.sourceUrl}))`);
  } else {
    lines.push('🌤️ Live weather data is temporarily unavailable.');
  }

  if (liveAqi) lines.push(`\n${getAQIInsight(liveAqi)}`);
  lines.push(outsideIndia
    ? '\nI can help with the map, live environmental data, photo understanding, and complaint wording. I will not invent local authority contacts for a country that is not in the verified directory.'
    : '\nI can also show verified **local, state and national complaint contacts**, draft an email, or help report a problem from a photo.');

  logAction(userId, 'city_snapshot', { city, hasAqi: Boolean(liveAqi), hasWeather: Boolean(liveWeather) });
  return {
    text: lines.join('\n'),
    cards: [
      ...(liveAqi ? [{ type: 'aqi', data: { ...liveAqi, insight: getAQIInsight(liveAqi) } }] : []),
      { type: 'map', data: { lat, lng, city, label: city, query: city } },
    ],
    actions: [
      ...(outsideIndia
        ? [{ label: '📣 Complaint Guidance', action: 'START_COMPLAINT', variant: 'primary' }]
        : [{ label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'primary' }]),
      { label: '💊 Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
    ],
    status: 'success',
  };
}
