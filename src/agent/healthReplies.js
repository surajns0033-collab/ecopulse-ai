import { getCurrentAirQuality, getAQICategory, getWeather } from '../services/environmentalData.js';
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

export async function handleHealthTips(lat, lng, city, signal) {
  const displayCity = city || 'your area';
  const [aqiData, weatherData] = Number.isFinite(lat) && Number.isFinite(lng)
    ? await Promise.all([
        getCurrentAirQuality(lat, lng, city, { signal }),
        getWeather(lat, lng, { signal }),
      ])
    : [null, null];

  const aqiContext = aqiData
    ? `Current AQI in ${displayCity}: ${aqiData.aqi} (${getAQICategory(aqiData.aqi).label}). Source: ${aqiData.source}.`
    : `Live AQI for ${displayCity} is currently unavailable.`;
  const weatherContext = weatherData
    ? `Current weather in ${displayCity}: ${weatherData.temp}°C, ${weatherData.description}, humidity ${weatherData.humidity}%.`
    : 'Current weather unavailable.';

  const prompt = `Give concise, practical, location-specific health tips for someone in ${displayCity} right now based ONLY on the live data provided. Do not include raw pollutant tables or unrelated topics.`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    `${aqiContext}\n${weatherContext}`, { signal }
  );

  if (isAIUnavailable(aiText)) {
    const category = aqiData ? getAQICategory(aqiData.aqi) : null;
    const tips = [];
    if (aqiData?.aqi > 150) {
      tips.push('Wear an **N95 mask** whenever you step out; cloth masks do not filter PM2.5.');
      tips.push('Keep windows shut during peak traffic hours (8–10 AM, 6–8 PM) and use a purifier indoors if you have one.');
      tips.push('Skip outdoor exercise today — move workouts indoors.');
    } else if (aqiData?.aqi > 100) {
      tips.push('Sensitive groups (children, elderly, asthma/allergy) should cut long outdoor exposure.');
      tips.push('Prefer walking/cycling on quieter lanes away from main roads.');
      tips.push('Keep inhalers/medication handy if you have a respiratory condition.');
    } else {
      tips.push('Air is acceptable today — normal outdoor activity is fine.');
      tips.push('Still prefer green spaces and side lanes over main-road footpaths.');
      tips.push('Drink water and take shade breaks if it is hot and humid.');
    }
    if (weatherData?.temp >= 34) tips.push('It is hot — carry water and avoid the 12–4 PM sun.');
    if (weatherData?.humidity >= 80) tips.push('High humidity: light cotton clothes and extra hydration help.');

    return {
      text: aqiData
        ? `💊 **Today in ${displayCity}** — AQI **${aqiData.aqi}** (${category.label})\n\n${tips.map((t) => `• ${t}`).join('\n')}\n\n_General guidance, not medical advice — consult a doctor for any breathing problem._`
        : `💊 General tips for **${displayCity}** today:\n\n• Check the AQI before outdoor exercise.\n• Prefer side lanes and green spaces over main-road footpaths.\n• Keep windows shut during peak traffic hours.\n• Sensitive groups should carry medication and limit long outdoor exposure.\n\n_General guidance, not medical advice._`,
      cards: [],
      actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
      status: 'success',
    };
  }

  return {
    text: `${aqiContext}\n${weatherContext}\n\n${aiText}`,
    cards: aqiData ? [{ type: 'aqi', data: aqiData }] : [],
    actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
    status: 'success',
  };
}
