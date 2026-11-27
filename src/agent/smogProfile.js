export const AWAITING_SMOG_PROFILE = 'SMOG_PLAN_AWAITING_PROFILE';

function detailIsDenied(text, match) {
  const deniedBefore = /\b(?:no|not|never|neither|without|don['’]?t|doesn['’]?t)(?:\s+(?:have|own|use|cook(?:\s+(?:on|with))?))?(?:\s+(?:an?|any))?\s+$/u;
  const deniedAfter = /^\s+(?:नहीं|नाही)(?=\s|[।.!?,]|$)/u;
  return deniedBefore.test(text.slice(0, match.index)) || deniedAfter.test(text.slice(match.index + match[0].length));
}

function hasAffirmedDetail(text, pattern) {
  return Array.from(text.matchAll(pattern)).some((match) => !detailIsDenied(text, match));
}

function cookingFuel(text) {
  const fuels = /(?<electric>\b(?:induction(?: stove| cooktop)?|electric cook(?:ing|top)?|electric stove)\b|इंडक्शन|इंडक्‍शन)|\b(?:gas(?: stove| cook(?:ing|top)?)?|lpg(?: stove)?)\b|गैस|गॅस/gu;
  let gas = null;
  let lastDenialEnd = -1;
  for (const match of text.matchAll(fuels)) {
    // Keep a denial across an appliance list, as in "neither gas nor induction".
    const linked = lastDenialEnd >= 0 && /^\s*(?:,\s*)?(?:or|nor)\s+(?:an?\s+)?$/u.test(text.slice(lastDenialEnd, match.index));
    if (linked || detailIsDenied(text, match)) {
      lastDenialEnd = match.index + match[0].length;
      continue;
    }
    lastDenialEnd = -1;
    if (match.groups.electric) return 'induction/electric';
    gas = 'gas stove';
  }
  return gas;
}

// Only use details the user actually provided. Missing fields aren't lifestyle facts.
export function parseSmogProfile(message) {
  const text = String(message || '').toLowerCase();
  const negatedCar = /\b(?:(?:don['’]?t|do not|never)\s+(?:drive|use (?:a |the )?car)|no car|not by car)\b/u.test(text);
  const commute = (!negatedCar && /\b(car|drive|driving)\b|कार से|कारने|गाड़ी से/u.test(text)) ? 'car'
    : /\b(two.?wheeler|bike|motorbike|scooter)\b|बाइक|स्कूटर|दुचाकी/u.test(text) ? 'two-wheeler'
      : /\b(walk|cycle|cycling|bicycle)\b|पैदल|पायी|साइकिल|सायकल/u.test(text) ? 'walk/cycle'
        : /\b(work from home|wfh|remote)\b|घर से काम|घरून काम/u.test(text) ? 'work from home'
          : /\b(bus|metro|train|transit|public transport|local train)\b|बस से|बसने|मेट्रो|ट्रेन|रेल्वे/u.test(text) ? 'public transport' : null;

  const routine = /\b(outdoor work|work outdoors|field work|construction work|delivery|traffic police|street vendor)\b|बाहर काम|बाहेर काम/u.test(text) ? 'outdoor work'
    : /\b(mostly home|homemaker|at home|work from home)\b|घर से काम|घरून काम/u.test(text) ? 'mostly home'
      : /\b(mixed|hybrid)\b/.test(text) ? 'mixed'
        : /\b(office|school)\b|दफ़्तर|ऑफिस|शाळा/u.test(text) ? 'office/school' : null;

  const cooking = cookingFuel(text);

  const filtration = /\b(?:no|without|don['’]?t have an?|do not have an?)\s+(?:air |hepa )?(?:purifier|filter)\b|(?:फ़िल्टर|फिल्टर|प्यूरिफायर)(?:\s+.{0,12})?\s+(?:नहीं|नाही)/u.test(text) ? 'no purifier'
    : /\bhepa\b|हेपा/u.test(text) ? 'HEPA purifier'
      : /\b(diy|filter fan|filtered fan)\b/.test(text) ? 'DIY filtered-air setup' : null;

  const vulnerable = [
    hasAffirmedDetail(text, /\b(?:child|children|kids?|baby)\b|बच्च[ेा]|मुल[ंे]/gu) && 'children',
    hasAffirmedDetail(text, /\b(?:older adult|elderly|senior|grandparent)s?\b|बुज़ुर्ग|बुजुर्ग|वृद्ध/gu) && 'older adults',
    hasAffirmedDetail(text, /\b(?:asthma|lung condition|heart condition|respiratory condition|copd)\b|अस्थमा|दमा/gu) && 'heart/lung sensitivity',
  ].filter(Boolean);
  return { commute, routine, cooking, filtration, vulnerable };
}

export function isSmogProfile(message) {
  if (/^(?:skip|not sure|(?:i )?don['’]?t know|give me a general plan)[.!?]*$/i.test(message.trim())) return true;
  if (/^(?:how|what|why|when|where|can you|could you|do i|should i)\b/i.test(message.trim())) return false;
  const { commute, routine, cooking, filtration, vulnerable } = parseSmogProfile(message);
  return Boolean(commute || routine || cooking || filtration || vulnerable.length);
}
