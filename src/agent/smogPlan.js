import { getAirQuality, getAirQualityForecast, getAQICategory, getAQIInsight, getWeather } from '../services/environmentalData.js';
import { AWAITING_SMOG_PROFILE, parseSmogProfile } from './smogProfile.js';

const HOUR_MS = 60 * 60 * 1000;

export function startSmogPlan(city) {
  return {
    text: `Let's make a clean-air plan for **${city || 'your city'}**. Share whatever you know, or say **skip** for a general plan:\n\n• Commute: car / two-wheeler / transit / walk or cycle / work from home\n• Routine: office or school / outdoor work / mostly home / mixed\n• Cooking: gas / induction or electric\n• Air cleaning: HEPA / DIY filter / no purifier\n• Household: children, older adults, or heart/lung sensitivity (optional)\n\nExample: *“Car commute, outdoor work, gas stove, HEPA purifier, one child.”*`,
    cards: [],
    actions: [],
    status: 'needs_info',
    pending: AWAITING_SMOG_PROFILE,
  };
}

function currentReading(reading, now) {
  if (!Number.isFinite(reading?.aqi) || reading.aqi < 0) {
    return { text: '**Current AQI:** unavailable. This plan does not assume a reading.' };
  }

  const time = Date.parse(reading.timestamp);
  if (!Number.isFinite(time) || time < now - 2 * HOUR_MS || time > now + HOUR_MS / 4) {
    return { text: '**Current AQI:** no recent timestamp could be verified. The older or undated value is not used for advice.' };
  }

  const source = reading.sourceType === 'modeled' ? 'Open-Meteo / CAMS modeled U.S. AQI' : reading.source || 'Reported AQI';
  const sourceTime = new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  return {
    reading,
    text: `**Current AQI: ${reading.aqi} — ${getAQICategory(reading.aqi).label}.** ${source} · source time: ${sourceTime} UTC.`,
  };
}

function forecastWindow(forecast, now) {
  const unavailable = '**Daytime AQI forecast:** no upcoming daytime forecast is available. Check a fresh reading before going out.';
  if (!forecast?.timeZone || !forecast.hours?.length) return unavailable;

  let clock;
  try {
    clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: forecast.timeZone });
  } catch {
    return unavailable;
  }

  let best;
  for (const slot of forecast.hours) {
    if (!Number.isFinite(slot.aqi) || slot.aqi < 0 || !Number.isFinite(slot.time) || slot.time < now || slot.time > now + 24 * HOUR_MS) continue;
    const hour = Number(clock.format(slot.time));
    if (hour < 6 || hour >= 18) continue;
    if (!best || slot.aqi < best.aqi || (slot.aqi === best.aqi && slot.time < best.time)) best = slot;
  }
  if (!best) return unavailable;

  const label = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: forecast.timeZone,
  }).format(best.time);
  const caution = best.aqi >= 151 ? ' Even the lowest forecast is unhealthy; consider postponing optional outdoor exertion.' : '';
  return `**Lowest modeled daytime AQI in the next 24 hours:** ${label} (${forecast.timeZone}), forecast U.S. AQI ${best.aqi}. [Open-Meteo forecast](https://open-meteo.com/en/docs/air-quality-api). Lower does not mean safe.${caution} Check local advisories and the latest reading before going out.`;
}

function exposureAdvice(aqi, { routine, vulnerable }) {
  let advice = 'Follow local guidance and avoid visible smoke and idling traffic.';
  if (aqi == null) advice = 'Check a fresh AQI reading before strenuous outdoor activity.';
  else if (aqi >= 301) advice = 'Stay in a cleaner indoor space if possible, postpone non-essential trips, and follow local emergency guidance.';
  else if (aqi >= 201) advice = 'Avoid outdoor exertion and reschedule optional outdoor work. Use a cleaner indoor space when possible.';
  else if (aqi >= 151) advice = 'Move strenuous exercise indoors and shorten non-essential outdoor tasks.';
  else if (aqi >= 101) advice = 'Shorten prolonged outdoor exertion, especially near traffic.';
  if (aqi >= 151) advice += ' For adults who can wear one safely, a well-fitting N95/FFP2 can reduce particle exposure on unavoidable trips.';

  if (vulnerable.length && (aqi == null || aqi >= 51)) {
    advice += ' For household members you flagged as sensitive, plan shorter outdoor activity and have a cleaner indoor alternative ready.';
  }
  if (routine === 'outdoor work' && (aqi == null || aqi >= 101)) advice += ' If you work outside, take breaks in a cleaner indoor space when possible.';
  if (routine === 'office/school' && aqi >= 101) advice += ' For unavoidable office or school trips, recheck AQI before both legs and choose indoor exercise or play.';
  return advice;
}

function commuteAdvice(commute, aqi) {
  switch (commute) {
    case 'car': return 'Bundle errands, carpool when practical, and turn off the engine when parked.';
    case 'two-wheeler': return `${aqi >= 151 ? 'Use metro/train/bus for the longest leg today if practical; ' : ''}avoid waiting behind buses and trucks.`;
    case 'walk/cycle': return aqi >= 151
      ? 'Avoid strenuous roadside exercise today; use transit for the polluted segment if practical.'
      : 'Use quieter internal streets, and check current AQI before longer or strenuous trips.';
    case 'work from home': return 'Keep the avoided commute benefit by grouping necessary errands.';
    case 'public transport': return 'Keep the long leg on transit and reach it through quieter internal streets.';
    default: return 'Choose transit or carpool where practical, and avoid idling; no commute mode was assumed.';
  }
}

const INDOOR_SETUP = {
  'HEPA purifier': 'Run HEPA in one cleaner-air room, keep airflow clear, damp-clean, and avoid ozone/ionizer modes.',
  'DIY filtered-air setup': 'Keep your existing filtered-air setup unobstructed and follow its safe operating instructions. Damp-clean surfaces to reduce dust.',
};

function indoorAirAdvice(filtration, aqi) {
  const setup = INDOOR_SETUP[filtration] ?? 'Create one cleaner-air room, damp-clean instead of dry sweeping, and avoid burning incense or candles during smog.';
  const ventilation = aqi >= 151
    ? 'If safe, keep windows closed while outdoor air is poor. Air out when it improves; never block exhaust vents.'
    : 'Check outdoor air before opening windows and ventilate when it is cleaner.';
  return `${setup} ${ventilation}`;
}

export function buildSmogPlan(profile, { city, aqi, weather, forecast, now = Date.now() }) {
  const current = currentReading(aqi, now);
  const index = current.reading?.aqi;
  const routine = [profile.commute, profile.routine, profile.cooking, profile.filtration].filter(Boolean).join('; ') || 'not specified';
  const household = profile.vulnerable.join(', ') || 'not stated';
  const commuteImpact = profile.commute === 'walk/cycle'
    ? 'Walking and cycling have no tailpipe emissions. Quieter routes or less-polluted times can reduce exposure.'
    : 'Fewer solo vehicle kilometres and less idling reduce tailpipe emissions. Quieter routes may reduce roadside exposure.';
  const cookingAdvice = profile.cooking === 'gas stove'
    ? 'Use an exhaust hood that vents outdoors while the gas stove runs. Use induction when practical if you have it.'
    : 'Run an exhaust fan that vents outdoors when cooking, especially when frying or using high heat.';
  const sections = [
    ['🛡️ 1. Exposure routine', exposureAdvice(index, profile), 'Shorter outdoor exposure can reduce the amount of particles you breathe; it does not reduce emissions.'],
    ['🚌 2. Lower-emission commute', commuteAdvice(profile.commute, index), commuteImpact],
    ['🏠 3. Indoor air', indoorAirAdvice(profile.filtration, index), 'Source control prevents new indoor particles; filtration removes particles already in the air.'],
    ['🍳 4. Cooking', cookingAdvice, 'Exhaust removes cooking pollutants from the room; induction avoids gas combustion at the stove.'],
    ['🌿 5. Community choice', 'Avoid burning leaves or waste, discourage idling, and report recurring smoke or dust with a location and observation.', 'Avoiding burning and idling cuts emissions at the source.'],
  ];
  const lowWind = Number.isFinite(weather?.windSpeed) && weather.windSpeed < 2
    ? ` Wind is low (${weather.windSpeed} m/s), so dispersion may be slow.` : '';

  return {
    text: [
      `🌫️ **Your clean-air plan — ${city || 'your area'}**`,
      current.text + lowWind,
      `**Profile provided:** ${routine}; household sensitivity: ${household}.`,
      ...sections.map(([title, advice, impact]) => `**${title}**\n${advice}\n**Direct impact:** ${impact}`),
      `🕒 ${forecastWindow(forecast, now)}`,
      '_General exposure guidance, not medical advice. Follow local advisories and consult a clinician for individual health decisions._ [U.S. AQI health guidance](https://www.airnow.gov/aqi/aqi-basics/)',
    ].join('\n\n'),
    cards: current.reading ? [{ type: 'aqi', data: { ...current.reading, insight: getAQIInsight(current.reading) } }] : [],
    actions: [
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
