import { getAirQuality, getAirQualityForecast, getAQIInsight, getWeather } from '../services/environmentalData.js';
import { AWAITING_SMOG_PROFILE, parseSmogProfile } from './smogProfile.js';
import { exposureAdvice, commuteAdvice, indoorAirAdvice, cookingAdvice, communityAdvice } from './smogAdvice.js';
import { currentReading, forecastWindow } from './smogForecast.js';

export function startSmogPlan(city) {
  return {
    text: `Let's make a clean-air plan for **${city || 'your city'}**. Share whatever you know, or say **skip** for a general plan:\n\n• Commute: car / two-wheeler / transit / walk or cycle / work from home\n• Routine: office or school / outdoor work / mostly home / mixed\n• Cooking: gas / induction or electric\n• Air cleaning: HEPA / DIY filter / no purifier\n• Household: children, older adults, or heart/lung sensitivity (optional)\n\nExample: *“Car commute, outdoor work, gas stove, HEPA purifier, one child.”*`,
    cards: [],
    actions: [],
    status: 'needs_info',
    pending: AWAITING_SMOG_PROFILE,
  };
}

export function buildSmogPlan(profile, { city, aqi, weather, forecast, now = Date.now() }) {
  const current = currentReading(aqi, now);
  const index = current.reading?.aqi;
  const routine = [profile.commute, profile.routine, profile.cooking, profile.filtration].filter(Boolean).join('; ') || 'not specified';
  const household = profile.vulnerable.join(', ') || 'not stated';
  const commuteImpact = profile.commute === 'walk/cycle'
    ? 'Walking and cycling have no tailpipe emissions. Quieter routes or less-polluted times can reduce exposure.'
    : 'Fewer solo vehicle kilometres and less idling reduce tailpipe emissions. Quieter routes may reduce roadside exposure.';
  const sections = [
    ['🛡️ 1. Exposure routine', exposureAdvice(index, profile), 'Shorter outdoor exposure can reduce the amount of particles you breathe; it does not reduce emissions.'],
    ['🚌 2. Lower-emission commute', commuteAdvice(profile.commute, index), commuteImpact],
    ['🏠 3. Indoor air', indoorAirAdvice(profile.filtration, index), 'Source control prevents new indoor particles; filtration removes particles already in the air.'],
    ['🍳 4. Cooking', ...cookingAdvice(profile.cooking, profile.noVentedHood)],
    ['🌿 5. Community choice', ...communityAdvice(profile.community, index)],
  ];
  const lowWind = Number.isFinite(weather?.windSpeed) && weather.windSpeed < 2
    ? ` Wind is low (${weather.windSpeed} m/s), so dispersion may be slow.` : '';

  return {
    text: [
      `🌫️ **Your clean-air plan — ${city || 'your area'}**`,
      current.text + lowWind,
      `**Profile provided:** ${routine}; household sensitivity: ${household}.`,
      ...sections.map(([title, advice, impact]) => `**${title}**\n${advice}\n**Direct impact:** ${impact}`),
      `🕒 ${forecastWindow(forecast, now, profile.vulnerable.length > 0 || profile.community === 'school')}`,
      '_General exposure guidance, not medical advice. Follow local advisories and consult a clinician for individual health decisions._ [U.S. AQI health guidance](https://www.airnow.gov/aqi/aqi-basics/)',
    ].join('\n\n'),
    cards: current.reading ? [{ type: 'aqi', data: { ...current.reading, insight: getAQIInsight(current.reading) } }] : [],
    actions: [
      {
        label: 'Explain these choices with AI', action: 'EXPLAIN_SMOG_CHOICES', variant: 'primary',
        data: { choices: sections.map(([, advice, impact]) => ({ advice, impact })) },
      },
      { label: '💊 AQI Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
      { label: '📷 Report a Pollution Source', action: 'OPEN_IMAGE_PICKER', variant: 'secondary' },
    ],
    status: 'success',
  };
}

export async function getSmogPlan(message, { city, lat, lng }, signal) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'I need a city for local air-quality advice. Type the city name or choose Share Location, then ask for your smog plan.',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const [aqi, weather, forecast] = await Promise.all([
    getAirQuality(lat, lng, city, { signal }),
    getWeather(lat, lng, { signal }),
    getAirQualityForecast(lat, lng, { signal }),
  ]);
  signal?.throwIfAborted();
  return buildSmogPlan(parseSmogProfile(message), { city, aqi, weather, forecast });
}
