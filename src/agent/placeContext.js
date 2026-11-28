import { asksForSmogPlan, detectIntent, INTENTS } from './intentEngine.js';
import { communitySetting, isSmogProfile } from './smogProfile.js';
import { correctedCity, explicitPlace, labeledCity, placeName, statedCity, PLACE_COMMAND } from './placeNames.js';
import { recognitionText } from './chatLanguage.js';
import { WEB_COMMAND, routeTopic } from './placeTopics.js';

export { labeledCity, placeName } from './placeNames.js';
export { resolvePlaceTurn } from './placeTurn.js';

const HERE = /\b(?:here|near (?:me|us|here)|nearby|locally|local (?:area|weather|aqi|news)|in my|around (?:me|us)|my (?:city|area|location|locality|neighbou?rhood)|(?:at|near) home|where i (?:am|live))\b|मेरे (?:यहाँ|यहां|शहर)|यहाँ|यहां|माझ्या|इथे/iu;
const DEVICE_LOCATION = /^(?:(?:please\s+)?(?:use|share|detect|show|find|check) (?:my|current) (?:current )?(?:location|city)|where am i|what(?:['’]s| is) my (?:current )?(?:location|city)|which city am i in)[.?!]*$/i;

const MAP = /^(?:(?:can you |please )?(?:show|open|find) (?:me )?(?:(?:the|a) )?)?maps?(?:\s+(?:of|in|for|to))?(?:\s+(.+))?$/i;
const MAP_QUESTION = /^(?:where(?: is|['’]s)|locate|show (?:me )?(?:the )?location (?:of|for))\s+(.+)$/i;
const ON_MAP = /^(?:can you |please )?show (?:me )?(.+?)\s+on (?:the |a )?map$/i;
export const asksForForecast = (text) => /\b(?:forecast|tomorrow|tonight|next week|this (?:evening|weekend)|in the (?:morning|evening))\b|\bkal\b|आने वाला|कल|उद्या/iu.test(recognitionText(text));

export function resolveCity(city) {
  if (city && city !== 'your city' && city !== 'Unknown') return city;
  return null; // null = location unknown
}

function requestDetails(request) {
  if (communitySetting(request)) return [request];
  const personal = request.match(/\b(?:for|with)\s+((?:my|our)\s+(?:child(?:ren)?|kids?|baby|grandparents?)\b.*)/iu);
  if (personal) return [personal[1]];
  return /^(?:I|we|main|hum)\s/i.test(request) && isSmogProfile(request) ? [request] : [];
}

function declaredLocation(clause) {
  const command = clause.match(PLACE_COMMAND);
  const city = labeledCity(clause) || placeName(statedCity(clause) || command?.[1]);
  return city ? { city, pin: Boolean(command) } : null;
}

function routeSmogPlan(text, profileReply = false) {
  // Commas in city names stay together. A personal statement after a comma
  // begins a new clause, as does the user's next sentence.
  const separator = /[;!?।\n]+|(?<!\b(?:st|ste|mt|ft))\.(?=\s|$)|,\s*(?=(?:i|we|my|our|commute|routine|cooking|air cleaning|household)\b)/iu;
  const clauses = text.split(separator).map(clause => clause.trim()).filter(Boolean);
  const request = profileReply ? '' : (clauses.find(asksForSmogPlan) || text);
  const requestedCity = explicitPlace(request, true);
  const details = requestDetails(request);
  let declared;
  for (const clause of clauses) {
    if (clause === request) continue;
    const location = declaredLocation(clause);
    if (location) declared ??= location;
    else if (isSmogProfile(clause)) details.push(clause);
  }
  return {
    kind: 'tool', needsPlace: true, intent: INTENTS.GET_SMOG_PLAN, relative: HERE.test(request),
    place: requestedCity || declared?.city || '', smogDetails: details.join('; '), pinLocation: !requestedCity && Boolean(declared?.pin),
  };
}

function mapCommand(text, relative) {
  const request = text.replace(/[.?!।]+$/u, '');
  const map = request.match(MAP) || request.match(MAP_QUESTION) || request.match(ON_MAP);
  if (map) {
    const place = placeName(map[1]);
    if (!map[1] || place || relative) return { kind: 'map', needsPlace: true, map: true, relative, place };
  }
  return null;
}

function explicitCommand(text, relative, smogRequest, profile) {
  const command = text.match(PLACE_COMMAND);
  if (command && profile?.pinLocation && profile.smogDetails) return profile;
  if (command && !smogRequest) {
    const city = correctedCity(command[1]) || placeName(command[1]);
    if (city) return { kind: 'city', needsPlace: true, place: city };
  }
  const map = mapCommand(text, relative);
  if (map) return map;
  if (WEB_COMMAND.test(text)) return { kind: 'web', needsPlace: relative, relative, place: relative ? labeledCity(text) : '' };
  return null;
}


export function routePlaceRequest(text, history = [], { awaitingSmogProfile = false, classification } = {}) {
  const clean = text.trim();
  if (DEVICE_LOCATION.test(clean)) return { kind: 'device' };
  const relative = HERE.test(clean) || /\b(?:air|weather|temperature) outside\b/i.test(clean);
  const smogRequest = asksForSmogPlan(clean);
  const profile = awaitingSmogProfile && !smogRequest ? routeSmogPlan(clean, true) : null;
  const command = explicitCommand(clean, relative, smogRequest, profile);
  if (command) return command;
  const { intent } = classification ?? detectIntent(clean, history);
  if (smogRequest || intent === INTENTS.GET_SMOG_PLAN) return routeSmogPlan(clean);
  return routeTopic(clean, intent, relative) || (profile?.smogDetails ? profile : { kind: 'general' });
}
