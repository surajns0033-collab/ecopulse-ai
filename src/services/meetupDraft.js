import { MEETUP_CATEGORIES } from '../firebase/collections.js';
import { isModelObject } from './modelJson.js';

const categories = new Set(MEETUP_CATEGORIES.map(category => category.id));
export const defaultMeetupTime = '7:00 AM';
export const defaultMeetupCapacity = 25;

/** @param {unknown} value @param {number} max */
function boundedText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

/** Date-only meetup records represent a calendar day at UTC midnight.
 * @param {unknown} value */
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value + 'T') ? value : null;
}

/** @param {unknown} value */
function seatCount(value) {
  const count = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : null;
}

/** Decode an untrusted draft before React renders it or a user publishes it.
 * @param {unknown} value @param {string} note @param {string | null} city */
export function readMeetupDraft(value, note, city) {
  if (!isModelObject(value)) return null;
  const title = boundedText(value.title, 180);
  const location = boundedText(value.location ?? city, 300);
  const date = calendarDate(value.date);
  const description = boundedText(value.description ?? note, 6000);
  const time = boundedText(value.time ?? defaultMeetupTime, 80);
  const capacity = seatCount(value.capacity ?? defaultMeetupCapacity);
  const category = value.category ?? 'community';
  if (!title || !location || !date || !description || !time || !capacity) return null;
  if (typeof category !== 'string' || !categories.has(category)) return null;
  return { title, location, date, description, time, capacity, category, lat: null, lng: null };
}
