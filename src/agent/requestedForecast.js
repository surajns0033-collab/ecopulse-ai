import { recognitionText, schoolActivity } from './chatLanguage.js';

const periods = [
  [/\bmorning\b|\bsubah\b|सुबह/iu, 6, 12],
  [/\bafternoon\b|\bdopahar\b|दोपहर/iu, 12, 17],
  [/\bevening\b|\bshaam\b|शाम/iu, 17, 21],
  [/\btonight\b|\bnight\b|रात/iu, 20, 24],
];
const tomorrow = /\btomorrow\b|\bkal\b|कल|उद्या/iu;
const outsideHorizon = /\b(?:next (?:week|month|year)|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|day after tomorrow)\b|परसों|अगले हफ्ते/iu;

function localParts(clock, time) {
  return Object.fromEntries(clock.formatToParts(time).map(({ type, value }) => [type, value]));
}

function dayString(parts, days = 0) {
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + days)).toISOString().slice(0, 10);
}

function requestedHours(text) {
  const time = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?\b/i);
  if (time) {
    const hour = (+time[1] % 12) + (time[3].toLowerCase() === 'p' ? 12 : 0);
    return [hour, hour + 1];
  }
  const clock = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  if (clock) return [+clock[1], +clock[1] + 1];
  const period = periods.find(([pattern]) => pattern.test(text));
  return period ? period.slice(1) : [0, 24];
}

function forecastSlots(forecast, text, now) {
  const options = { timeZone: forecast.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23' };
  const clock = new Intl.DateTimeFormat('en-CA', options);
  const day = dayString(localParts(clock, now), tomorrow.test(text) ? 1 : 0);
  const [from, until] = requestedHours(text);
  return forecast.hours.filter(slot => {
    if (!Number.isFinite(slot.time) || slot.time < now || !Number.isFinite(slot.aqi) || slot.aqi < 0) return false;
    const parts = localParts(clock, slot.time);
    return dayString(parts) === day && +parts.hour >= from && +parts.hour < until;
  }).sort((a, b) => a.time - b.time);
}

const missing = 'I could not verify an hourly AQI forecast for the requested time. Recheck local advisories before outdoor activity.';

export function describeRequestedForecast(forecast, message, now = Date.now()) {
  const text = recognitionText(message);
  if (!forecast?.timeZone || !forecast.hours?.length || outsideHorizon.test(text)) return { text: missing, status: 'unavailable' };
  let slots;
  try {
    slots = forecastSlots(forecast, text, now);
  } catch (error) {
    if (error instanceof RangeError) return { text: missing, status: 'unavailable' };
    throw error;
  }
  if (!slots.length) return { text: missing, status: 'unavailable' };
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: forecast.timeZone, weekday: 'short',
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const range = slots.length === 1 ? clock.format(slots[0].time) :
    clock.formatRange(slots[0].time, slots.at(-1).time);
  const values = slots.map(slot => slot.aqi);
  const high = Math.max(...values);
  const low = Math.min(...values);
  let advice = 'Recheck the latest reading before going out.';
  if (schoolActivity(text)) {
    advice = high >= 101 ? 'Plan an indoor alternative for strenuous school activities and check local school advisories.'
      : 'Recheck the latest reading before assembly or sports and keep an indoor option for sensitive pupils.';
  }
  return { status: 'success', text: 'Available hourly forecast for ' + range + ' (' + forecast.timeZone +
    '): modeled U.S. AQI ' + (low === high ? high : low + '–' + high) + '. ' + advice +
    ' [Open-Meteo / CAMS forecast](https://open-meteo.com/en/docs/air-quality-api).' };
}
