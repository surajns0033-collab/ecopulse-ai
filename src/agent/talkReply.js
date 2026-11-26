import { INTENTS } from './intentEngine.js';
import { asksForForecast } from './talkContext.js';
import { officialLinkRequest } from '../services/webSources.js';

const statusCopy = {
  unavailable: {
    en: 'I couldn’t get a reply just now. Could you try again?',
    hi: 'अभी जवाब नहीं मिल सका। फिर से पूछेंगे?',
    mr: 'आत्ता उत्तर मिळालं नाही. पुन्हा विचाराल का?',
  },
  unverified: {
    en: 'I couldn’t verify that right now, so I won’t guess.',
    hi: 'मैं अभी इसकी पुष्टि नहीं कर सकी, इसलिए अंदाज़ा नहीं लगाऊँगी।',
    mr: 'आत्ता याची खात्री करता आली नाही, म्हणून मी अंदाज लावणार नाही.',
  },
  source: {
    en: 'I found a source you can open below.',
    hi: 'मुझे एक स्रोत मिला। आप उसे नीचे खोल सकते हैं।',
    mr: 'मला एक स्रोत सापडला. तो खाली उघडू शकता.',
  },
};

export function talkStatus(status, language) {
  return statusCopy[status][language.split('-')[0]] || statusCopy[status].en;
}

export function talkWebReference(message, sources) {
  // When someone wants an official link, don't read an incomplete summary
  // after stripping its URL or label a third-party result as the official site.
  const official = officialLinkRequest(message);
  const requestedHost = official?.domain;
  for (const { url } of sources) {
    try {
      const source = new URL(url);
      if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) continue;
      const host = source.hostname.replace(/^www\./, '');
      if (official && !(requestedHost
        ? host === requestedHost || host.endsWith(`.${requestedHost}`)
        : /\.gov(?:\.[a-z]{2})?$/.test(host))) continue;
      return { url: source.href, linkOnly: Boolean(official) };
    } catch { /* Skip malformed provider links. */ }
  }
  return null;
}

export function shortSpeech(value, language = 'en') {
  const clean = String(value || '')
    .split(/^\s*\*{0,2}(?:sources|references)\*{0,2}:?\s*$/im)[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^[\s#]*(?:[-*•]|\d+\.)\s+/gm, '')
    .replace(/[<>*#_`•]|\p{Extended_Pictographic}|[\uFE0E\uFE0F]/gu, '')
    .replace(/\s+/g, ' ').trim();
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(clean)].map(({ segment }) => segment.trim())
    : clean.split(/(?<=[.!?।])\s+/u);
  const spoken = [];
  for (const sentence of sentences.slice(0, 2)) {
    const next = [...spoken, sentence].join(' ');
    if (next.length > 350 || next.split(/\s+/).length > 42) break;
    spoken.push(sentence);
  }
  if (spoken.length) return spoken.join(' ');
  if (!clean) return '';
  const words = clean.slice(0, 340).split(/\s+/).slice(0, 39);
  if (clean.length > 340) words.pop();
  return `${words.join(' ').replace(/[,;:\-–—]+$/, '')}…`;
}

function aqiAdvice(aqi, lang) {
  if (lang === 'hi') {
    if (aqi > 150) return 'फ़िलहाल बाहर भारी व्यायाम टालें।';
    if (aqi > 100) return 'साँस या दिल की परेशानी हो तो देर तक बाहर व्यायाम न करें।';
    return 'बाहर हों तो धुएँ और भारी ट्रैफ़िक से दूर रहें।';
  }
  if (lang === 'mr') {
    if (aqi > 150) return 'सध्या बाहेर जड व्यायाम टाळा.';
    if (aqi > 100) return 'श्वसनाचा किंवा हृदयाचा त्रास असेल तर बाहेर जास्त वेळ व्यायाम टाळा.';
    return 'बाहेर असताना धूर आणि जड वाहतूक टाळा.';
  }
  if (aqi > 150) return 'Move strenuous exercise indoors for now so you breathe in fewer particles.';
  if (aqi > 100) return 'If you’re sensitive to pollution, shorten strenuous outdoor activity.';
  return '';
}

function smogSpeech(aqi, city, lang, profile) {
  const high = aqi > 150;
  const outdoor = profile.routine === 'outdoor work';
  const filter = Boolean(profile.filtration && profile.filtration !== 'no purifier');
  const gas = profile.cooking === 'gas stove';
  const drives = ['car', 'two-wheeler'].includes(profile.commute);
  const staysHome = profile.commute === 'work from home';
  if (lang === 'hi') {
    const lead = aqi == null ? `मैं ${city} की अभी की हवा की रीडिंग की पुष्टि नहीं कर सकी।`
      : `${city} में एयर क्वालिटी इंडेक्स ${aqi} है${high ? (outdoor ? ', इसलिए काम के बीच अंदर आराम करें' : ', इसलिए बाहर भारी मेहनत कम करें') : ''}।`;
    const travel = drives ? 'कम धुएँ के लिए कार की जगह बस या ट्रेन लें'
      : staysHome ? 'कम गाड़ी चलाने के लिए काम एक ही चक्कर में करें' : 'कम वाहन उत्सर्जन के लिए बस या ट्रेन चुनें';
    const indoor = filter ? 'घर के कण कम करने के लिए फ़िल्टर चलाएँ' : gas ? 'गैस के धुएँ को बाहर निकालें' : 'धूल कम करने के लिए गीला पोछा लगाएँ';
    return `${lead} ${travel}, और ${indoor}।`;
  }
  if (lang === 'mr') {
    const lead = aqi == null ? `मला ${city} इथली सध्याची हवा गुणवत्ता खात्रीने सांगता आली नाही.`
      : `${city} इथे हवा गुणवत्ता निर्देशांक ${aqi} आहे${high ? (outdoor ? ', म्हणून कामातून अधूनमधून आत विश्रांती घ्या' : ', म्हणून बाहेर जड काम कमी करा') : ''}.`;
    const travel = drives ? 'धूर कमी करण्यासाठी गाडीऐवजी बस किंवा रेल्वे घ्या'
      : staysHome ? 'गाडीच्या फेऱ्या कमी करण्यासाठी कामे एकत्र करा' : 'वाहनांचा धूर कमी करण्यासाठी बस किंवा रेल्वे निवडा';
    const indoor = filter ? 'घरातले कण कमी करण्यासाठी फिल्टर चालू ठेवा' : gas ? 'गॅसचा धूर बाहेर सोडा' : 'धूळ कमी करण्यासाठी ओल्या फडक्याने पुसा';
    return `${lead} ${travel} आणि ${indoor}.`;
  }
  const lead = aqi == null ? `I couldn’t check the current air quality in ${city}.`
    : `The air quality index is ${aqi} in ${city}${high ? (outdoor ? ', so take breaks indoors if you can' : ', so limit strenuous outdoor activity') : ' right now'}.`;
  const travel = drives ? 'Try transit instead of driving to cut exhaust'
    : staysHome ? 'Combine errands to cut vehicle trips'
      : profile.commute === 'walk/cycle' && !high ? 'Walk or cycle on quieter streets to breathe less exhaust' : 'Take transit to cut exhaust';
  const indoor = filter ? `run your ${profile.filtration === 'HEPA purifier' ? 'HEPA ' : ''}filter to remove indoor particles`
    : gas ? 'vent your gas stove outdoors to clear cooking fumes' : 'damp-mop to keep dust out of the air';
  return `${lead} ${travel}, and ${indoor}.`;
}

export function toolSpeech(result, turn, language) {
  const city = turn.location?.city;
  const name = turn.location?.name || city;
  const smog = turn.intent === INTENTS.GET_SMOG_PLAN ? result.speechData?.profile : null;
  const lang = language.split('-')[0];
  if (result.pending === 'SMOG_PLAN_AWAITING_PROFILE') {
    if (lang === 'hi') return 'आप रोज़ कैसे आते-जाते हैं और दिन कहाँ बिताते हैं? घर में खाना बनाने, हवा साफ़ करने और साँस की तकलीफ़ के बारे में भी बताइए।';
    if (lang === 'mr') return 'तुमचा रोजचा प्रवास आणि दिनक्रम कसा असतो? घरी स्वयंपाक, एअर फिल्टर आणि श्वासाचा त्रास असल्यास त्याबद्दलही सांगा.';
    return 'How do you get around and spend your day? Tell me how you cook and filter the air, and if anyone at home is sensitive to pollution.';
  }

  const reading = result.cards?.find((card) => card.type === 'aqi')?.data;
  const { aqi, scale } = reading || {};
  if (smog && city) return shortSpeech(smogSpeech(aqi != null && Number.isFinite(Number(aqi)) ? Number(aqi) : null, name, lang, smog), language);
  if (aqi != null && Number.isFinite(Number(aqi)) && city) {
    const label = lang === 'hi' ? `${name} का अभी का एयर क्वालिटी इंडेक्स ${aqi} है।`
      : lang === 'mr' ? `${name} इथला सध्याचा हवा गुणवत्ता निर्देशांक ${aqi} आहे.`
        : `The ${scale === 'U.S. AQI' ? 'U.S. ' : ''}air quality index in ${name} is ${aqi} right now.`;
    if (asksForForecast(turn.message)) {
      const unavailable = lang === 'hi' ? 'मैं उस समय की वायु गुणवत्ता की पुष्टि नहीं कर सकी।'
        : lang === 'mr' ? 'त्या वेळेची हवा गुणवत्ता मला खात्रीने सांगता येत नाही.' : 'I couldn’t verify AQI for the time you asked about.';
      return `${unavailable} ${label}`;
    }
    return shortSpeech(`${label} ${aqiAdvice(Number(aqi), lang)}`, language);
  }

  if (turn.intent === INTENTS.GET_WEATHER && city) {
    // The existing weather tool fetches current conditions only, not the future.
    const future = asksForForecast(turn.message);
    const temp = result.speechData?.weather?.temp;
    if (lang === 'hi') {
      const current = Number.isFinite(temp) ? `${name} में अभी ${temp} डिग्री सेल्सियस है।` : '';
      return future ? `उस समय का मौसम मैं पक्का नहीं बता सकती। ${current}`.trim() : current || `मैं ${name} का मौजूदा मौसम पक्का नहीं बता सकी।`;
    }
    if (lang === 'mr') {
      const current = Number.isFinite(temp) ? `${name} इथे आत्ता ${temp} अंश सेल्सियस आहेत.` : '';
      return future ? `त्या वेळेचा अंदाज मला खात्रीने सांगता येत नाही. ${current}`.trim() : current || `मला ${name} इथले सध्याचे हवामान खात्रीने सांगता आले नाही.`;
    }
    const weather = result.speechData?.weather;
    const conditions = { 'Clear sky': 'clear', 'Mainly clear': 'mostly clear', 'Partly cloudy': 'partly cloudy', 'Fog': 'foggy', 'Rain': 'raining', 'Rain showers': 'showery', 'Overcast': 'cloudy', 'Drizzle': 'drizzling', 'Snow': 'snowing' };
    const adjective = conditions[weather?.description];
    const current = Number.isFinite(temp)
      ? `Right now in ${name}, it’s ${adjective ? `${adjective} and ` : ''}${temp} degrees Celsius.`
      : '';
    return future ? `I can’t verify the forecast for the time you asked about. ${current}`.trim() : current || `I couldn’t verify the current weather for ${city}.`;
  }
  if (result.status === 'unavailable' && city) {
    return lang === 'hi' ? `मैं ${name} की ताज़ा जानकारी की पुष्टि नहीं कर सकी।`
      : lang === 'mr' ? `मला ${name} इथली सध्याची माहिती खात्रीने मिळाली नाही.` : `I couldn’t verify the latest reading for ${city}.`;
  }
  const asksForContact = [INTENTS.GET_AUTHORITY_CONTACTS, INTENTS.CREATE_REPORT, INTENTS.CREATE_EMAIL].includes(turn.intent);
  if (asksForContact && result.speechData?.contact) {
    const contact = result.speechData.contact;
    if (contact.national) {
      if (lang === 'hi') return `मैं ${name} का स्थानीय संपर्क सत्यापित नहीं कर सकी। नीचे भारत का राष्ट्रीय पोर्टल है।`;
      if (lang === 'mr') return `मला ${name} इथला स्थानिक संपर्क खात्रीने मिळाला नाही. भारताचं राष्ट्रीय पोर्टल खाली आहे.`;
      return `I don’t have a verified local contact in ${name}. I’ve linked India’s national portal below.`;
    }
    if (lang === 'hi') return `${name} के लिए ${contact.organization} से संपर्क करें। नीचे आधिकारिक वेबसाइट खोल सकते हैं।`;
    if (lang === 'mr') return `${name} साठी ${contact.organization} शी संपर्क साधा. अधिकृत वेबसाइट खाली उघडू शकता.`;
    return `For ${name}, start with ${contact.organization}. You can open its official site below.`;
  }
  if (asksForContact && city) {
    if (lang === 'hi') return `मैं ${name} का स्थानीय संपर्क सत्यापित नहीं कर सकी। शहर की आधिकारिक वेबसाइट पर शिकायत का पेज देखें।`;
    if (lang === 'mr') return `मला ${name} इथला स्थानिक संपर्क खात्रीने मिळाला नाही. शहराच्या अधिकृत वेबसाइटवर तक्रारीचं पान शोधा.`;
    return `I don’t have a verified local contact in ${name}. Check the city’s official website for its complaint page.`;
  }
  if (result.status === 'preview') return 'Use Chat or Events to review the details before submitting anything.';
  return shortSpeech(result.text, language);
}
