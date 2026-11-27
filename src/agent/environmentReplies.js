import { getCurrentAirQuality, getAQIInsight, getAQICategory, getWeather } from '../services/environmentalData.js';
import { requestAI } from '../services/aiClient.js';
import { getChatResponse, isAIUnavailable } from '../services/geminiService';
import { isIndianPlace } from '../services/authorityDirectory.js';
import { tools } from '../services/agentTools';
import { logAction } from './activityLog';

export async function explainSmogChoices(question, choices, signal) {
  const selected = choices.map(({ advice, impact }) => `• ${advice} ${impact}`).join('\n');
  const result = await requestAI({
    system: 'In two short sentences, explain one choice that reduces exposure and one that reduces emissions at the source. Use only the listed actions and impacts. Do not add readings, numerical savings or medical instructions.',
    messages: [{ role: 'user', text: question + '\n\nSelected actions:\n' + selected }],
    // Leave room for reasoning tokens as well as the two visible sentences.
    maxTokens: 1400,
    temperature: 0.3,
    signal,
  });
  signal?.throwIfAborted();
  if (!result?.text || result.truncated) {
    const reason = result?.truncated ? 'The AI reply was cut short.' : 'The AI explanation is unavailable right now.';
    return {
      text: reason + ' These are the direct impacts recorded in your plan:\n\n' +
        choices.map(({ impact }) => '• ' + impact).join('\n'),
      cards: [], actions: [], status: 'unavailable',
    };
  }
  return { text: result.text, cards: [], actions: [], status: 'success' };
}

export async function handleAirQuality(lat, lng, city, userId, { signal, forecast = false } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'Which city should I check for air quality?',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const aqiData = await getCurrentAirQuality(lat, lng, city, { signal });
  const displayCity = city || aqiData?.city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (!aqiData) {
    return {
      text: `I couldn't verify the air-quality reading for **${displayCity}**. Try again later, or check [World Air Quality Index](https://aqicn.org/map/)${isIndianPlace(city) ? ' or the CPCB Sameer app' : ''}.`,
      cards: [],
      actions: [{ label: '📋 Report Air Issue', action: 'QUICK_REPORT', variant: 'primary' }],
      status: 'unavailable',
    };
  }

  const insight = getAQIInsight(aqiData);
  logAction(userId, 'aqi_fetched', { city: displayCity, aqi: aqiData.aqi });

  return {
    text: `${forecast ? "I couldn't verify AQI for the time you asked about. " : ''}Here's the current air quality for **${displayCity}**. 🌬️`,
    cards: [{ type: 'aqi', data: { ...aqiData, insight } }],
    actions: [
      { label: '💊 Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
      { label: '📋 File Report', action: 'QUICK_REPORT', variant: 'secondary' },
    ],
    status: 'success',
  };
}

export async function handleWaterQuality(city) {
  const displayCity = city || 'your area';
  return {
    text: `Water quality monitoring via free APIs isn't available for **${displayCity}** yet. Here's what you can check:`,
    cards: [{ type: 'water-quality', data: { city: displayCity } }],
    actions: [{ label: '📋 Report Water Issue', action: 'QUICK_WATER_REPORT', variant: 'primary' }],
    status: 'info',
  };
}

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

export async function handleRoutes(city, lat, lng) {
  return {
    text: `I can’t verify which route has the lowest pollution${city ? ` in **${city}**` : ''}. For less roadside exposure, choose quieter parallel streets and avoid lingering beside idling vehicles. Public transit or carpooling can reduce emissions compared with driving alone.`,
    cards: Number.isFinite(lat) && Number.isFinite(lng) ? [{ type: 'map', data: { lat, lng, city } }] : [],
    actions: [],
    status: 'success',
  };
}

export async function handleWasteTips(city, lat, lng) {
  const displayCity = city || 'your city';
  const prompt = `Provide concise, practical waste reduction, segregation, and e-waste/recycling guidance specifically relevant to ${displayCity} (including local municipal body name if known).`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    `Target city: ${displayCity}${lat && lng ? ` (${lat.toFixed(4)}, ${lng.toFixed(4)})` : ''}.`
  );

  if (isAIUnavailable(aiText)) {
    return {
      text: `♻️ **Waste basics that work in ${displayCity}:**\n\n• **Segregate at source:** green bin = wet/food waste, blue = dry (paper, plastic, metal), red/hazardous = batteries, e-waste, sanitary waste.\n• **Rinse and dry** plastic before putting it in dry waste — dirty plastic is not recyclable.\n• **Compost** kitchen waste in a bucket or balcony bin; it cuts half your daily waste.\n• **E-waste:** hand it to a municipal e-waste collection point or an authorised recycler — never to the kabadiwala's fire pit.\n• **Report missed pickups / illegal dumping** to your ward office or the municipal helpline.\n\nTell me your city and I'll pull the exact municipal contact for waste complaints.`,
      cards: [],
      actions: [{ label: '📋 Report Waste Issue', action: 'QUICK_REPORT', variant: 'primary' }],
      status: 'success',
    };
  }

  return {
    text: aiText,
    cards: [],
    actions: [{ label: '📍 Find Collection Events', action: 'QUICK_FIND_EVENTS', variant: 'secondary' }],
    status: 'success',
  };
}
