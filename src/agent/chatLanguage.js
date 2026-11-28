// Match common input errors only in the classifier. Geocoding, drafts and
// visible conversation history continue to receive the original user text.
const spellings = new Map(Object.entries({
  smgo: 'smog', somg: 'smog', plna: 'plan', paln: 'plan', aqiindex: 'aqi',
  polushun: 'pollution', polushan: 'pollution', pradushn: 'pradushan',
  skool: 'school', schl: 'school', forcast: 'forecast', wheather: 'weather',
  temparature: 'temperature', tommorow: 'tomorrow', tommorrow: 'tomorrow',
  cretae: 'create', qualty: 'quality', complent: 'complaint',
}));
const vocabulary = ['pollution', 'forecast', 'weather', 'quality', 'commute', 'routine', 'tomorrow',
  'school', 'assembly', 'exposure', 'emissions', 'indoor', 'outdoor', 'scooter', 'cycling', 'asthma',
  'purifier', 'exhaust', 'burning', 'garbage', 'complaint', 'report', 'municipal', 'meetup', 'pradushan'];

for (const word of vocabulary) {
  for (let i = 0; i < word.length; i++) {
    const prefix = word.slice(0, i);
    const suffix = word.slice(i + 1);
    const variants = [prefix + suffix, prefix + word[i] + word[i] + suffix];
    if (suffix) variants.push(prefix + suffix[0] + word[i] + suffix.slice(1));
    for (const variant of variants) {
      if (variant !== word && !vocabulary.includes(variant)) {
        const previous = spellings.get(variant);
        spellings.set(variant, previous === undefined || previous === word ? word : variant);
      }
    }
  }
}

/** @param {string} text */
export function recognitionText(text) {
  return text.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|\b[a-z]+\b/gi,
    token => spellings.get(token.toLowerCase()) ?? token);
}

/** @param {string} text */
export function schoolActivity(text) {
  return /(?:\bschool\b|स्कूल|विद्यालय)/iu.test(text) &&
    /\b(?:assembly|sports|outdoor|bahar|baahar|playground)\b|सभा|खेल|बाहर/iu.test(text);
}
