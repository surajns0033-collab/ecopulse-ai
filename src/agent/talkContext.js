import { detectIntent, INTENTS } from './intentEngine.js';
import { isSmogProfile } from './smogProfile.js';
import { getTalkDeviceLocation, lookupTalkPlace } from '../services/talkPlaces.js';

const WEATHER = /\b(?:weather|temperature|forecast|rain(?:ing)?|mausam|baarish|havaman)\b|मौसम|बारिश|हवामान|तापमान|पाऊस/iu;
const AIR = /\b(?:aqi|a q i|air quality|air pollution|pm\s*2\.5|pm\s*10|smog|hawa|pradushan|(?:is|how['’]s) the air (?:outside|today|here)|is pollution high)\b|ए\s*क्यू\s*आई|वायु गुणवत्ता|हवा (?:की गुणवत्ता|कैसी|कशी)|प्रदूषण/iu;
const WEB_COMMAND = /^(?:(?:please|can you|could you|would you)\s+)*(?:search (?:the )?web|search online|google (?:this|it|for)|look (?:this )?up)\b/i;
const WEB = /\b(?:latest|(?:recent|current|today['’]?s|the) news|what happened today|news (?:today|in|near)|headlines|(?:current|latest) (?:laws?|rules?|policy|policies|deadline|official update))\b/i;
const READING_RELATED_NEWS = /\b(?:news|headlines|laws?|rules?|policy|policies|deadline|regulations?)\b/i;
const CIVIC_OFFICE = /\b(?:municipal|city council|pollution control board|traffic police|environment(?:al)? (?:agency|department)|forest department|nmmc|bmc|mpcb)\b/i;
const HERE = /\b(?:here|near (?:me|us|here)|nearby|locally|local (?:area|weather|aqi|news)|in my|around (?:me|us)|my (?:city|area|location|locality|neighbou?rhood)|(?:at|near) home|where i (?:am|live))\b|मेरे (?:यहाँ|यहां|शहर)|यहाँ|यहां|माझ्या|इथे/iu;
const DEVICE_LOCATION = /^(?:(?:please\s+)?(?:use|share|detect|show|find|check) (?:my|current) (?:current )?(?:location|city)|where am i|what(?:['’]s| is) my (?:current )?(?:location|city)|which city am i in)[.?!]*$/i;
const SMOG = /\b(?:smog plan|(?:personalized|personalised|clean.air|cleaner.air|indoor.air) plan|winter smog|low.emission routine)\b|(?:स्मॉग|धुंध).{0,20}(?:योजना|प्लान)/iu;
const LOCAL_NEWS = /\b(?:news|headlines|what(?:['’]s| is) (?:going on|happening))\s+(?:in|near|around|for)\b/i;
const PLACE_COMMAND = /^(?:i live in|i (?:am|come) from|i['’]m from|(?:set|change) (?:my )?(?:city|location) to|use the city of)\s+(.+)$/i;
const PLACE_FOLLOWUP = /^(?:i (?:am|live)|i['’]m) in\s+(.+)$/i;
const MAP = /^(?:(?:can you |please )?(?:show|open|find) (?:me )?(?:(?:the|a) )?)?maps?(?:\s+(?:of|in|for|to))?(?:\s+(.+))?$/i;
const MAP_QUESTION = /^(?:where(?: is|['’]s)|locate|show (?:me )?(?:the )?location (?:of|for))\s+(.+)$/i;
const ON_MAP = /^(?:can you |please )?show (?:me )?(.+?)\s+on (?:the |a )?map$/i;
const PREPOSITION = /\b(?:in|at|for|near|around)\s+([^?!.;]+?)(?=\s+\b(?:in|at|for|near|around)\s+|[?!.;]|$)/gi;
export const asksForForecast = (text) => /\b(?:forecast|tomorrow|tonight|next week|this (?:evening|weekend)|in the (?:morning|evening))\b|आने वाला|कल|उद्या/iu.test(text);

const PLACE_TOOLS = new Set([
  INTENTS.GET_HEALTH_TIPS, INTENTS.FIND_EVENTS, INTENTS.CREATE_EVENT, INTENTS.GET_ROUTES,
  INTENTS.CREATE_REPORT, INTENTS.CREATE_EMAIL, INTENTS.GET_AUTHORITY_CONTACTS, INTENTS.GET_WATER_QUALITY,
]);

export function talkPlaceName(value) {
  const name = String(value || '').trim()
    .replace(/^[,.:–—\s]+|[.?!।,\s]+$/gu, '')
    .replace(/(?:,?\s+and\s+(?:can|could|should|what|why|tell|give|precautions?)\b|\s+since\s+|,\s+(?:can|what|how|should)\b).*$/i, '')
    .replace(/\s+(?:right now|now|today|tomorrow|tonight|this (?:morning|evening|week)|please)$/i, '')
    .replace(/\s+(?:ka|ki|ke|mein|में|का|की|के|मध्ये|चा|ची|चे)$/iu, '').trim();
  if (!name || name.length > 100 || name.split(/\s+/).length > 9 || (name.match(/\p{L}/gu) || []).length < 2) return '';
  if (/^(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m|p\.?m)|noon|midnight|yesterday|sunrise|sunset)\b/i.test(name)) return '';
  if (/[^\p{L}\p{M}\d\s,'’\-.]/u.test(name) || /^(?:i|it|its|is|are|can|could|do|does|please|how|why|who|what|where|when|tell|show|check|my|our|your|here|there|somewhere|near|nearby|around|the|a|local|outside|inside|home|office|me|us|this|that|today|tomorrow|tonight|now|right|good|yes|no|not|thanks|thank|sure|hello|hi|hey|okay|ok|actually|help|sounds|and|also|for|in|at|of|about|use|explain|describe|pain|trouble|danger|मेरा|मेरे|माझ्या|यहाँ|यहां|इथे)(?:['’]|\s|$)/iu.test(name)) return '';
  if (/^(?:area|city|location|locally|locality|region|town|neighbou?rhood|city cent(?:re|er)|current(?: (?:area|location))?|forecast|cancel|never mind)$/i.test(name)) return '';
  if (/\b(?:the area|local area|on the map|area around|morning|afternoon|evening|weekend|week|aqi|weather|air quality|plan|somewhere|anything|something|feeling|live data)\b/i.test(name)) return '';
  if (/^(?:आज|उद्या|आत्ता|सध्या|घर|बाहेर|अभी|कल|बाहर|हमारे|यहाँ|यहां)(?:\s|$)/u.test(name)) return '';
  return name;
}

export function explicitPlace(text, environment = false) {
  const label = labeledCity(text);
  if (label) return label;
  const candidates = [...text.matchAll(PREPOSITION)].map((m) => talkPlaceName(m[1])).filter(Boolean);
  if (candidates.length) return candidates.join(', ');
  if (!environment) return '';
  const localPattern = /(?:^|\s)(?:in\s+)?(.+?)\s*(?:\b(?:ka|ki|ke|mein|madhye|madhe)\b|में|का|की|के|मध्ये|चा|ची|चे)\s*(?:aqi|weather|mausam|hawa|havaman|smog|मौसम|हवामान|तापमान|हवा|प्रदूषण|स्मॉग|धुंध)/iu;
  const local = text.match(localPattern)?.[1];
  const afterTopic = text.match(/^(?:(?:check|latest|current|live)\s+)*(?:aqi|a q i|air quality|weather|temperature|forecast|mausam)\s+(.+)$/i)?.[1];
  const beforeTopic = text.match(/^(?:(?:latest|current|live)\s+)?(.+?)\s+(?:aqi|a q i|air quality|weather|mausam)(?:\s+(?:today|now|please))?[.?!]*$/i)?.[1];
  const beforeLocalTopic = text.match(/^(?:(?:आज|आत्ता|सध्या)\s+)?(.+?)\s+(?:हवामान|मौसम|तापमान|हवा\s+(?:कशी|कैसी)|प्रदूषण)(?=\s|[.?!।]|$)/u)?.[1];
  return talkPlaceName(local || afterTopic || beforeTopic || beforeLocalTopic);
}

export function labeledCity(text) {
  return talkPlaceName(text.match(/\bcity:\s*([^.!?;\n]+)/i)?.[1]);
}

export function routeTalkRequest(text, history = []) {
  const clean = text.trim();
  const relative = HERE.test(clean) || /\b(?:air|weather|temperature) outside\b/i.test(clean);
  if (DEVICE_LOCATION.test(clean)) return { kind: 'device' };
  const command = clean.match(PLACE_COMMAND);
  const settingCity = talkPlaceName(command?.[1]);
  if (settingCity) return { kind: 'city', needsPlace: true, place: settingCity };

  const mapRequest = clean.replace(/[.?!।]+$/u, '');
  const map = mapRequest.match(MAP) || mapRequest.match(MAP_QUESTION) || mapRequest.match(ON_MAP);
  if (map && (!map[1] || talkPlaceName(map[1]) || relative)) {
    return { kind: 'map', needsPlace: true, map: true, relative, place: talkPlaceName(map[1]) };
  }

  // A web query can be about air quality, a country or a region without
  // requesting a local reading. Only bind a city for explicit local searches.
  if (WEB_COMMAND.test(clean)) {
    return { kind: 'web', needsPlace: relative, relative, place: relative ? labeledCity(clean) : '' };
  }

  const detected = detectIntent(clean, history);
  const isSmog = SMOG.test(clean) || detected.intent === INTENTS.GET_SMOG_PLAN;
  const air = AIR.test(clean);
  const weather = WEATHER.test(clean);
  const localNews = LOCAL_NEWS.test(clean);
  const contact = detected.intent === INTENTS.GET_AUTHORITY_CONTACTS || (detected.intent !== INTENTS.CREATE_EMAIL &&
    CIVIC_OFFICE.test(clean) && /\b(?:email|phone|helpline|contacts?|portal)\b/i.test(clean));
  const place = air || weather || isSmog || contact || PLACE_TOOLS.has(detected.intent) || relative || localNews
    ? explicitPlace(clean, air || weather || isSmog) : '';
  const definition = /^(?:what (?:is|does)|define|explain)\s+(?:the term\s+)?(?:aqi|air quality|air pollution|pm\s*2\.5|pm\s*10|weather|smog)(?:\s+(?:mean|stand for))?[.?!]*$/i.test(clean) ||
    (!place && !relative && /\b(?:how (?:to|can i|do we) (?:reduce|improve|prevent)|what causes|effects of|why (?:does|is))\b/i.test(clean));

  if (definition && (air || weather || isSmog)) return { kind: 'general', intent: INTENTS.ASK_QUESTION };

  if (isSmog && !definition) return { kind: 'tool', needsPlace: true, intent: INTENTS.GET_SMOG_PLAN, relative, place };
  if (localNews || (WEB.test(clean) && (READING_RELATED_NEWS.test(clean) || (!air && !weather && !contact))) || (relative && /\b(?:news|what['’]?s (?:going on|happening))\b/i.test(clean))) {
    return { kind: 'web', needsPlace: relative || localNews, relative, place };
  }
  if (!definition && detected.intent === INTENTS.GET_HEALTH_TIPS) {
    return { kind: 'tool', needsPlace: true, intent: detected.intent, relative, place };
  }
  const incident = detected.intent === INTENTS.CREATE_REPORT &&
    /\b(?:burning|dumping|sewage|smoke|cutting|complaint|garbage|report|blocked)\b/i.test(clean);
  if (contact || detected.intent === INTENTS.CREATE_EMAIL || incident) {
    const intent = contact ? INTENTS.GET_AUTHORITY_CONTACTS : detected.intent;
    return { kind: 'tool', needsPlace: true, intent, relative, place };
  }
  if (!definition && (air || weather)) {
    return { kind: 'tool', needsPlace: true, intent: air ? INTENTS.GET_AIR_QUALITY : INTENTS.GET_WEATHER, relative, place };
  }
  if (PLACE_TOOLS.has(detected.intent) && (place || relative ||
    /\b(?:report|complaint|eco.event|eco.meetup|cleanup|low.pollution route)\b/i.test(clean))) {
    return { kind: 'tool', needsPlace: true, intent: detected.intent, relative, place };
  }
  if (relative && /\b(?:current|live|local|weather|news|outside|now|today|city)\b/i.test(clean)) {
    return { kind: 'web', needsPlace: true, relative, place };
  }
  if ([INTENTS.UPLOAD_PHOTO_REPORT, INTENTS.GET_COMMUNITY, INTENTS.GET_USER_IMPACT, INTENTS.GET_WASTE_TIPS].includes(detected.intent) &&
    /\b(?:analy[sz]e (?:a |this )?photo|community feed|my (?:reports|eco impact)|waste (?:segregation|reduction)|recycling tips)\b/i.test(clean)) {
    return { kind: 'tool', intent: detected.intent };
  }
  return { kind: 'general' };
}

const replies = {
  en: {
    city: 'Which city should I check?', region: 'Which city and state or country should I use?',
    confirm: (city) => `Did you mean ${city}?`, set: (city) => `Okay, I’ll use ${city} when you ask for local information.`,
    unclear: 'I didn’t catch that clearly. Could you say it again?',
    noDevice: 'I couldn’t verify your device location. Which city should I check?',
    notFound: (place) => `I couldn’t verify ${place}. Could you say the city and its state or country?`,
  },
  hi: {
    city: 'किस शहर की जानकारी चाहिए?', region: 'कौन सा शहर और राज्य या देश बताना चाहेंगे?',
    confirm: (city) => `क्या आपका मतलब ${city} है?`, set: (city) => `ठीक है, स्थानीय जानकारी के लिए मैं ${city} इस्तेमाल करूँगी।`,
    unclear: 'मुझे साफ़ सुनाई नहीं दिया। क्या आप फिर से बोल सकते हैं?',
    noDevice: 'मैं आपके डिवाइस की जगह की पुष्टि नहीं कर सकी। किस शहर की जानकारी चाहिए?',
    notFound: (place) => `मैं ${place} की पुष्टि नहीं कर पाई। शहर और उसका राज्य या देश बताएँगे?`,
  },
  mr: {
    city: 'कोणत्या शहराची माहिती पाहू?', region: 'शहर आणि त्याचं राज्य किंवा देश सांगाल का?',
    confirm: (city) => `तुम्हाला ${city} म्हणायचं आहे का?`, set: (city) => `ठीक आहे, स्थानिक माहितीसाठी मी ${city} वापरेन.`,
    unclear: 'मला नीट ऐकू आलं नाही. पुन्हा सांगाल का?',
    noDevice: 'मला तुमच्या डिव्हाइसचे ठिकाण खात्रीने मिळाले नाही. कोणते शहर पाहू?',
    notFound: (place) => `मला ${place} खात्रीने सापडलं नाही. शहर आणि त्याचं राज्य किंवा देश सांगाल का?`,
  },
};

export function emptyTalkContext() {
  return { location: null, chosenLocation: null, waiting: null };
}

export async function resolveTalkTurn(text, context, {
  confidence, fromMic = confidence !== undefined, language = 'en', history, pending, signal,
  lookup = lookupTalkPlace, locateDevice = getTalkDeviceLocation, route,
} = {}) {
  const copy = replies[language] || replies.en;
  const say = (reply, update = context) => ({ kind: 'reply', text: reply, context: update });
  if (!/[\p{L}\p{N}]/u.test(text) || (confidence > 0 && confidence < .55)) return say(copy.unclear);

  let turn = { ...(route || routeTalkRequest(text, history)), message: text };
  const explicitlyChooseCity = turn.kind === 'city';
  const waiting = context.waiting;
  const profileReply = pending?.intent === INTENTS.GET_SMOG_PLAN && isSmogProfile(text);
  const useDevice = turn.kind === 'device';
  if (useDevice) {
    turn = waiting?.turn || { ...turn, kind: 'city', needsPlace: true };
    const location = await locateDevice({ signal });
    if (!location) return say(copy.noDevice, { ...context, waiting: { turn, candidate: null, pinLocation: true } });
    const next = { location, chosenLocation: location, waiting: null };
    return turn.kind === 'city' ? { ...say(copy.set(location.city), next), selected: location } : { ...turn, location, context: next };
  }
  let confirmed = null;
  let answeringLocation = false;
  if (waiting) {
    if (/^(?:cancel|never mind|forget it)[.!?]*$/i.test(text.trim())) {
      return { kind: 'general', message: text, context: { ...context, waiting: null } };
    }
    const yes = /^(?:yes|yeah|yep|correct|that['’]s right|haan|han|हाँ|हां|हो|बरोबर)[.!?।]*$/iu.test(text.trim());
    const no = /^(?:no|nope|not that one|nahi|नहीं|नाही)[.!?।]*$/iu.test(text.trim());
    if (yes && waiting.candidate) {
      turn = waiting.turn;
      answeringLocation = true;
      confirmed = waiting.candidate;
    } else if (no || (yes && !waiting.candidate)) {
      return say(copy.region, { ...context, waiting: { ...waiting, candidate: null } });
    } else if (turn.kind === 'city' || (turn.kind === 'general' && !profileReply)) {
      const followUp = text.trim().match(PLACE_FOLLOWUP);
      const place = turn.place || talkPlaceName(followUp?.[1] || text.replace(/^city:\s*/i, ''));
      if (place) {
        turn = { ...waiting.turn, place };
        answeringLocation = true;
      }
    }
  }

  if (!answeringLocation && pending && turn.kind === 'general' &&
      (pending.intent !== INTENTS.GET_SMOG_PLAN || profileReply)) {
    return { ...turn, kind: 'tool', intent: pending.intent, pending: pending.action, location: pending.location, context: { ...context, waiting: null } };
  }
  if (!turn.needsPlace) return { ...turn, context: { ...context, waiting: null } };

  const pinLocation = explicitlyChooseCity || turn.kind === 'city' || Boolean(answeringLocation && waiting.pinLocation);
  const defer = (reply, candidate = null) => say(reply, {
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
    if (fromMic && (!confidence || confidence < .78) && location.city !== context.location?.city) {
      return defer(copy.confirm(location.city), location);
    }
  }
  if (!location && turn.kind !== 'city' && !turn.relative) location = context.location || context.chosenLocation;
  // A city asked about in a previous turn is not proof of the user's location.
  if (!location && turn.relative && turn.kind !== 'city') location = context.chosenLocation;
  if (!location) return defer(copy.city);

  const next = { location: turn.map && !pinLocation ? context.location : location, chosenLocation: pinLocation ? location : context.chosenLocation, waiting: null };
  if (turn.kind === 'city') return { ...say(copy.set(location.city), next), selected: location };
  return { ...turn, location, context: next };
}
