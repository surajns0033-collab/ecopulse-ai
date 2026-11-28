import { getAQICategory, isRecentAirQuality } from '../services/environmentalData.js';

const HOUR_MS = 60 * 60 * 1000;

export function currentReading(reading, now) {
  if (!Number.isFinite(reading?.aqi) || reading.aqi < 0) {
    return { text: '**Current AQI:** unavailable. This plan does not assume a reading.' };
  }

  const time = Date.parse(reading.timestamp);
  if (!isRecentAirQuality(reading, now)) {
    return { text: '**Current AQI:** no recent timestamp could be verified. The older or undated value is not used for advice.' };
  }

  const source = reading.sourceType === 'modeled' ? 'Open-Meteo / CAMS modeled U.S. AQI' : reading.source || 'Reported AQI';
  const sourceTime = new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  return {
    reading,
    text: `**Current AQI: ${reading.aqi} — ${getAQICategory(reading.aqi).label}.** ${source} · source time: ${sourceTime} UTC.`,
  };
}

function lowestDaytimeHour(hours, now, clock) {
  let best;
  for (const slot of hours) {
    if (!Number.isFinite(slot.aqi) || slot.aqi < 0 || !Number.isFinite(slot.time) || slot.time < now || slot.time > now + 24 * HOUR_MS) continue;
    const hour = Number(clock.format(slot.time));
    if (hour < 6 || hour >= 18) continue;
    if (!best || slot.aqi < best.aqi || (slot.aqi === best.aqi && slot.time < best.time)) best = slot;
  }
  return best;
}

export function forecastWindow(forecast, now, sensitive) {
  const unavailable = '**Daytime AQI forecast:** no upcoming daytime forecast is available. Check a fresh reading before going out.';
  if (!forecast?.timeZone || !forecast.hours?.length) return unavailable;

  let clock;
  try {
    clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: forecast.timeZone });
  } catch {
    return unavailable;
  }

  const best = lowestDaytimeHour(forecast.hours, now, clock);
  if (!best) return unavailable;

  const label = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: forecast.timeZone,
  }).format(best.time);
  let caution = '';
  if (best.aqi >= 151) caution = ' Even the lowest forecast is unhealthy; consider postponing optional outdoor exertion.';
  else if (sensitive && best.aqi >= 101) caution = ' This hour is still unhealthy for sensitive groups. Shorten strenuous outdoor play or choose an indoor activity.';
  return `**Lowest modeled daytime AQI in the next 24 hours:** ${label} (${forecast.timeZone}), forecast U.S. AQI ${best.aqi}. [Open-Meteo forecast](https://open-meteo.com/en/docs/air-quality-api). Lower does not mean safe.${caution} Check local advisories and the latest reading before going out.`;
}
