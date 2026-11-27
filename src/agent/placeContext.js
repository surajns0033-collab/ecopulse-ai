import { asksForSmogPlan, detectIntent, INTENTS } from './intentEngine.js';
import { communitySetting, isSmogProfile } from './smogProfile.js';
import { correctedCity, explicitPlace, labeledCity, placeName, statedCity, PLACE_COMMAND } from './placeNames.js';

export { labeledCity, placeName } from './placeNames.js';
export { resolvePlaceTurn } from './placeTurn.js';

const WEATHER = /\b(?:weather|temperature|forecast|rain(?:ing)?|mausam|baarish|havaman)\b|मौसम|बारिश|हवामान|तापमान|पाऊस/iu;
const AIR = /\b(?:aqi|a q i|air quality|air pollution|pm\s*2\.5|pm\s*10|smog|hawa|pradushan|(?:is|how['’]s) the air (?:outside|today|here)|is pollution high)\b|ए\s*क्यू\s*आई|वायु गुणवत्ता|हवा (?:की गुणवत्ता|कैसी|कशी)|प्रदूषण/iu;
const WEB_COMMAND = /^(?:(?:please|can you|could you|would you)\s+)*(?:search (?:the )?web|search online|google (?:this|it|for)|look (?:this )?up)\b/i;
const WEB = /\b(?:latest|(?:recent|current|today['’]?s|the) news|what happened today|news (?:today|in|near)|headlines|(?:current|latest) (?:laws?|rules?|policy|policies|deadline|official update))\b/i;
const READING_RELATED_NEWS = /\b(?:news|headlines|laws?|rules?|policy|policies|deadline|regulations?)\b/i;
const CIVIC_OFFICE = /\b(?:municipal|city council|pollution control board|traffic police|environment(?:al)? (?:agency|department)|forest department|nmmc|bmc|mpcb)\b/i;
const HERE = /\b(?:here|near (?:me|us|here)|nearby|locally|local (?:area|weather|aqi|news)|in my|around (?:me|us)|my (?:city|area|location|locality|neighbou?rhood)|(?:at|near) home|where i (?:am|live))\b|मेरे (?:यहाँ|यहां|शहर)|यहाँ|यहां|माझ्या|इथे/iu;
const DEVICE_LOCATION = /^(?:(?:please\s+)?(?:use|share|detect|show|find|check) (?:my|current) (?:current )?(?:location|city)|where am i|what(?:['’]s| is) my (?:current )?(?:location|city)|which city am i in)[.?!]*$/i;
const LOCAL_NEWS = /\b(?:news|headlines|what(?:['’]s| is) (?:going on|happening))\s+(?:in|near|around|for)\b/i;
const MAP = /^(?:(?:can you |please )?(?:show|open|find) (?:me )?(?:(?:the|a) )?)?maps?(?:\s+(?:of|in|for|to))?(?:\s+(.+))?$/i;
const MAP_QUESTION = /^(?:where(?: is|['’]s)|locate|show (?:me )?(?:the )?location (?:of|for))\s+(.+)$/i;
const ON_MAP = /^(?:can you |please )?show (?:me )?(.+?)\s+on (?:the |a )?map$/i;
export const asksForForecast = (text) => /\b(?:forecast|tomorrow|tonight|next week|this (?:evening|weekend)|in the (?:morning|evening))\b|आने वाला|कल|उद्या/iu.test(text);

const PLACE_TOOLS = new Set([
  INTENTS.GET_HEALTH_TIPS, INTENTS.FIND_EVENTS, INTENTS.CREATE_EVENT, INTENTS.GET_ROUTES,
  INTENTS.CREATE_REPORT, INTENTS.CREATE_EMAIL, INTENTS.GET_AUTHORITY_CONTACTS, INTENTS.GET_WATER_QUALITY,
]);

export function resolveCity(city) {
  if (city && city !== 'your city' && city !== 'Unknown') return city;
  return null; // null = location unknown
}

function requestDetails(request) {
  if (communitySetting(request)) return [request];
  const household = request.match(/\b(?:for|with)\s+((?:my|our)\s+(?:child(?:ren)?|kids?|baby|grandparents?))\b/iu);
  return household ? [household[1]] : [];
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

function explicitCommand(text, relative, smogRequest, profile) {
  const command = text.match(PLACE_COMMAND);
  if (command && profile?.pinLocation && profile.smogDetails) return profile;
  if (command && !smogRequest) {
    const city = correctedCity(command[1]) || placeName(command[1]);
    if (city) return { kind: 'city', needsPlace: true, place: city };
  }
  const request = text.replace(/[.?!।]+$/u, '');
  const map = request.match(MAP) || request.match(MAP_QUESTION) || request.match(ON_MAP);
  if (map) {
    const place = placeName(map[1]);
    if (!map[1] || place || relative) return { kind: 'map', needsPlace: true, map: true, relative, place };
  }
  if (WEB_COMMAND.test(text)) return { kind: 'web', needsPlace: relative, relative, place: relative ? labeledCity(text) : '' };
  return null;
}

function localTopics(text, intent, relative) {
  const air = AIR.test(text);
  const weather = WEATHER.test(text);
  const localNews = LOCAL_NEWS.test(text);
  const contact = intent === INTENTS.GET_AUTHORITY_CONTACTS || (intent !== INTENTS.CREATE_EMAIL &&
    CIVIC_OFFICE.test(text) && /\b(?:email|phone|helpline|contacts?|portal)\b/i.test(text));
  const local = air || weather || localNews || contact || relative || PLACE_TOOLS.has(intent);
  return { air, weather, localNews, contact, relative, place: local ? explicitPlace(text, air || weather) : '' };
}

function definitionQuestion(text, { place, relative }) {
  return /^(?:what (?:is|does)|define|explain)\s+(?:the term\s+)?(?:aqi|air quality|air pollution|pm\s*2\.5|pm\s*10|weather|smog)(?:\s+(?:mean|stand for))?[.?!]*$/i.test(text)
    || (!place && !relative && /\b(?:how (?:to|can i|do we) (?:reduce|improve|prevent)|what causes|effects of|why (?:does|is))\b/i.test(text));
}

function wantsNews(text, { localNews, relative, air, weather, contact }) {
  if (localNews) return true;
  if (WEB.test(text) && (READING_RELATED_NEWS.test(text) || (!air && !weather && !contact))) return true;
  return relative && /\b(?:news|what['’]?s (?:going on|happening))\b/i.test(text);
}

function localTool(text, intent, topics, definition) {
  if (!definition && intent === INTENTS.GET_HEALTH_TIPS) return intent;
  if (topics.contact) return INTENTS.GET_AUTHORITY_CONTACTS;
  if (intent === INTENTS.CREATE_EMAIL) return intent;
  if (intent === INTENTS.CREATE_REPORT && /\b(?:burning|dumping|sewage|smoke|cutting|complaint|garbage|report|blocked)\b/i.test(text)) return intent;
  if (!definition && topics.air) return INTENTS.GET_AIR_QUALITY;
  if (!definition && topics.weather) return INTENTS.GET_WEATHER;
  return null;
}

const STANDALONE_TOOLS = new Set([INTENTS.UPLOAD_PHOTO_REPORT, INTENTS.GET_COMMUNITY, INTENTS.GET_USER_IMPACT, INTENTS.GET_WASTE_TIPS]);

function otherTool(text, intent, { place, relative }) {
  if (intent === INTENTS.FIND_EVENTS && !place) return { kind: 'tool', intent };
  if (PLACE_TOOLS.has(intent) && (place || relative || /\b(?:report|complaint|eco.event|eco.meetup|cleanup|low.pollution route)\b/i.test(text))) {
    return { kind: 'tool', needsPlace: true, intent, relative, place };
  }
  if (relative && /\b(?:current|live|local|weather|news|outside|now|today|city)\b/i.test(text)) return { kind: 'web', needsPlace: true, relative, place };
  if (STANDALONE_TOOLS.has(intent) && /\b(?:analy[sz]e (?:a |this )?photo|community feed|my (?:reports|eco impact)|waste (?:segregation|reduction)|recycling tips)\b/i.test(text)) return { kind: 'tool', intent };
  return null;
}

function routeTopic(text, intent, relative) {
  const topics = localTopics(text, intent, relative);
  const definition = definitionQuestion(text, topics);
  if (definition && (topics.air || topics.weather)) return { kind: 'general', intent: INTENTS.ASK_QUESTION };
  const { place, localNews } = topics;
  if (wantsNews(text, topics)) return { kind: 'web', needsPlace: relative || localNews, relative, place };
  const tool = localTool(text, intent, topics, definition);
  if (tool) return { kind: 'tool', needsPlace: true, intent: tool, relative, place };
  return otherTool(text, intent, topics);
}

export function routePlaceRequest(text, history = [], { awaitingSmogProfile = false } = {}) {
  const clean = text.trim();
  if (DEVICE_LOCATION.test(clean)) return { kind: 'device' };
  const relative = HERE.test(clean) || /\b(?:air|weather|temperature) outside\b/i.test(clean);
  const smogRequest = asksForSmogPlan(clean);
  const profile = awaitingSmogProfile && !smogRequest ? routeSmogPlan(clean, true) : null;
  const command = explicitCommand(clean, relative, smogRequest, profile);
  if (command) return command;
  const { intent } = detectIntent(clean, history);
  if (smogRequest || intent === INTENTS.GET_SMOG_PLAN) return routeSmogPlan(clean);
  return routeTopic(clean, intent, relative) || (profile?.smogDetails ? profile : { kind: 'general' });
}
