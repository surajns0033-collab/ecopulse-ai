import { labeledCity, placeName, resolvePlaceTurn, routePlaceRequest } from './placeContext.js';
import { INTENTS } from './intentEngine.js';

export const AWAITING_CHAT_PLACE = 'CHAT_PLACE_AWAITING_INPUT';
export const AWAITING_DRAFT_DETAILS = 'DRAFT_EMAIL_AWAITING_INFO';

export function isDraftDetailFragment(text) {
  return /^(?:(?:at|by|near|beside|outside|opposite|behind|in front of|under|since|on|around|yesterday|today|every|it (?:happened|started|was)|\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\b|city:)/i.test(String(text || '').trim());
}

// An incident can have a landmark and a time, but only a city changes its
// jurisdiction. Keep the raw note for the draft, not for the geocoder.
export function incidentCity(text) {
  const label = labeledCity(text);
  if (label) return label;
  const mentions = text.matchAll(/\bin\s+(?!(?:front\s+of|flames|progress)\b)([^?!.;\n]+?)(?=\s+(?:in|on|at|by|near|around|beside|since|after|before|last)\s+|[?!.;\n]|$)/gi);
  for (const [, candidate] of mentions) {
    const place = placeName(candidate);
    if (place) return place;
  }
  return '';
}

const knownCities = new Set([
  'navi mumbai', 'mumbai', 'bengaluru', 'bangalore', 'new delhi', 'delhi', 'pune', 'hyderabad',
  'chennai', 'kolkata', 'ahmedabad', 'surat', 'jaipur', 'thiruvananthapuram', 'trivandrum',
  'kochi', 'cochin', 'lucknow', 'chandigarh', 'indore', 'bhopal', 'thane', 'nagpur', 'panvel',
  'patna', 'bhubaneswar', 'guwahati', 'visakhapatnam', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik',
]);

export async function resolveChatPlace(message, history, location, pending, { chosenLocation = null, draftDetails = false, fromPhoto = false, ...options } = {}) {
  const waiting = pending?.type === AWAITING_CHAT_PLACE ? pending.waiting : null;
  let route = routePlaceRequest(message, history);
  const continuingDraft = draftDetails && pending?.type === AWAITING_DRAFT_DETAILS && ['general', 'tool'].includes(route.kind);
  if (continuingDraft) {
    route = {
      kind: 'tool', needsPlace: true, intent: INTENTS.CREATE_EMAIL,
      place: incidentCity(message), draftDetails: true, draftIssue: pending.draftIssue,
    };
  }
  if (fromPhoto && route.needsPlace) route = { ...route, place: '', relative: false };
  let possibleCityOnly = false;
  if (route.kind === 'general' && !waiting) {
    if (route.intent) return route;
    const place = placeName(message);
    const known = knownCities.has(place.toLowerCase());
    possibleCityOnly = !known && /^(?:\p{Lu}[\p{L}'’.-]*)(?:\s+\p{Lu}[\p{L}'’.-]*){0,3}(?:,\s*[^,]+){0,2}$/u.test(place);
    if (!known && !possibleCityOnly) return null;
    route = { kind: 'tool', intent: INTENTS.ASK_QUESTION, needsPlace: true, place, snapshot: true };
  }
  if (route.kind === 'tool' && !route.needsPlace) return null;
  const resolved = await resolvePlaceTurn(message, {
    location: continuingDraft ? pending.location : location, chosenLocation, waiting,
  }, route, options);
  // A capitalized word like “Photosynthesis” isn't necessarily a city. If no
  // place matches and the user didn't ask for local data, leave it to Chat.
  if (possibleCityOnly && resolved.kind === 'reply' && !resolved.context.waiting?.candidate && !resolved.ambiguous) return null;
  return resolved;
}
