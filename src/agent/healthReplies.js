import { getCurrentAirQuality, getAQICategory, getAQIInsight, getWeather } from '../services/environmentalData.js';
import { getChatResponse, isAIUnavailable } from '../services/geminiService';
import { tools } from '../services/agentTools';

export async function handleDailyPlan(lat, lng) {
  const plan = await tools.getDailyActionPlan({ lat, lng });

  return {
    text: "Here's your personalized eco-action plan for today! 🌱 Small actions make a big difference:",
    cards: [{ type: 'daily-plan', data: { actions: plan } }],
    actions: [],
    status: 'success',
  };
}

function conditions(displayCity, aqiData, weatherData) {
  const aqiContext = aqiData
    ? `Current ${aqiData.scale || 'AQI'} in ${displayCity}: ${aqiData.aqi} (${getAQICategory(aqiData.aqi).label}). ${aqiData.source} · ${aqiData.sourceType} · ${aqiData.timestamp}.`
    : `Live AQI for ${displayCity} is currently unavailable.`;
  const weatherContext = weatherData
    ? `Current weather in ${displayCity}: ${weatherData.temp}°C, ${weatherData.description}, humidity ${Number.isFinite(weatherData.humidity) ? weatherData.humidity + '%' : 'unavailable'}.`
    : 'Current weather unavailable.';

  return [aqiContext, weatherContext].join('\n');
}

export async function handleHealthTips(lat, lng, city, signal) {
  const displayCity = city || 'your area';
  const [aqiData, weatherData] = Number.isFinite(lat) && Number.isFinite(lng)
    ? await Promise.all([
        getCurrentAirQuality(lat, lng, city, { signal }),
        getWeather(lat, lng, { signal }),
      ])
    : [null, null];

  const context = conditions(displayCity, aqiData, weatherData);
  const prompt = `Give concise, practical, location-specific health tips for someone in ${displayCity} right now based ONLY on the live data provided. Do not include raw pollutant tables or unrelated topics.`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    context, { signal }
  );

  const fallback = isAIUnavailable(aiText);
  const tips = fallback ? [
    getAQIInsight(aqiData) || 'Check a fresh AQI reading before outdoor exercise.',
    'Choose quieter streets and keep a cleaner indoor space available. Ventilate when outdoor air improves.',
    weatherData?.temp >= 34 && 'In hot weather, carry water and take shade breaks.',
    'Follow local advisories and your clinician’s advice for individual health decisions.',
  ].filter(Boolean).join('\n• ') : aiText;
  return {
    text: context + '\n\n' + (fallback ? '• ' : '') + tips,
    cards: aqiData ? [{ type: 'aqi', data: aqiData }] : [],
    actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
    status: 'success',
  };
}
