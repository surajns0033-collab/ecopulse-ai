export const AWAITING_SMOG_PROFILE = 'SMOG_PLAN_AWAITING_PROFILE';

// Rule order preserves the planner's preference when several values apply.
const COMMUTES = [
  ['car', /\b(?:car|(?:drive|driving)(?:\s+(?:(?:a|the|my|our)\s+)?car)?)\b|कार से|कारने|गाड़ी से/gu],
  ['two-wheeler', /\b(?:two.?wheeler|bike|motorbike|scooter)\b|बाइक|स्कूटर|दुचाकी/gu],
  ['walk/cycle', /\b(?:walk|cycle|cycling|bicycle)\b|पैदल|पायी|साइकिल|सायकल/gu],
  ['work from home', /\b(?:work from home|wfh|remote)\b|घर से काम|घरून काम/gu],
  ['public transport', /\b(?:bus|metro|train|transit|public transport|local train)\b|बस से|बसने|मेट्रो|ट्रेन|रेल्वे/gu],
];

const ROUTINES = [
  ['outdoor work', /\b(?:outdoor work|work outdoors|field work|construction work|delivery|traffic police|street vendor)\b|बाहर काम|बाहेर काम/gu],
  ['mostly home', /\b(?:mostly (?:at )?home|homemaker|work from home|stay at home|based at home)\b|(?:^|[,;.]\s*)at home(?=\s*(?:[,;.!]|$))|घर से काम|घरून काम/gu],
  ['mixed', /\b(?:mixed|hybrid)\b/gu],
  ['office/school', /\b(?:office|school)\b|दफ़्तर|ऑफिस|शाळा/gu],
];

const FUELS = [
  ['induction/electric', /\b(?:induction(?: stove| cooktop)?|electric cook(?:ing|top)?|electric stove)\b|इंडक्शन|इंडक्‍शन/gu],
  ['gas stove', /\b(?:gas(?: stove| cook(?:ing|top)?)?|lpg(?: stove)?)\b|गैस|गॅस/gu],
];

const SENSITIVITIES = [
  ['children', /\b(?:child|children|kids?|baby)\b|बच्च[ेा]|मुल[ंे]/gu],
  ['older adults', /\b(?:older adult|elderly|senior|grandparent)s?\b|बुज़ुर्ग|बुजुर्ग|वृद्ध/gu],
  ['heart/lung sensitivity', /\b(?:asthma|lung condition|heart condition|respiratory condition|copd)\b|अस्थमा|दमा/gu],
];

const NEGATION_BEFORE = /\b(?:no|not|never|neither|without|don['’]?t|doesn['’]?t)(?:\s+(?:have|own|use|take|ride|by|(?:go|travel|commute)\s+(?:by|to)|cook(?:\s+(?:on|with))?))?(?:\s+(?:an?|any|the|my|our))?\s+$/u;
const NEGATION_AFTER = /^\s+(?:(?:se|par|pe|से|पर)\s+)?(?:नहीं|नही|नाही|nahin?|nhi)(?=\s|[।.!?,;]|$)/u;
const LIST_CONTINUATION = /^\s*,?\s*(?:or|nor)\s+(?:(?:an?|the|any)\s+)?$/u;

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

function airFiltration(text) {
  if (/\b(?:no|without|don['’]?t have an?|do not have an?)\s+(?:air |hepa )?(?:purifier|filter)\b|(?:फ़िल्टर|फिल्टर|प्यूरिफायर)(?:\s+.{0,12})?\s+(?:नहीं|नाही)/u.test(text)) return 'no purifier';
  if (/\bhepa\b|हेपा/u.test(text)) return 'HEPA purifier';
  if (/\b(?:diy|filter fan|filtered fan)\b/u.test(text)) return 'DIY filtered-air setup';
  return null;
}

export function communitySetting(text) {
  if (/\b(?:our school|school community|school assembly|for (?:the |a )?school)\b|हमारा स्कूल|आमची शाळा/iu.test(text)) return 'school';
  if (/\b(?:housing society|residents['’]? association|apartment community|our neighbou?rhood|community (?:smog|clean.air) plan)\b|हमारी सोसाइटी|आमची सोसायटी/iu.test(text)) return 'neighbourhood';
  return null;
}

export function parseSmogProfile(message) {
  const text = String(message || '').toLowerCase().replace(/\s+/gu, ' ').trim();
  return {
    commute: statedValues(text, COMMUTES)[0] ?? null,
    routine: statedValues(text, ROUTINES)[0] ?? null,
    cooking: statedValues(text, FUELS)[0] ?? null,
    filtration: airFiltration(text),
    vulnerable: statedValues(text, SENSITIVITIES),
    community: communitySetting(text),
  };
}

export function isSmogProfile(message) {
  if (/^(?:skip|not sure|(?:i )?don['’]?t know|give me a general plan)[.!?]*$/i.test(message.trim())) return true;
  if (/^(?:how|what|why|when|where|can you|could you|do i|should i)\b/i.test(message.trim())) return false;
  const { commute, routine, cooking, filtration, vulnerable, community } = parseSmogProfile(message);
  return Boolean(commute || routine || cooking || filtration || vulnerable.length || community);
}
