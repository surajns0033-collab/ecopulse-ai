import { recognitionText } from './chatLanguage.js';

export const PLACE_COMMAND = /^(?:i live in|i (?:am|come) from|i['’]m from|(?:set|change) (?:my )?(?:city|location) to|use the city of)\s+(.+)$/i;
export const PLACE_FOLLOWUP = /^(?:i (?:am|live)|i['’]m) in\s+(.+)$/i;
const STATED_CITY = /^(?:(?:i am|i['’]m) (?:currently |now )?in|my (?:current )?city is)\s+(.+)$/i;
const CITY_ANSWER = /^(?:city\s*:\s*|(?:(?:the|my) )?city is\s+|it(?:['’]s| is)\s+|(?:please )?(?:check|use)(?: in)?\s+|(?:yes|no)[, ]+|(?:शहर(?: का नाम)?(?: है)?|शहराचं नाव)\s+)/iu;
const EN_CITY_CORRECTION = /^(?:(?:no|actually|sorry)[,\s]+)?(?:(?:i (?:meant|said)|(?:the|my) city is)\s+)?(.+?)(?:[,;–—]\s*|\s+)not\s+(.+?)[.?!]*$/iu;
const LOCAL_CITY_CORRECTION = /^(.+?)(?:\s*[,;–—]\s*|\s+)(?:नहीं|नाही|nahi|naahi)[,\s]+(.+?)[.?!।]*$/iu;
const PREPOSITION = /\b(?:in|at|for|near|around)\s+([^?!.;]+?)(?=\s+\b(?:in|at|for|near|around)\s+|[?!.;]|$)/gi;

function beforeTimeQualifier(value) {
  for (const match of value.matchAll(/\s+(\p{L}+)/gu)) {
    if (/^(?:today|tomorrow|tonight)$/i.test(recognitionText(match[1]))) return value.slice(0, match.index);
  }
  return value;
}

export function placeName(value) {
  const name = beforeTimeQualifier(String(value || '').trim())
    .replace(/^[,.:–—\s]+|[.?!।,\s]+$/gu, '')
    .replace(/(?:,?\s+and\s+(?:can|could|should|what|why|tell|give|precautions?)\b|\s+since\s+|,\s+(?:can|what|how|should)\b).*$/i, '')
    .replace(/\s+(?:this morning|this evening|next week)\b.*$/i, '')
    .replace(/\s+(?:move|hold|keep)\s+(?:sports|assembly|classes)\b.*$/i, '')
    .replace(/\s+(?:right now|now|please)$/i, '')
    .replace(/\s+(?:आज|अभी|आत्ता|सध्या|उद्या|कल)$/u, '')
    .replace(/\s+(?:ka|ki|ke|mein|में|का|की|के|मध्ये|चा|ची|चे)$/iu, '').trim();
  if (!name || name.length > 100 || name.split(/\s+/).length > 9 || (name.match(/\p{L}/gu) || []).length < 2) return '';
  if (/^(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m|p\.?m)|noon|midnight|yesterday|sunrise|sunset)\b/i.test(name)) return '';
  if (/[^\p{L}\p{M}\d\s,'’\-.]/u.test(name) || /^(?:i|it|its|is|are|can|could|do|does|please|how|why|who|what|where|when|tell|show|check|my|our|your|here|there|somewhere|near|nearby|around|the|a|local|outside|inside|home|office|me|us|this|that|today|tomorrow|tonight|now|right|good|yes|no|not|thanks|thank|sure|hello|hi|hey|okay|ok|actually|help|sounds|and|also|for|in|at|of|about|use|explain|describe|pain|trouble|danger|मेरा|मेरे|माझ्या|यहाँ|यहां|इथे)(?:['’]|\s|$)/iu.test(name)) return '';
  if (/^(?:area|city|location|locally|locality|region|town|neighbou?rhood|city cent(?:re|er)|current(?: (?:area|location))?|forecast|cancel|never mind)$/i.test(name)) return '';
  if (/\b(?:the area|local area|on the map|area around|morning|afternoon|evening|weekend|week|aqi|weather|air quality|air pollution|smog|plan|somewhere|anything|something|feeling|live data)\b/i.test(name)) return '';
  if (/^(?:आज|उद्या|आत्ता|सध्या|घर|बाहेर|अभी|कल|बाहर|हमारे|यहाँ|यहां)(?:\s|$)/u.test(name)) return '';
  return name;
}

export function explicitPlace(text, environment = false) {
  const label = labeledCity(text);
  if (label) return label;
  const candidates = [...text.matchAll(PREPOSITION)].map((m) => placeName(m[1])).filter(Boolean);
  if (candidates.length) return candidates.join(', ');
  if (!environment) return '';
  const schoolPlace = text.match(/^([\p{L}\p{M} .'-]{2,55}?)\s+(?:mein|me|में)\s+(?:kal|aaj|कल|आज|subah|सुबह|school|स्कूल)/iu);
  if (schoolPlace) return placeName(schoolPlace[1]);
  const localPattern = /(?:^|\s)(?:in\s+)?(.+?)\s*(?:\b(?:ka|ki|ke|mein|me|madhye|madhe)\b|में|का|की|के|मध्ये|चा|ची|चे)\s*(?:aqi|weather|mausam|hawa|havaman|smog|मौसम|हवामान|तापमान|हवा|प्रदूषण|स्मॉग|धुंध)/iu;
  const local = text.match(localPattern)?.[1];
  const afterTopic = text.match(/^(?:(?:check|latest|current|live)\s+)*(?:aqi|a q i|air quality|weather|temperature|forecast|mausam)\s+(.+)$/i)?.[1];
  const beforeTopic = text.match(/^(?:(?:latest|current|live)\s+)?(.+?)\s+(?:aqi|a q i|air quality|weather|mausam)(?:\s+(?:today|now|please))?[.?!]*$/i)?.[1];
  const beforeLocalTopic = text.match(/^(?:(?:आज|आत्ता|सध्या)\s+)?(.+?)\s+(?:हवामान|मौसम|तापमान|हवा\s+(?:कशी|कैसी)|प्रदूषण)(?=\s|[.?!।]|$)/u)?.[1];
  return placeName(local || afterTopic || beforeTopic || beforeLocalTopic);
}

export function labeledCity(text) {
  return placeName(text.match(/\bcity:\s*([^.!?;\n]+)/i)?.[1]);
}

export function statedCity(text) {
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

export function correctedCity(text) {
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
