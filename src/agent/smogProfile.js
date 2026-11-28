import { recognitionText } from './chatLanguage.js';

export const AWAITING_SMOG_PROFILE = 'SMOG_PLAN_AWAITING_PROFILE';

// Rule order preserves the planner's preference when several values apply.
/** @typedef {'car'|'two-wheeler'|'walk/cycle'|'work from home'|'public transport'} Commute */
/** @type {Array<[Commute, RegExp]>} */
const COMMUTES = [
  ['car', /\b(?:car|(?:drive|driving)(?:\s+(?:(?:a|the|my|our)\s+)?car)?)\b|कार से|कारने|गाड़ी से/gu],
  ['two-wheeler', /\b(?:two.?wheeler|bike|motorbike|scooter)\b|बाइक|स्कूटर|दुचाकी/gu],
  ['walk/cycle', /\b(?:walk|cycle|cycling|bicycle)\b|पैदल|पायी|साइकिल|सायकल/gu],
  ['work from home', /\b(?:work from home|wfh|remote)\b|घर से काम|घरून काम/gu],
  ['public transport', /\b(?:bus|metro|train|transit|public transport|local train)\b|बस से|बसने|मेट्रो|ट्रेन|रेल्वे/gu],
];

/** @typedef {'outdoor work'|'mostly home'|'mixed'|'office/school'} Routine */
/** @type {Array<[Routine, RegExp]>} */
const ROUTINES = [
  ['outdoor work', /\b(?:outdoor work|work outdoors|field work|construction work|delivery|traffic police|street vendor)\b|बाहर काम|बाहेर काम/gu],
  ['mostly home', /\b(?:mostly (?:at )?home|homemaker|work from home|stay at home|based at home)\b|(?:^|[,;.]\s*)at home(?=\s*(?:[,;.!]|$))|घर से काम|घरून काम/gu],
  ['mixed', /\b(?:mixed|hybrid)\b/gu],
  ['office/school', /\b(?:office|school)\b|दफ़्तर|ऑफिस|शाळा/gu],
];

/** @typedef {'induction/electric'|'gas stove'} Fuel */
/** @type {Array<[Fuel, RegExp]>} */
const FUELS = [
  ['induction/electric', /\b(?:induction(?: stove| cooktop)?|electric cook(?:ing|top)?|electric stove)\b|इंडक्शन|इंडक्‍शन/gu],
  ['gas stove', /\b(?:gas(?: stove| cook(?:ing|top)?)?|lpg(?: stove)?)\b|गैस|गॅस/gu],
];

/** @typedef {'children'|'older adults'|'heart/lung sensitivity'} Sensitivity */
/** @type {Array<[Sensitivity, RegExp]>} */
const SENSITIVITIES = [
  ['children', /\b(?:child|children|kids?|baby)\b|बच्च[ेा]|मुल[ंे]/gu],
  ['older adults', /\b(?:older adult|elderly|senior|grandparent)s?\b|बुज़ुर्ग|बुजुर्ग|वृद्ध/gu],
  ['heart/lung sensitivity', /\b(?:asthma|lung condition|heart condition|respiratory condition|copd)\b|अस्थमा|दमा/gu],
];

const NEGATION_BEFORE = /\b(?:no|not|never|neither|without|don['’]?t|doesn['’]?t)(?:\s+(?:have|own|use|take|ride|by|(?:go|travel|commute)\s+(?:by|to)|cook(?:\s+(?:on|with))?))?(?:\s+(?:an?|any|the|my|our))?\s+$/u;
const NEGATION_AFTER = /^\s+(?:(?:se|par|pe|से|पर|मेरे पास|हमारे पास|घर पर|घर में|उपलब्ध|आमच्याकडे|घरी)\s+)?(?:नहीं|नही|नाही|nahin?|nhi)(?=\s|[।.!?,;]|$)/u;
const LIST_CONTINUATION = /^\s*,?\s*(?:or|nor)\s+(?:(?:an?|the|any)\s+)?$/u;

/** @template {string} T @param {string} text @param {Array<[T, RegExp]>} rules @returns {T[]} */
function statedValues(text, rules) {
  const mentions = rules.flatMap(([value, pattern]) =>
    Array.from(text.matchAll(pattern), match => ({ value, start: match.index, end: match.index + match[0].length })));
  mentions.sort((a, b) => a.start - b.start);
  const stated = new Set();
  let denialEnd = -1;
  for (const { value, start, end } of mentions) {
    // Carry a denial across "neither gas nor induction", but allow a later
    // independent statement such as "no car, but I drive to school".
    const linked = denialEnd >= 0 && LIST_CONTINUATION.test(text.slice(denialEnd, start));
    if (linked || NEGATION_BEFORE.test(text.slice(Math.max(0, start - 64), start)) || NEGATION_AFTER.test(text.slice(end))) {
      denialEnd = end;
    } else {
      denialEnd = -1;
      stated.add(value);
    }
  }
  return rules.map(([value]) => value).filter(value => stated.has(value));
}

/** @typedef {'HEPA purifier'|'DIY filtered-air setup'} FilterSetup */
/** @type {Array<[FilterSetup, RegExp]>} */
const FILTER_SETUPS = [
  ['HEPA purifier', /\bhepa(?:\s+(?:air\s+)?(?:purifier|filter))?\b|हेपा(?:\s+(?:फ़िल्टर|फिल्टर|प्यूरिफायर))?/gu],
  ['DIY filtered-air setup', /\b(?:diy(?:\s+(?:filter(?:ed)?[- ]fan|filter|purifier))?|filter(?:ed)?[- ]fan)\b/gu],
];
const GENERIC_FILTER = /\b(?:(?:air\s+)?purifier|filter)\b|फ़िल्टर|फिल्टर|प्यूरिफायर/gu;

/** @param {string} text */
function airFiltration(text) {
  const [setup] = statedValues(text, FILTER_SETUPS);
  if (setup) return setup;

  // If only a specific device was ruled out, preserve that distinction.
  const absent = FILTER_SETUPS.filter(([, pattern]) => text.search(pattern) >= 0).map(([name]) => name);
  if (absent.length) return 'without ' + absent.join(' or ');
  for (const match of text.matchAll(GENERIC_FILTER)) {
    if (NEGATION_BEFORE.test(text.slice(0, match.index)) || NEGATION_AFTER.test(text.slice(match.index + match[0].length))) return 'no purifier';
  }
  return null;
}

/** @param {string} text */
export function communitySetting(text) {
  if (/\b(?:our school|school community|school assembly|for (?:the |a )?school)\b|हमारा स्कूल|आमची शाळा/iu.test(text)) return 'school';
  if (/\b(?:housing society|residents['’]? association|apartment community|our neighbou?rhood|community (?:smog|clean.air) plan)\b|हमारी सोसाइटी|आमची सोसायटी/iu.test(text)) return 'neighbourhood';
  return null;
}

/** @typedef {{ commute: Commute|null, routine: Routine|null, cooking: Fuel|null,
 * filtration: string|null, noVentedHood: boolean, vulnerable: Sensitivity[], community: 'school'|'neighbourhood'|null }} SmogProfile */
/** @param {unknown} message @returns {SmogProfile} */
export function parseSmogProfile(message) {
  const text = recognitionText(String(message || '').toLowerCase()).replace(/\s+/gu, ' ').trim();
  return {
    commute: statedValues(text, COMMUTES)[0] ?? null,
    routine: statedValues(text, ROUTINES)[0] ?? null,
    cooking: statedValues(text, FUELS)[0] ?? null,
    filtration: airFiltration(text),
    noVentedHood: /\b(?:no|without|do not have|don't have|don’t have)\s+(?:(?:a|an|any)\s+)?(?:vented |exhaust |range |cooker )?hood\b|\b(?:hood|chimney)\s+(?:nahi|nahin)\b|(?:हुड|चिमनी)\s+नहीं/iu.test(text),
    vulnerable: statedValues(text, SENSITIVITIES),
    community: communitySetting(text),
  };
}

/** @param {string} message */
export function isSmogProfile(message) {
  if (/^(?:skip|not sure|(?:i )?don['’]?t know|give me a general plan)[.!?]*$/i.test(message.trim())) return true;
  if (/^(?:how|what|why|when|where|can you|could you|do i|should i)\b/i.test(message.trim())) return false;
  const { commute, routine, cooking, filtration, vulnerable, community } = parseSmogProfile(message);
  return Boolean(commute || routine || cooking || filtration || vulnerable.length || community);
}
