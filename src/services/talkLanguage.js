export const DEFAULT_TALK_LOCALE = 'en-IN';
export const languageCode = (locale = '') => locale.toLowerCase().split('-')[0];

const words = (text) => String(text || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
const vocabulary = (text) => new Set(text.split(' '));
const count = (tokens, list) => tokens.filter((word) => list.has(word)).length;

// Score grammar, not place names, greetings borrowed into other languages, or
// shared topic words like AQI. Hindi and Marathi also share a writing system.
const ENGLISH = vocabulary('i you we they it this that the is are am was were be have has had do does did can could will would should may might what whats which who when where wheres why how hows my your our their me in at for from about near and with just please want need feel feeling tired today tomorrow tell help show check explain going speak understand sound sounds know thank thanks good morning afternoon evening night nice meet glad great');
const ENGLISH_SHORT = /^(?:hi|hey|hello|goodbye|bye|thanks?|weather|forecast|temperature|(?:yes[, ]+)?that['’]s (?:right|correct))[.!?\s]*$/i;
const HINDI = vocabulary('है हैं हूँ हूं था थी थे मेरा मेरे मेरी मुझे मुझको हमें आप आपको आपका क्या कैसा कैसी कैसे क्यों कहाँ कहां यहाँ यहां वहाँ वहां कितना कितनी कितने बताओ बताइए बताएं बताएँ कहना बोलो बोलिए चाहिए नहीं हाँ हां समझ रहा रही रहे सुनाई करें करूँगी सकी सके सका लिए पाई कौन किस मौजूदा');
const MARATHI = vocabulary('आहे आहेत आहेस आहात नाही मला तुला तुम्हाला तुम्ही माझ्या माझा माझे माझी तुमचं काय कुठे कसा कशी कसं कसे किती करा सांगा सांगाल सांगू सांगता पाहू आत्ता सध्या इथे तिथे मध्ये आणि पाऊस उद्या आजचा आजचं चांगलं बरोबर खात्रीने शकतो शकते म्हणायचं कोणते हवामान');
const HINDI_LATIN = vocabulary('hai hain hoon hun mujhe mera meri mere kya kaisa kaise kaisi kyun kyon kahan kahaan kitna kitni batao bataiye chahiye nahi nahin nahii haan mausam baarish aap aapko mujko matlab');
const MARATHI_LATIN = vocabulary('aahe ahe aahet aahat havaman havaaman madhye madhe sanga saanga sangal majhya mazya maza majha aajcha aata atta ithe kuthe kiti kashi kase tumhala tumhi aani barobar');
const OTHER_SCRIPTS = [
  [/\p{Script=Bengali}/u, 'bn-IN'], [/\p{Script=Gujarati}/u, 'gu-IN'], [/\p{Script=Gurmukhi}/u, 'pa-IN'],
  [/\p{Script=Tamil}/u, 'ta-IN'], [/\p{Script=Telugu}/u, 'te-IN'], [/\p{Script=Kannada}/u, 'kn-IN'],
  [/\p{Script=Malayalam}/u, 'ml-IN'], [/\p{Script=Hangul}/u, 'ko'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
];

// Some regional recognizers spell clearly spoken English phonetically in
// Devanagari. Recover common English phrases, but leave actual Hindi/Marathi
// sentences (including ones with English loanwords) and city names untouched.
const PHONETIC_ENGLISH = new Map(Object.entries({
  हॅलो: 'hello', हेलो: 'hello', हैलो: 'hello', हाय: 'hi', गुड: 'good', मॉर्निंग: 'morning', आफ्टरनून: 'afternoon', इव्हनिंग: 'evening',
  हाउ: 'how', हाऊ: 'how', आर: 'are', यू: 'you', टुडे: 'today', व्हॉट: 'what', व्हाट: 'what', वॉट: 'what', व्हॉट्स: 'what’s',
  इज: 'is', इज़: 'is', द: 'the', वेदर: 'weather', एअर: 'air', एयर: 'air', क्वालिटी: 'quality', इन: 'in',
  नियर: 'near', नीयर: 'near', मी: 'me', गोइंग: 'going', ऑन: 'on', थँक: 'thank', थैंक: 'thank',
}));

export function detectTalkLanguage(text) {
  const tokens = words(text);
  if (!tokens.length) return '';
  if (ENGLISH_SHORT.test(String(text).trim())) return DEFAULT_TALK_LOCALE;
  if (/^(?:हो|थांबा)[.?!।\s]*$/u.test(text)) return 'mr-IN';

  const english = count(tokens, ENGLISH) + Number(/\b(?:weather|temperature|forecast)\b/i.test(text));
  const hindi = 2 * count(tokens, HINDI) + count(tokens, HINDI_LATIN) +
    Number(/\b(?:ka|ki|ke)\s+(?:aqi|hawa|weather|air quality|mausam)\b/i.test(text)) +
    Number(/\b(?:kya|kaisa|kaisi|kitna|kitni)\b.+\b(?:hai|hain)\b/i.test(text));
  const marathi = 2 * count(tokens, MARATHI) + count(tokens, MARATHI_LATIN);
  let otherLocale = '', otherScore = 0;
  for (const [script, locale] of OTHER_SCRIPTS) {
    const score = 2 * tokens.filter((word) => script.test(word)).length;
    if (score > otherScore) { otherLocale = locale; otherScore = score; }
  }

  if (english >= 2 && english >= Math.max(hindi, marathi, otherScore)) return DEFAULT_TALK_LOCALE;
  if (hindi > Math.max(marathi, otherScore) && (hindi >= 2 || tokens.length > 1)) return 'hi-IN';
  if (marathi > Math.max(hindi, otherScore) && (marathi >= 2 || tokens.length > 1)) return 'mr-IN';
  if (otherScore > Math.max(english, hindi, marathi)) return otherLocale;
  return '';
}

export function normalizeTalkTranscript(transcript) {
  const text = String(transcript || '').normalize('NFKC').trim();
  const tokens = words(text);
  if (count(tokens, HINDI) || count(tokens, MARATHI)) return text;
  const mapped = tokens.filter((word) => PHONETIC_ENGLISH.has(word));
  if (mapped.length < 2 && !/^(?:हॅलो|हेलो|हैलो|हाय)[.!?।\s]*$/u.test(text)) return text;
  const candidate = text.replace(/[\p{L}\p{M}]+/gu, (word) => PHONETIC_ENGLISH.get(word) || word).replace(/।/g, '.');
  return detectTalkLanguage(candidate) === DEFAULT_TALK_LOCALE ? candidate : text;
}

export function talkInputLanguage(text, questionLocale = '', awaitingPlace = false) {
  const detected = detectTalkLanguage(text);
  if (detected || !questionLocale) return detected;
  const cleaned = text.trim().replace(/[.!?।]+$/u, '');
  const acknowledgment = /^(?:yes|yeah|yep|no|nope|ok|okay|sure|correct|han|haan|nahi)$/i.test(cleaned);
  const place = awaitingPlace && (/^[\p{L}\p{M}’'-]+$/u.test(cleaned) ||
    /^(?:\p{Lu}[\p{L}\p{M}’'.-]*[,\s]*){2,8}$/u.test(cleaned) ||
    /^[\p{L}\p{M}’'. -]+(?:,\s*[\p{L}\p{M}’'. -]+){1,3}$/u.test(cleaned));
  return acknowledgment || place ? questionLocale : '';
}

export function canonicalTalkLocale(value) {
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(value)) return '';
  try {
    const locale = Intl.getCanonicalLocales(value)[0];
    return locale && !['und', 'mul', 'zxx'].includes(languageCode(locale)) ? locale : '';
  } catch { return ''; }
}

export function talkMicLocale(browserLocale, conversationLocale = '') {
  const browser = canonicalTalkLocale(browserLocale) || DEFAULT_TALK_LOCALE;
  const preferred = canonicalTalkLocale(conversationLocale);
  return !preferred || languageCode(browser) === languageCode(preferred) ? browser : preferred;
}

export function talkReplyLocale(text, requested = '', reported = '') {
  const actual = detectTalkLanguage(text);
  const reportedLocale = canonicalTalkLocale(reported);
  const locale = requested || reportedLocale;
  const target = languageCode(locale);
  if (target && actual && languageCode(actual) !== target) return '';
  if (requested && reportedLocale && languageCode(reportedLocale) !== target && !actual) return '';
  // The script alone can't distinguish Hindi from Marathi, but both replies
  // should be written in Devanagari, not unclassified Latin text.
  const tokens = words(text);
  if ((target === 'hi' || target === 'mr') && !tokens.some((word) => /\p{Script=Devanagari}/u.test(word))) return '';
  if (target === 'en' && !actual && tokens.filter((word) => /[^\p{Script=Latin}\p{M}]/u.test(word)).length > tokens.length / 2) return '';
  return locale || actual || DEFAULT_TALK_LOCALE;
}
