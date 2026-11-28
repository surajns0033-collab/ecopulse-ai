import { INTENTS } from './intentPatterns.js';

// Explicit action phrases outrank broad topics. A request about joining an
// event, for example, should open attendance guidance in every supported language.
const requests = [
  [INTENTS.JOIN_EVENT, /(?:\b(?:join|register for|attend)\b.{0,25}\b(?:meetup|eco.event|cleanup)\b|(?:meetup|कार्यक्रम|अभियान).{0,20}(?:register|पंजीकरण|शामिल))/iu],
  [INTENTS.CREATE_EVENT, /(?:सफाई|हरियाली|safai)\s+(?:अभियान|abhiyan).{0,22}(?:आयोजित|शुरू|aayojit|shuru)/iu],
  [INTENTS.FIND_EVENTS, /(?:सफाई|safai)\s+(?:अभियान|abhiyan).{0,22}(?:ढूँढ|ढूंढ|दिखा|dhund|dhoond|dikha)/iu],
  [INTENTS.CREATE_EMAIL, /(?:शिकायत|shikayat).{0,28}(?:ईमेल|मेल|email|mail).{0,15}(?:लिख|बना|likh|bana)/iu],
  [INTENTS.GET_AUTHORITY_CONTACTS, /(?:नगर निगम|nagar nigam).{0,25}(?:हेल्पलाइन|संपर्क|helpline|sampark)/iu],
  [INTENTS.CREATE_REPORT, /(?:मैंने|हमने|maine|humne).{0,45}(?:कचरा|धुआँ|धुआं|धूल|kachra|dhua|dhool).{0,24}(?:देख|dekha)/iu],
  [INTENTS.UPLOAD_PHOTO_REPORT, /(?:फोटो|तस्वीर|tasveer).{0,18}(?:जाँच|जांच|देखो|check karo|dekho)/iu],
  [INTENTS.GET_COMMUNITY, /(?:समुदाय|samuday)\s+(?:की|ki)\s+(?:पोस्ट|posts?)/iu],
  [INTENTS.GET_USER_IMPACT, /(?:मेरी पर्यावरण गतिविधि|meri eco activit(?:y|ies)|\bmy eco impact\b)/iu],
  [INTENTS.GET_DAILY_PLAN, /(?:पर्यावरण दिनचर्या|paryavaran dincharya)/iu],
  [INTENTS.GET_HEALTH_TIPS, /\bhealth (?:tips|advice|precautions)\b.{0,32}\b(?:air quality|aqi|smog|pollution)\b/iu],
  [INTENTS.GET_HEALTH_TIPS, /(?:प्रदूषण|धुंध|pradushan|smog).{0,20}(?:स्वास्थ्य|सेहत|sehat).{0,15}(?:सुझाव|सलाह|tips|salah)/iu],
  [INTENTS.GET_ROUTES, /(?:कम प्रदूषण|kam pradushan).{0,18}(?:रास्ता|मार्ग|rasta|raasta)/iu],
  [INTENTS.GET_WASTE_TIPS, /(?:कचरा|kachra).{0,16}(?:अलग|छाँट|alag|chhaant).{0,16}(?:कैसे|करें|kaise|kare)/iu],
  [INTENTS.GET_WATER_QUALITY, /(?:पानी|paani|pani)\s+(?:की|ki)\s+(?:गुणवत्ता|quality)/iu],
  [INTENTS.GET_AIR_QUALITY, /(?:हवा\s+(?:की\s+गुणवत्ता|कैसी)|वायु गुणवत्ता|ए\s*क्यू\s*आई)/u],
  [INTENTS.GET_WEATHER, /मौसम|बारिश|तापमान/u],
];

/** @param {string} text */
export function localizedIntent(text) {
  return requests.find(([, pattern]) => pattern.test(text))?.[0];
}
