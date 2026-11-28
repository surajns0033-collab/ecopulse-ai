import { describeRequestedForecast } from './requestedForecast.js';
import { getAirQualityForecast, getCurrentAirQuality, getAQIInsight } from '../services/environmentalData.js';
import { requestAI } from '../services/aiClient.js';
import { getChatResponse, isAIUnavailable } from '../services/geminiService';
import { isIndianPlace } from '../services/authorityDirectory.js';
import { logAction } from './activityLog';

export { handleWeather } from './weatherReplies.js';
export { handleDailyPlan, handleHealthTips } from './healthReplies.js';

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

export async function handleAirQuality(lat, lng, city, userId, { signal, forecast = false, message = '' } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'Which city should I check for air quality?',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  if (/\b(?:cpcb|naqi)\b|सीपीसीबी/iu.test(message)) return {
    text: 'An official CPCB AQI is unavailable here. These feeds do not provide the required station observations, averaging periods and completeness records. Check the [CPCB national AQI portal](https://airquality.cpcb.gov.in/AQI_India/) for the official reading.',
    cards: [], actions: [], status: 'unavailable',
  };
  if (forecast) {
    const hourly = await getAirQualityForecast(lat, lng, { signal });
    const reply = describeRequestedForecast(hourly, message);
    return { ...reply, text: (city ? '**' + city + '** — ' : '') + reply.text, cards: [], actions: [] };
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
    text: `Here's the current air quality for **${displayCity}**. 🌬️`,
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
      text: `♻️ **Waste basics that work in ${displayCity}:**\n\n• **Segregate at source:** green bin = wet/food waste, blue = dry (paper, plastic, metal), red/hazardous = batteries, e-waste, sanitary waste.\n• **Rinse and dry** plastic before putting it in dry waste — dirty plastic is not recyclable.\n• **Compost** kitchen waste in a bucket or balcony bin; it keeps food scraps out of disposal and open burning.\n• **E-waste:** hand it to a municipal e-waste collection point or an authorised recycler — never to the kabadiwala's fire pit.\n• **Report missed pickups / illegal dumping** to your ward office or the municipal helpline.\n\nTell me your city and I'll pull the exact municipal contact for waste complaints.`,
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
