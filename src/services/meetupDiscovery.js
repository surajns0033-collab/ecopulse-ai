import { alias, normalize } from './placeMatching.js';

// The form stores date-only values as UTC midnight. Compare those date labels
// with today's calendar date in the selected city (or the browser, if unknown).
export function meetupDayStart(timeZone, now = new Date()) {
  const clock = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
  const parts = Object.fromEntries(clock.formatToParts(now).map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
}

function eventTime(date) {
  if (typeof date?.toMillis === 'function') return date.toMillis();
  if (Number.isFinite(date?.seconds)) return date.seconds * 1000;
  if (date instanceof Date) return date.getTime();
  return typeof date === 'string' ? Date.parse(date) : NaN;
}

function venueMatches(venue, city) {
  if (!city) return true;
  const name = normalize(alias(city.split(',')[0].trim()));
  return typeof venue === 'string' && venue.split(',').some(part => normalize(alias(part.trim())) === name);
}

export function selectUpcomingEvents(rows, { since, category, city, max }) {
  return rows.filter(event => (!event.status || event.status === 'published') &&
    eventTime(event.date) >= since.getTime() && (!category || category === event.category) && venueMatches(event.location, city))
    .sort((a, b) => eventTime(a.date) - eventTime(b.date)).slice(0, max);
}
