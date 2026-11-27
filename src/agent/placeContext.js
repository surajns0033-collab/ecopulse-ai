import { asksForSmogPlan, detectIntent, INTENTS } from './intentEngine.js';
import { isSmogProfile } from './smogProfile.js';
import { getDevicePlace, lookupPlace } from '../services/placeLookup.js';

const WEATHER = /\b(?:weather|temperature|forecast|rain(?:ing)?|mausam|baarish|havaman)\b|मौसम|बारिश|हवामान|तापमान|पाऊस/iu;
const AIR = /\b(?:aqi|a q i|air quality|air pollution|pm\s*2\.5|pm\s*10|smog|hawa|pradushan|(?:is|how['’]s) the air (?:outside|today|here)|is pollution high)\b|ए\s*क्यू\s*आई|वायु गुणवत्ता|हवा (?:की गुणवत्ता|कैसी|कशी)|प्रदूषण/iu;
const WEB_COMMAND = /^(?:(?:please|can you|could you|would you)\s+)*(?:search (?:the )?web|search online|google (?:this|it|for)|look (?:this )?up)\b/i;
const WEB = /\b(?:latest|(?:recent|current|today['’]?s|the) news|what happened today|news (?:today|in|near)|headlines|(?:current|latest) (?:laws?|rules?|policy|policies|deadline|official update))\b/i;
const READING_RELATED_NEWS = /\b(?:news|headlines|laws?|rules?|policy|policies|deadline|regulations?)\b/i;
const CIVIC_OFFICE = /\b(?:municipal|city council|pollution control board|traffic police|environment(?:al)? (?:agency|department)|forest department|nmmc|bmc|mpcb)\b/i;
const HERE = /\b(?:here|near (?:me|us|here)|nearby|locally|local (?:area|weather|aqi|news)|in my|around (?:me|us)|my (?:city|area|location|locality|neighbou?rhood)|(?:at|near) home|where i (?:am|live))\b|मेरे (?:यहाँ|यहां|शहर)|यहाँ|यहां|माझ्या|इथे/iu;
const DEVICE_LOCATION = /^(?:(?:please\s+)?(?:use|share|detect|show|find|check) (?:my|current) (?:current )?(?:location|city)|where am i|what(?:['’]s| is) my (?:current )?(?:location|city)|which city am i in)[.?!]*$/i;
const LOCAL_NEWS = /\b(?:news|headlines|what(?:['’]s| is) (?:going on|happening))\s+(?:in|near|around|for)\b/i;
const PLACE_COMMAND = /^(?:i live in|i (?:am|come) from|i['’]m from|(?:set|change) (?:my )?(?:city|location) to|use the city of)\s+(.+)$/i;
const PLACE_FOLLOWUP = /^(?:i (?:am|live)|i['’]m) in\s+(.+)$/i;
const STATED_CITY = /^(?:(?:i am|i['’]m) (?:currently |now )?in|my (?:current )?city is)\s+(.+)$/i;
const CITY_ANSWER = /^(?:city\s*:\s*|(?:(?:the|my) )?city is\s+|it(?:['’]s| is)\s+|(?:please )?(?:check|use)(?: in)?\s+|(?:yes|no)[, ]+|(?:शहर(?: का नाम)?(?: है)?|शहराचं नाव)\s+)/iu;
const EN_CITY_CORRECTION = /^(?:(?:no|actually|sorry)[,\s]+)?(?:(?:i (?:meant|said)|(?:the|my) city is)\s+)?(.+?)(?:[,;–—]\s*|\s+)not\s+(.+?)[.?!]*$/iu;
const LOCAL_CITY_CORRECTION = /^(.+?)(?:\s*[,;–—]\s*|\s+)(?:नहीं|नाही|nahi|naahi)[,\s]+(.+?)[.?!।]*$/iu;
const CANCEL_LOOKUP = /^(?:cancel|never mind|forget it)[.!?]*$/i;
const MAP = /^(?:(?:can you |please )?(?:show|open|find) (?:me )?(?:(?:the|a) )?)?maps?(?:\s+(?:of|in|for|to))?(?:\s+(.+))?$/i;
const MAP_QUESTION = /^(?:where(?: is|['’]s)|locate|show (?:me )?(?:the )?location (?:of|for))\s+(.+)$/i;
const ON_MAP = /^(?:can you |please )?show (?:me )?(.+?)\s+on (?:the |a )?map$/i;
const PREPOSITION = /\b(?:in|at|for|near|around)\s+([^?!.;]+?)(?=\s+\b(?:in|at|for|near|around)\s+|[?!.;]|$)/gi;
export const asksForForecast = (text) => /\b(?:forecast|tomorrow|tonight|next week|this (?:evening|weekend)|in the (?:morning|evening))\b|आने वाला|कल|उद्या/iu.test(text);

const PLACE_TOOLS = new Set([
  INTENTS.GET_HEALTH_TIPS, INTENTS.FIND_EVENTS, INTENTS.CREATE_EVENT, INTENTS.GET_ROUTES,
  INTENTS.CREATE_REPORT, INTENTS.CREATE_EMAIL, INTENTS.GET_AUTHORITY_CONTACTS, INTENTS.GET_WATER_QUALITY,
]);

export function placeName(value) {
  const name = String(value || '').trim()
    .replace(/^[,.:–—\s]+|[.?!।,\s]+$/gu, '')
    .replace(/(?:,?\s+and\s+(?:can|could|should|what|why|tell|give|precautions?)\b|\s+since\s+|,\s+(?:can|what|how|should)\b).*$/i, '')
    .replace(/\s+(?:right now|now|today|tomorrow|tonight|this (?:morning|evening|week)|please)$/i, '')
    .replace(/\s+(?:आज|अभी|आत्ता|सध्या|उद्या|कल)$/u, '')
    .replace(/\s+(?:ka|ki|ke|mein|में|का|की|के|मध्ये|चा|ची|चे)$/iu, '').trim();
  if (!name || name.length > 100 || name.split(/\s+/).length > 9 || (name.match(/\p{L}/gu) || []).length < 2) return '';
  if (/^(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m|p\.?m)|noon|midnight|yesterday|sunrise|sunset)\b/i.test(name)) return '';
  if (/[^\p{L}\p{M}\d\s,'’\-.]/u.test(name) || /^(?:i|it|its|is|are|can|could|do|does|please|how|why|who|what|where|when|tell|show|check|my|our|your|here|there|somewhere|near|nearby|around|the|a|local|outside|inside|home|office|me|us|this|that|today|tomorrow|tonight|now|right|good|yes|no|not|thanks|thank|sure|hello|hi|hey|okay|ok|actually|help|sounds|and|also|for|in|at|of|about|use|explain|describe|pain|trouble|danger|मेरा|मेरे|माझ्या|यहाँ|यहां|इथे)(?:['’]|\s|$)/iu.test(name)) return '';
  if (/^(?:area|city|location|locally|locality|region|town|neighbou?rhood|city cent(?:re|er)|current(?: (?:area|location))?|forecast|cancel|never mind)$/i.test(name)) return '';
  if (/\b(?:the area|local area|on the map|area around|morning|afternoon|evening|weekend|week|aqi|weather|air quality|plan|somewhere|anything|something|feeling|live data)\b/i.test(name)) return '';
  if (/^(?:आज|उद्या|आत्ता|सध्या|घर|बाहेर|अभी|कल|बाहर|हमारे|यहाँ|यहां)(?:\s|$)/u.test(name)) return '';
  return name;
}

function explicitPlace(text, environment = false) {
  const label = labeledCity(text);
  if (label) return label;
  const candidates = [...text.matchAll(PREPOSITION)].map((m) => placeName(m[1])).filter(Boolean);
  if (candidates.length) return candidates.join(', ');
  if (!environment) return '';
  const localPattern = /(?:^|\s)(?:in\s+)?(.+?)\s*(?:\b(?:ka|ki|ke|mein|madhye|madhe)\b|में|का|की|के|मध्ये|चा|ची|चे)\s*(?:aqi|weather|mausam|hawa|havaman|smog|मौसम|हवामान|तापमान|हवा|प्रदूषण|स्मॉग|धुंध)/iu;
  const local = text.match(localPattern)?.[1];
  const afterTopic = text.match(/^(?:(?:check|latest|current|live)\s+)*(?:aqi|a q i|air quality|weather|temperature|forecast|mausam)\s+(.+)$/i)?.[1];
  const beforeTopic = text.match(/^(?:(?:latest|current|live)\s+)?(.+?)\s+(?:aqi|a q i|air quality|weather|mausam)(?:\s+(?:today|now|please))?[.?!]*$/i)?.[1];
  const beforeLocalTopic = text.match(/^(?:(?:आज|आत्ता|सध्या)\s+)?(.+?)\s+(?:हवामान|मौसम|तापमान|हवा\s+(?:कशी|कैसी)|प्रदूषण)(?=\s|[.?!।]|$)/u)?.[1];
  return placeName(local || afterTopic || beforeTopic || beforeLocalTopic);
}

export function labeledCity(text) {
  return placeName(text.match(/\bcity:\s*([^.!?;\n]+)/i)?.[1]);
}

function statedCity(text) {
  const clean = text.trim();
  return clean.match(STATED_CITY)?.[1] ||
    clean.match(/^मैं(?: अभी)?\s+(.+?)\s+में\s+(?:हूँ|हूं)[.!?।]*$/u)?.[1] ||
    clean.match(/^मेरा शहर(?: का नाम)?\s+(.+?)\s+है[.!?।]*$/u)?.[1] ||
    clean.match(/^मी\s+(.+?)(?:\s*(?:मध्ये|मधे)|\s+इथे|\s+येथे)?\s+आहे[.!?।]*$/u)?.[1] ||
    // Hindi and Marathi city statements can also be written in Latin script.
    clean.match(/^main?(?: abhi)?\s+(.+?)\s+(?:mein|men|me)\s+(?:hoon|hun|hu)[.!?]*$/i)?.[1] ||
    clean.match(/^mera shah[ae]r(?: ka naam)?\s+(.+?)\s+hai[.!?]*$/i)?.[1] ||
    clean.match(/^mi\s+(.+?)\s+(?:madhye|madhe|ithe|yethe)\s+(?:aahe|ahe)[.!?]*$/i)?.[1] || '';
}

function routeSmogPlan(text, { profileReply = false } = {}) {
  // Keep comma-separated city qualifiers intact while splitting off profile statements.
  const separator = /[;!?\n]+|(?<!\b(?:st|ste|mt|ft))\.(?=\s|$)|,\s*(?=(?:i|we|my|our|commute|routine|cooking|air cleaning|household)\b)/iu;
  const clauses = text.split(separator).map((clause) => clause.trim()).filter(Boolean);
  const request = profileReply ? '' : clauses.find(asksForSmogPlan) || text;
  const requestedCity = explicitPlace(request, true);
  let declaredCity = '';
  let pinLocation = false;
  const details = [];
  for (const clause of clauses) {
    if (clause === request) continue;
    const command = clause.match(PLACE_COMMAND);
    const city = labeledCity(clause) || placeName(statedCity(clause) || command?.[1]);
    if (city && !declaredCity) {
      declaredCity = city;
      pinLocation = Boolean(command);
    } else if (!city && isSmogProfile(clause)) {
      details.push(clause);
    }
  }
  return {
    kind: 'tool', needsPlace: true, intent: INTENTS.GET_SMOG_PLAN, relative: HERE.test(request),
    place: requestedCity || declaredCity, smogDetails: details.join('; '), pinLocation: !requestedCity && pinLocation,
  };
}

function cityAnswer(text) {
  const trimmed = text.trim().replace(/^(?:(?:um|uh|erm)[,\s]+)+/i, '');
  const stripped = trimmed.replace(/^i (?:already |just )?(?:said|meant)[,:\s]+/i, '');
  const clean = stripped === trimmed ? trimmed : stripped.replace(/\s+(?:earlier|before)[.?!\s]*$/i, '');
  const explicit = statedCity(clean) || clean.match(PLACE_FOLLOWUP)?.[1];
  const unwrapped = explicit || clean.replace(CITY_ANSWER, '');
  if (unwrapped === clean && (/[?？]$/u.test(clean) || /\b(?:ideas?|recip(?:e|es)|recommendations?|jokes?|stories|music|poems?)\b/i.test(clean) ||
      (!clean.includes(',') && clean.split(/\s+/u).length > 4))) return '';
  // Accept a place-shaped phrase, not an ordinary sentence.
  const place = placeName(unwrapped).replace(/[,\s]+$/u, '');
  if (!place || /\b(?:i|you|me|my|am|are|is|can|could|would|should|said|hear|listen|tell|which|because|already|again|joke|simpler|words|testing)\b/i.test(place) ||
      /^(?:let['’]s|switch|change|start|continue|resume|play|name|list|translate|write|make|find|give|show|compare|describe|recommend|suggest)\s/iu.test(place) ||
      !/^[\p{L}\p{M}.'’\-,\s]+$/u.test(place)) return '';
  return place;
}

function correctedCity(text) {
  const localContrast = text.match(LOCAL_CITY_CORRECTION);
  const contrast = localContrast || text.match(EN_CITY_CORRECTION);
  if (contrast) {
    const first = cityAnswer(contrast[1]);
    const second = cityAnswer(contrast[2]);
    if (first && second) return localContrast ? second : first;
    return '';
  }
  const explicit = text.match(/^(?:(?:no|actually|sorry)[,:\s]+)?(i (?:meant|said)\s+.+)$/iu);
  return explicit ? cityAnswer(explicit[1]) : '';
}

export function routePlaceRequest(text, history = [], { awaitingSmogProfile = false } = {}) {
  const clean = text.trim();
  const relative = HERE.test(clean) || /\b(?:air|weather|temperature) outside\b/i.test(clean);
  if (DEVICE_LOCATION.test(clean)) return { kind: 'device' };
  const smogRequest = asksForSmogPlan(clean);
  const profile = awaitingSmogProfile && !smogRequest ? routeSmogPlan(clean, { profileReply: true }) : null;
  const command = clean.match(PLACE_COMMAND);
  if (command && profile?.pinLocation && profile.smogDetails) return profile;
  const settingCity = command && (correctedCity(command[1]) || placeName(command[1]));
  if (settingCity && !smogRequest) return { kind: 'city', needsPlace: true, place: settingCity };

  const mapRequest = clean.replace(/[.?!।]+$/u, '');
  const map = mapRequest.match(MAP) || mapRequest.match(MAP_QUESTION) || mapRequest.match(ON_MAP);
  if (map && (!map[1] || placeName(map[1]) || relative)) {
    return { kind: 'map', needsPlace: true, map: true, relative, place: placeName(map[1]) };
  }

  // A web query can be about air quality, a country or a region without
  // requesting a local reading. Only bind a city for explicit local searches.
  if (WEB_COMMAND.test(clean)) {
    return { kind: 'web', needsPlace: relative, relative, place: relative ? labeledCity(clean) : '' };
  }

  const { intent } = detectIntent(clean, history);
  const smog = smogRequest || intent === INTENTS.GET_SMOG_PLAN ? routeSmogPlan(clean) : null;
  const air = AIR.test(clean);
  const weather = WEATHER.test(clean);
  const localNews = LOCAL_NEWS.test(clean);
  const contact = intent === INTENTS.GET_AUTHORITY_CONTACTS || (intent !== INTENTS.CREATE_EMAIL &&
    CIVIC_OFFICE.test(clean) && /\b(?:email|phone|helpline|contacts?|portal)\b/i.test(clean));
  const place = smog?.place ?? (air || weather || contact || PLACE_TOOLS.has(intent) || relative || localNews
    ? explicitPlace(clean, air || weather) : '');
  const definition = /^(?:what (?:is|does)|define|explain)\s+(?:the term\s+)?(?:aqi|air quality|air pollution|pm\s*2\.5|pm\s*10|weather|smog)(?:\s+(?:mean|stand for))?[.?!]*$/i.test(clean) ||
    (!place && !relative && /\b(?:how (?:to|can i|do we) (?:reduce|improve|prevent)|what causes|effects of|why (?:does|is))\b/i.test(clean));

  if (definition && (air || weather || smog)) return { kind: 'general', intent: INTENTS.ASK_QUESTION };

  if (smog) return smog;
  if (localNews || (WEB.test(clean) && (READING_RELATED_NEWS.test(clean) || (!air && !weather && !contact))) || (relative && /\b(?:news|what['’]?s (?:going on|happening))\b/i.test(clean))) {
    return { kind: 'web', needsPlace: relative || localNews, relative, place };
  }
  if (!definition && intent === INTENTS.GET_HEALTH_TIPS) {
    return { kind: 'tool', needsPlace: true, intent, relative, place };
  }
  const incident = intent === INTENTS.CREATE_REPORT &&
    /\b(?:burning|dumping|sewage|smoke|cutting|complaint|garbage|report|blocked)\b/i.test(clean);
  if (contact || intent === INTENTS.CREATE_EMAIL || incident) {
    return { kind: 'tool', needsPlace: true, intent: contact ? INTENTS.GET_AUTHORITY_CONTACTS : intent, relative, place };
  }
  if (!definition && (air || weather)) {
    return { kind: 'tool', needsPlace: true, intent: air ? INTENTS.GET_AIR_QUALITY : INTENTS.GET_WEATHER, relative, place };
  }
  // Published meetups can be listed before the user shares a location.
  if (intent === INTENTS.FIND_EVENTS && !place) return { kind: 'tool', intent };
  if (PLACE_TOOLS.has(intent) && (place || relative ||
    /\b(?:report|complaint|eco.event|eco.meetup|cleanup|low.pollution route)\b/i.test(clean))) {
    return { kind: 'tool', needsPlace: true, intent, relative, place };
  }
  if (relative && /\b(?:current|live|local|weather|news|outside|now|today|city)\b/i.test(clean)) {
    return { kind: 'web', needsPlace: true, relative, place };
  }
  if ([INTENTS.UPLOAD_PHOTO_REPORT, INTENTS.GET_COMMUNITY, INTENTS.GET_USER_IMPACT, INTENTS.GET_WASTE_TIPS].includes(intent) &&
      /\b(?:analy[sz]e (?:a |this )?photo|community feed|my (?:reports|eco impact)|waste (?:segregation|reduction)|recycling tips)\b/i.test(clean)) {
    return { kind: 'tool', intent };
  }
  if (profile?.smogDetails) return profile;
  return { kind: 'general' };
}

const copy = {
  city: 'Which city should I check?', region: 'Which city and state or country should I use?',
  confirm: (city) => `Did you mean ${city}?`, set: (city) => `Okay, I’ll use ${city} when you ask for local information.`,
  unclear: 'I didn’t catch that clearly. Could you say it again?',
  noDevice: 'I couldn’t verify your device location. Which city should I check?',
  notFound: (place) => `I couldn’t verify ${place}. Could you say the city and its state or country?`,
};

export async function resolvePlaceTurn(text, context, route, {
  signal, lookup = lookupPlace, locateDevice = getDevicePlace,
} = {}) {
  const say = (reply, update = context) => ({ kind: 'reply', text: reply, context: update });
  const ask = (reply, update) => ({ ...say(reply, update), expectsReply: true });
  if (!/[\p{L}\p{N}]/u.test(text)) return ask(copy.unclear);

  const input = text.trim();
  const { waiting } = context;
  if (waiting && CANCEL_LOOKUP.test(input)) {
    return { kind: 'general', message: input, context: { ...context, waiting: null } };
  }
  let turn = { ...route, message: input };
  const explicitlyChooseCity = turn.kind === 'city' || turn.pinLocation;
  if (turn.kind === 'device') {
    turn = waiting?.turn || { ...turn, kind: 'city', needsPlace: true };
    const location = await locateDevice({ signal });
    if (!location) return ask(copy.noDevice, { ...context, waiting: { turn, candidate: null, pinLocation: true } });
    const next = { location, chosenLocation: location, waiting: null };
    return turn.kind === 'city' ? { ...say(copy.set(location.city), next), selected: location } : { ...turn, location, context: next };
  }
  let confirmed = null;
  let answeringLocation = false;
  if (waiting) {
    const confirmation = input.replace(/[.!?।]+$/u, '').replace(/[,\s]+/gu, ' ').trim();
    const yes = /^(?:(?:yes|yeah|yep)(?: (?:please|correct|use it|that(?:['’]s| is) (?:right|correct|the one)))?|correct|that(?:['’]s| is) (?:right|correct)|haan|han|(?:हाँ|हां)(?: (?:सही है|यही शहर है))?|(?:हो|होय)(?: बरोबर)?|बरोबर(?: आहे)?)$/iu.test(confirmation);
    const no = /^(?:(?:no|nope)(?: not that one)?|not that one|nahi|नहीं|नाही)$/iu.test(confirmation);
    if (yes && waiting.candidate) {
      turn = waiting.turn;
      answeringLocation = true;
      confirmed = waiting.candidate;
    } else if (no || (yes && !waiting.candidate)) {
      const next = { ...context, waiting: { ...waiting, candidate: null } };
      return ask(copy.region, next);
    } else if (turn.kind === 'city' || turn.kind === 'general') {
      const followUp = input.match(PLACE_FOLLOWUP);
      const place = correctedCity(input) || turn.place || placeName(followUp?.[1] || input.replace(/^city:\s*/i, ''));
      if (place) {
        turn = { ...waiting.turn, place };
        answeringLocation = true;
      }
    }
  }

  if (!turn.needsPlace) return { ...turn, context: { ...context, waiting: null } };

  const pinLocation = explicitlyChooseCity || turn.kind === 'city' || Boolean(answeringLocation && waiting.pinLocation);
  const defer = (reply, candidate = null) => ask(reply, {
    ...context, waiting: { turn, candidate, pinLocation: pinLocation || (turn.relative && !turn.place) },
  });
  let location = confirmed;
  if (!location && turn.place) {
    const hit = await lookup(turn.place, { signal, map: Boolean(turn.map) });
    if (!hit.location) {
      if (hit.candidate) return defer(copy.confirm(hit.candidate.city), hit.candidate);
      return { ...defer(hit.ambiguous ? copy.region : copy.notFound(turn.place)), ambiguous: Boolean(hit.ambiguous) };
    }
    location = hit.location;
  }
  if (!location && turn.kind !== 'city' && !turn.relative) location = context.location || context.chosenLocation;
  // A city asked about in a previous turn is not proof of the user's location.
  if (!location && turn.relative && turn.kind !== 'city') location = context.chosenLocation;
  if (!location) return defer(copy.city);

  const next = {
    location: turn.map && !pinLocation ? context.location : location,
    chosenLocation: pinLocation ? location : context.chosenLocation,
    waiting: null,
  };
  if (turn.kind === 'city') return { ...say(copy.set(location.city), next), selected: location };
  return { ...turn, location, context: next };
}
