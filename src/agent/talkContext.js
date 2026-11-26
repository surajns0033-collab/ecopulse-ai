import { detectIntent, INTENTS } from './intentEngine.js';
import { isSmogProfile } from './smogProfile.js';
import { isTalkEcho } from '../services/talkMic.js';
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
const STATED_CITY = /^(?:(?:i am|i['’]m) (?:currently |now )?in|my (?:current )?city is)\s+(.+)$/i;
const CITY_ANSWER = /^(?:city\s*:\s*|(?:(?:the|my) )?city is\s+|it(?:['’]s| is)\s+|(?:please )?(?:check|use)(?: in)?\s+|(?:yes|no)[, ]+|(?:शहर(?: का नाम)?(?: है)?|शहराचं नाव)\s+)/iu;
const REPEATED_CITY = /^(?:i (?:already |just )?(?:said|told you) (?:it|(?:my|the) (?:city|location))(?: (?:already|earlier|before))?|i (?:said|told you) (?:earlier|before))[.!?]*$/i;
const CITY_PROMPT_ECHO = /^(?:which|what) city(?: and state or country)? should i (?:check|use)[.!?]*$/i;
const NEW_TOPIC = /^(?:(?:new|different) (?:topic|subject)\b|(?:let['’]s )?(?:switch|change) (?:the )?(?:topics?|subjects?)\b|नया विषय|दूसरी बात|नवीन विषय|विषय बदलूया)(?:[.!?।,:;–—\s]+|$)/iu;
const RESUME_TOPIC = /^(?:(?:can|could|shall) (?:we|you) |let['’]s |please )?(?:go back to|back to|resume|continue(?: with)?|pick up|finish)\s+(.+)$/i;
const RESUME_LAST = /^(?:(?:can|could|shall) (?:we|you) |let['’]s |please )?(?:(?:go )?back|continue|(?:continue(?: from)?|pick up) where we left off)[.!?]*$/i;
const CANCEL_LOOKUP = /^(?:cancel|never mind|forget it)[.!?]*$/i;
const EMAIL_TOPIC = /\b(?:e-?mail|mail|letter|draft|complain|complaint|authorit(?:y|ies)|officers?)\b|ईमेल|मेल|शिकायत|तक्रार/iu;
const MIC_CHECK = /^(?:(?:hi|hello|hey)[,\s]+)?(?:(?:can|could|do) you hear me|are you (?:listening(?: to me)?|able to hear me))(?: (?:here|now|right now|here now|clearly))?[.!?\s]*$|^(?:क्या\s+)?(?:आप|तुम)\s+(?:मुझे|मेरी आवा(?:ज़|ज\u093c?))\s+सुन.{0,24}[?।.]*$|^(?:तुम्हाला\s+)?माझा आवाज\s+ऐकू\s+येतो का[?।.]*$/iu;
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

function statedCity(text) {
  const clean = text.trim();
  return clean.match(STATED_CITY)?.[1] ||
    clean.match(/^मैं(?: अभी)?\s+(.+?)\s+में\s+(?:हूँ|हूं)[.!?।]*$/u)?.[1] ||
    clean.match(/^मेरा शहर(?: का नाम)?\s+(.+?)\s+है[.!?।]*$/u)?.[1] ||
    clean.match(/^मी\s+(.+?)(?:\s*(?:मध्ये|मधे)|\s+इथे|\s+येथे)?\s+आहे[.!?।]*$/u)?.[1] ||
    // Whisper can transcribe the language correctly but write it in Latin.
    clean.match(/^main?(?: abhi)?\s+(.+?)\s+(?:mein|men|me)\s+(?:hoon|hun|hu)[.!?]*$/i)?.[1] ||
    clean.match(/^mera shah[ae]r(?: ka naam)?\s+(.+?)\s+hai[.!?]*$/i)?.[1] ||
    clean.match(/^mi\s+(.+?)\s+(?:madhye|madhe|ithe|yethe)\s+(?:aahe|ahe)[.!?]*$/i)?.[1] || '';
}

function talkCityAnswer(text) {
  const spoken = text.trim().replace(/^(?:(?:um|uh|erm)[,\s]+)+/i, '');
  const stripped = spoken.replace(/^i (?:already |just )?(?:said|meant)[,:\s]+/i, '');
  const clean = stripped === spoken ? spoken : stripped.replace(/\s+(?:earlier|before)[.?!\s]*$/i, '');
  const explicit = statedCity(clean) || clean.match(PLACE_FOLLOWUP)?.[1];
  const unwrapped = explicit || clean.replace(CITY_ANSWER, '');
  if (unwrapped === clean && (/[?？]$/u.test(clean) || /\b(?:ideas?|recip(?:e|es)|recommendations?|jokes?|stories|music|poems?)\b/i.test(clean) ||
      (!clean.includes(',') && clean.split(/\s+/u).length > 4))) return '';
  // A city may be lowercase in a transcript. Accept a place-shaped phrase,
  // not an ordinary sentence or the assistant's own question.
  const place = talkPlaceName(unwrapped).replace(/[,\s]+$/u, '');
  if (!place || /\b(?:i|you|me|my|am|are|is|can|could|would|should|said|hear|listen|tell|which|because|already|again|joke|simpler|words|testing)\b/i.test(place) ||
      /^(?:let['’]s|switch|change|start|continue|resume|play|name|list|translate|write|make|find|give|show|compare|describe|recommend|suggest)\s/iu.test(place) ||
      !/^[\p{L}\p{M}.'’\-,\s]+$/u.test(place)) return '';
  return place;
}

function resumeSubject(text) {
  if (RESUME_LAST.test(text) || /(?:पिछल[ेा]\s+(?:सवाल|प्रश्न).{0,30}वापस|मागच्या\s+प्रश्न.{0,30}परत)/u.test(text)) return 'where we left off';
  return text.match(RESUME_TOPIC)?.[1].trim() || (/(?:वापस|फिर से|परत)/u.test(text) ? text : '');
}

function resumesLookup(subject, turn) {
  if (!subject) return false;
  if (/^(?:(?:the|my|our) )?(?:(?:earlier|previous|original|last|first|city) (?:question|request|lookup)|where we left off)\b/i.test(subject)) return true;
  if (turn.kind === 'map') return /\bmaps?\b/i.test(subject);
  if (turn.kind === 'web') return /\b(?:search|news|headlines)\b/i.test(subject);
  if (turn.intent === INTENTS.GET_WEATHER) return WEATHER.test(subject);
  if (turn.intent === INTENTS.GET_AIR_QUALITY) return AIR.test(subject);
  return turn.intent === INTENTS.GET_SMOG_PLAN && SMOG.test(subject);
}

function currentTalkRoute(text, history) {
  const reported = statedCity(text);
  // A standalone city statement sets a preference; a request mentioning a
  // city still goes through the normal grounded lookup.
  if (reported && !/[?？]\s*$/u.test(text) && !/\b(?:can|could|should|what|why|tell|give|check|show)\b/i.test(reported)) {
    const city = talkCityAnswer(reported);
    if (city) return { kind: 'city', needsPlace: true, place: city };
  }
  return routeTalkRequest(text, history, { strictEmail: true });
}

export function routeTalkRequest(text, history = [], { strictEmail = false } = {}) {
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

  const { intent: detected } = detectIntent(clean, history);
  // “Send me the weather” and “send me a joke” are not civic email drafts.
  const intent = strictEmail && detected === INTENTS.CREATE_EMAIL && !EMAIL_TOPIC.test(clean) ? INTENTS.ASK_QUESTION : detected;
  const isSmog = SMOG.test(clean) || intent === INTENTS.GET_SMOG_PLAN;
  const air = AIR.test(clean);
  const weather = WEATHER.test(clean);
  const localNews = LOCAL_NEWS.test(clean);
  const contact = intent === INTENTS.GET_AUTHORITY_CONTACTS || (intent !== INTENTS.CREATE_EMAIL &&
    CIVIC_OFFICE.test(clean) && /\b(?:email|phone|helpline|contacts?|portal)\b/i.test(clean));
  const place = air || weather || isSmog || contact || PLACE_TOOLS.has(intent) || relative || localNews
    ? explicitPlace(clean, air || weather || isSmog) : '';
  const definition = /^(?:what (?:is|does)|define|explain)\s+(?:the term\s+)?(?:aqi|air quality|air pollution|pm\s*2\.5|pm\s*10|weather|smog)(?:\s+(?:mean|stand for))?[.?!]*$/i.test(clean) ||
    (!place && !relative && /\b(?:how (?:to|can i|do we) (?:reduce|improve|prevent)|what causes|effects of|why (?:does|is))\b/i.test(clean));

  if (definition && (air || weather || isSmog)) return { kind: 'general', intent: INTENTS.ASK_QUESTION };

  if (isSmog && !definition) return { kind: 'tool', needsPlace: true, intent: INTENTS.GET_SMOG_PLAN, relative, place };
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
  return { kind: 'general' };
}

const replies = {
  en: {
    city: 'Which city should I check?', region: 'Which city and state or country should I use?',
    confirm: (city) => `Did you mean ${city}?`, set: (city) => `Okay, I’ll use ${city} when you ask for local information.`,
    useDiscussed: (city) => `Should I use ${city} for this lookup?`,
    retryCity: 'Say or type just the city name to continue this lookup.',
    retryRegion: 'I couldn’t verify the city. Try typing its name with the state or country.',
    retryConfirm: 'Say “yes” to confirm the city I suggested, or type the city and its state or country.',
    retryDevice: 'I wasn’t sure you asked to use device location. Type “Use my location” or tell me the city instead.',
    switched: 'Sure, let’s talk about something else.',
    receivedVoice: 'I heard your question. Go ahead.',
    receivedText: 'I received your typed message. Tap the wave to try voice input.',
    unclear: 'I didn’t catch that clearly. Could you say it again?',
    noDevice: 'I couldn’t verify your device location. Which city should I check?',
    notFound: (place) => `I couldn’t verify ${place}. Could you say the city and its state or country?`,
  },
  hi: {
    city: 'किस शहर की जानकारी चाहिए?', region: 'कौन सा शहर और राज्य या देश बताना चाहेंगे?',
    confirm: (city) => `क्या आपका मतलब ${city} है?`, set: (city) => `ठीक है, स्थानीय जानकारी के लिए मैं ${city} इस्तेमाल करूँगी।`,
    useDiscussed: (city) => `क्या इस जानकारी के लिए ${city} इस्तेमाल करूँ?`,
    retryCity: 'आगे बढ़ने के लिए बस शहर का नाम बोलें या लिखें।',
    retryRegion: 'मैं शहर की पुष्टि नहीं कर सकी। शहर के साथ राज्य या देश भी लिखें।',
    retryConfirm: 'अगर सुझाया गया शहर सही है, तो “हाँ” कहें। वरना शहर के साथ राज्य या देश लिखें।',
    retryDevice: 'पता नहीं चला कि आपने डिवाइस की लोकेशन माँगी थी या नहीं। “Use my location” या शहर का नाम लिखें।',
    switched: 'ज़रूर, किसी और विषय पर बात करते हैं।',
    receivedVoice: 'आपका सवाल सुन लिया। आगे बोलिए।',
    receivedText: 'आपका लिखा हुआ संदेश मिल गया है। आवाज़ से पूछने के लिए वेव पर टैप करें।',
    unclear: 'मुझे साफ़ सुनाई नहीं दिया। क्या आप फिर से बोल सकते हैं?',
    noDevice: 'मैं आपके डिवाइस की जगह की पुष्टि नहीं कर सकी। किस शहर की जानकारी चाहिए?',
    notFound: (place) => `मैं ${place} की पुष्टि नहीं कर पाई। शहर और उसका राज्य या देश बताएँगे?`,
  },
  mr: {
    city: 'कोणत्या शहराची माहिती पाहू?', region: 'शहर आणि त्याचं राज्य किंवा देश सांगाल का?',
    confirm: (city) => `तुम्हाला ${city} म्हणायचं आहे का?`, set: (city) => `ठीक आहे, स्थानिक माहितीसाठी मी ${city} वापरेन.`,
    useDiscussed: (city) => `या माहितीसाठी ${city} वापरू का?`,
    retryCity: 'पुढे जाण्यासाठी फक्त शहराचं नाव सांगा किंवा लिहा.',
    retryRegion: 'शहराची खात्री झाली नाही. शहरासोबत राज्य किंवा देशाचं नाव लिहा.',
    retryConfirm: 'सुचवलेलं शहर बरोबर असेल तर “हो” म्हणा. नाहीतर शहरासोबत राज्य किंवा देश लिहा.',
    retryDevice: 'तुम्ही डिव्हाइसचं ठिकाण वापरायला सांगितलं का, याची खात्री नाही. “Use my location” किंवा शहराचं नाव लिहा.',
    switched: 'नक्की, आपण दुसऱ्या विषयावर बोलूया.',
    receivedVoice: 'मला तुमचा प्रश्न ऐकू आला. पुढे बोला.',
    receivedText: 'तुम्ही लिहिलेला संदेश मिळाला आहे. आवाज वापरण्यासाठी वेव्हवर टॅप करा.',
    unclear: 'मला नीट ऐकू आलं नाही. पुन्हा सांगाल का?',
    noDevice: 'मला तुमच्या डिव्हाइसचे ठिकाण खात्रीने मिळाले नाही. कोणते शहर पाहू?',
    notFound: (place) => `मला ${place} खात्रीने सापडलं नाही. शहर आणि त्याचं राज्य किंवा देश सांगाल का?`,
  },
};

export function emptyTalkContext() {
  return { location: null, chosenLocation: null, waiting: null };
}

export function awaitingTalkPlace(context) {
  return Boolean(context?.waiting && !context.waiting.paused);
}

export function unclearTalkInput(confidence) {
  return confidence > 0 && confidence < .55;
}

export async function resolveTalkTurn(text, context, {
  confidence, uncertain, fromMic = confidence !== undefined, language = 'en', history, pending, signal,
  lookup = lookupTalkPlace, locateDevice = getTalkDeviceLocation, route,
} = {}) {
  // Chat supplies its own route and keeps its own place clarification UI.
  const inTalk = !route;
  const copy = replies[language] || replies.en;
  const say = (reply, update = context) => ({ kind: 'reply', text: reply, context: update });
  const ask = (reply, update) => ({ ...say(reply, update), expectsReply: true });
  const hint = (reply, update = context) => ({ ...say(reply, update), silent: true });
  if (!/[\p{L}\p{N}]/u.test(text) || unclearTalkInput(confidence)) return inTalk ? hint(copy.unclear) : ask(copy.unclear);
  if (inTalk && MIC_CHECK.test(text.trim())) return say(fromMic ? copy.receivedVoice : copy.receivedText);

  let input = text.trim();
  const switching = inTalk ? input.match(NEW_TOPIC) : null;
  if (switching) input = input.slice(switching[0].length).trim();
  const deferredLookup = context.waiting;
  const parked = inTalk && deferredLookup ? { ...deferredLookup, paused: true } : null;
  if (switching && !input) return say(copy.switched, { ...context, waiting: parked });
  if (deferredLookup && !switching && CANCEL_LOOKUP.test(input)) {
    return { kind: 'general', message: input, context: { ...context, waiting: null } };
  }
  const subject = inTalk && !switching ? resumeSubject(input) : '';
  const resuming = Boolean(deferredLookup && resumesLookup(subject, deferredLookup.turn));
  const waiting = switching || (deferredLookup?.paused && !resuming) ? null : deferredLookup;
  const placeInResume = resuming ? explicitPlace(subject) : '';
  if (resuming && waiting.candidate && !placeInResume) {
    const prompt = waiting.pinLocation && context.location?.city === waiting.candidate.city && !waiting.turn.place
      ? copy.useDiscussed(waiting.candidate.city) : copy.confirm(waiting.candidate.city);
    return ask(prompt, { ...context, waiting: { ...waiting, paused: false, prompt } });
  }
  if (inTalk && !resuming && subject && SMOG.test(subject) && pending?.intent === INTENTS.GET_SMOG_PLAN && pending.location) {
    return { kind: 'tool', intent: pending.intent, message: input, location: pending.location, context: { ...context, waiting: parked } };
  }
  let turn = resuming ? { ...waiting.turn, place: placeInResume } : { ...(route || currentTalkRoute(input, switching ? [] : history)), message: input };
  const explicitlyChooseCity = turn.kind === 'city';
  const profileReply = !switching && pending?.intent === INTENTS.GET_SMOG_PLAN && isSmogProfile(input);
  const useDevice = turn.kind === 'device';
  if (useDevice) {
    if (inTalk && fromMic && (uncertain || (confidence > 0 && confidence < .78))) return hint(copy.retryDevice);
    turn = waiting?.turn || { ...turn, kind: 'city', needsPlace: true };
    const location = await locateDevice({ signal });
    if (!location) return ask(copy.noDevice, { ...context, waiting: { turn, candidate: null, pinLocation: true } });
    const next = { location, chosenLocation: location, waiting: waiting ? null : parked };
    return turn.kind === 'city' ? { ...say(copy.set(location.city), next), selected: location } : { ...turn, location, context: next };
  }
  let confirmed = null;
  let answeringLocation = false;
  if (waiting && !resuming) {
    const echo = inTalk && fromMic && (CITY_PROMPT_ECHO.test(input) ||
      [waiting.prompt, copy.city, copy.region].some((prompt) => isTalkEcho(input, prompt)));
    if (inTalk && (echo || REPEATED_CITY.test(input))) {
      return hint(waiting.candidate ? copy.retryConfirm : copy.retryCity);
    }
    const confirmation = input.replace(/[.!?।]+$/u, '').replace(/[,\s]+/gu, ' ').trim();
    const yes = /^(?:(?:yes|yeah|yep)(?: (?:please|correct|use it|that(?:['’]s| is) (?:right|correct|the one)))?|correct|that(?:['’]s| is) (?:right|correct)|haan|han|(?:हाँ|हां)(?: (?:सही है|यही शहर है))?|(?:हो|होय)(?: बरोबर)?|बरोबर(?: आहे)?)$/iu.test(confirmation);
    const no = /^(?:(?:no|nope)(?: not that one)?|not that one|nahi|नहीं|नाही)$/iu.test(confirmation);
    if (yes && waiting.candidate) {
      if (inTalk && fromMic && (uncertain || (confidence > 0 && confidence < .78))) return hint(copy.retryConfirm);
      turn = waiting.turn;
      answeringLocation = true;
      confirmed = waiting.candidate;
    } else if (no || (yes && !waiting.candidate)) {
      const next = { ...context, waiting: { ...waiting, candidate: null } };
      return inTalk ? hint(copy.retryCity, next) : ask(copy.region, next);
    } else if (turn.kind === 'city' || (turn.kind === 'general' && !profileReply)) {
      const followUp = input.match(PLACE_FOLLOWUP);
      const place = turn.place || (inTalk ? talkCityAnswer(input) : talkPlaceName(followUp?.[1] || input.replace(/^city:\s*/i, '')));
      if (place) {
        turn = { ...waiting.turn, place };
        answeringLocation = true;
      }
    }
  }

  if (!switching && !answeringLocation && pending && turn.kind === 'general' &&
      (pending.intent !== INTENTS.GET_SMOG_PLAN || profileReply)) {
    return { ...turn, kind: 'tool', intent: pending.intent, pending: pending.action, location: pending.location, context: { ...context, waiting: parked } };
  }
  if (!turn.needsPlace) return { ...turn, context: { ...context, waiting: parked } };

  const pinLocation = explicitlyChooseCity || turn.kind === 'city' || Boolean((answeringLocation || resuming) && waiting.pinLocation);
  const sameLookup = waiting?.turn?.kind === turn.kind && waiting.turn.intent === turn.intent;
  const deferred = (prompt, candidate = null) => ({
    ...context, waiting: { turn, candidate, pinLocation: pinLocation || (turn.relative && !turn.place), ...(inTalk && { prompt }) },
  });
  const defer = (reply, candidate) => ask(reply, deferred(reply, candidate));
  const confirm = (candidate) => {
    const prompt = copy.confirm(candidate.city);
    return inTalk && sameLookup && waiting.candidate?.city === candidate.city
      ? hint(copy.retryConfirm, deferred(prompt, candidate)) : defer(prompt, candidate);
  };
  let location = confirmed;
  if (!location && turn.place) {
    const hit = await lookup(turn.place, { signal, map: Boolean(turn.map), speech: inTalk && fromMic });
    if (!hit.location) {
      if (hit.candidate) return confirm(hit.candidate);
      if (inTalk && (answeringLocation || resuming || !hit.ambiguous || (sameLookup && waiting.prompt === copy.region))) {
        return hint(copy.retryRegion, deferred(copy.region));
      }
      return { ...defer(hit.ambiguous ? copy.region : copy.notFound(turn.place)), ambiguous: Boolean(hit.ambiguous) };
    }
    location = hit.location;
    const previouslyVerified = inTalk && pinLocation ? context.chosenLocation : context.location;
    if (fromMic && (uncertain ?? (!confidence || confidence < .78)) && location.city !== previouslyVerified?.city) {
      return confirm(location);
    }
  }
  if (!location && turn.kind !== 'city' && !turn.relative) location = context.location || context.chosenLocation;
  // A city asked about in a previous turn is not proof of the user's location.
  if (!location && turn.relative && turn.kind !== 'city') location = context.chosenLocation;
  if (!location) {
    if (inTalk && sameLookup && !resuming) {
      if (waiting.turn.message === turn.message) return hint(waiting.candidate ? copy.retryConfirm : copy.retryCity);
      return hint(copy.retryCity, deferred(copy.city));
    }
    if (inTalk && turn.relative && context.location) return defer(copy.useDiscussed(context.location.city), context.location);
    return defer(copy.city);
  }

  const next = {
    location: turn.map && !pinLocation ? context.location : location,
    chosenLocation: pinLocation ? location : context.chosenLocation,
    waiting: answeringLocation || resuming || sameLookup ? null : parked,
  };
  if (turn.kind === 'city') return { ...say(copy.set(location.city), next), selected: location };
  return { ...turn, location, context: next };
}
