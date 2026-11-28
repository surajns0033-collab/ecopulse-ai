import { recognitionText, schoolActivity } from './chatLanguage.js';
import { INTENTS } from './intentEngine.js';
import { explicitPlace } from './placeNames.js';

const WEATHER = /\b(?:weather|temperature|forecast|rain(?:ing)?|mausam|baarish|havaman)\b|मौसम|बारिश|हवामान|तापमान|पाऊस/iu;
const AIR = /\b(?:aqi|a q i|air quality|air pollution|pm\s*2\.5|pm\s*10|smog|hawa|pradushan|(?:is|how['’]s) the air (?:outside|today|here)|is pollution high)\b|ए\s*क्यू\s*आई|वायु गुणवत्ता|हवा (?:की गुणवत्ता|कैसी|कशी)|प्रदूषण/iu;
export const WEB_COMMAND = /^(?:(?:please|can you|could you|would you)\s+)*(?:search (?:the )?web|search online|google (?:this|it|for)|look (?:this )?up)\b/i;
const WEB = /\b(?:latest|(?:recent|current|today['’]?s|the) news|what happened today|news (?:today|in|near)|headlines|(?:current|latest) (?:laws?|rules?|policy|policies|deadline|official update))\b/i;
const READING_RELATED_NEWS = /\b(?:news|headlines|laws?|rules?|policy|policies|deadline|regulations?)\b/i;
const CIVIC_OFFICE = /\b(?:municipal|city council|pollution control board|traffic police|environment(?:al)? (?:agency|department)|forest department|nmmc|bmc|mpcb)\b/i;

const LOCAL_NEWS = /\b(?:news|headlines|what(?:['’]s| is) (?:going on|happening))\s+(?:in|near|around|for)\b/i;

const PLACE_TOOLS = new Set([
  INTENTS.GET_HEALTH_TIPS, INTENTS.FIND_EVENTS, INTENTS.CREATE_EVENT, INTENTS.GET_ROUTES,
  INTENTS.CREATE_REPORT, INTENTS.CREATE_EMAIL, INTENTS.GET_AUTHORITY_CONTACTS, INTENTS.GET_WATER_QUALITY,
]);

function localTopics(text, recognized, intent, relative) {
  const air = AIR.test(recognized) || schoolActivity(recognized);
  const weather = WEATHER.test(recognized);
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

export function routeTopic(text, intent, relative) {
  const recognized = recognitionText(text);
  const topics = localTopics(text, recognized, intent, relative);
  const definition = definitionQuestion(recognized, topics);
  if (definition && (topics.air || topics.weather)) return { kind: 'general', intent: INTENTS.ASK_QUESTION };
  const { place, localNews } = topics;
  if (wantsNews(recognized, topics)) return { kind: 'web', needsPlace: relative || localNews, relative, place };
  const tool = localTool(recognized, intent, topics, definition);
  if (tool) return { kind: 'tool', needsPlace: true, intent: tool, relative, place };
  return otherTool(recognized, intent, topics);
}
