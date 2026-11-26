// Only use details the user actually provided. Missing fields aren't lifestyle facts.
export function parseSmogProfile(message) {
  const text = String(message || '').toLowerCase();
  const negatedDrive = /\b(?:don['’]?t|do not|never)\s+drive\b/i.test(text);
  const commute = (!negatedDrive && /\b(car|drive|driving)\b|कार से|कारने|गाड़ी से/u.test(text)) ? 'car'
    : /\b(two.?wheeler|bike|motorbike|scooter)\b|बाइक|स्कूटर|दुचाकी/u.test(text) ? 'two-wheeler'
      : /\b(walk|cycle|cycling|bicycle)\b|पैदल|पायी|साइकिल|सायकल/u.test(text) ? 'walk/cycle'
        : /\b(work from home|wfh|remote)\b|घर से काम|घरून काम/u.test(text) ? 'work from home'
          : /\b(bus|metro|train|public transport|local train)\b|बस से|बसने|मेट्रो|ट्रेन|रेल्वे/u.test(text) ? 'public transport' : null;

  const routine = /\b(outdoor work|work outdoors|field work|construction work|delivery|traffic police|street vendor)\b|बाहर काम|बाहेर काम/u.test(text) ? 'outdoor work'
    : /\b(mostly home|homemaker|at home|work from home)\b|घर से काम|घरून काम/u.test(text) ? 'mostly home'
      : /\b(mixed|hybrid)\b/.test(text) ? 'mixed'
        : /\b(office|school)\b|दफ़्तर|ऑफिस|शाळा/u.test(text) ? 'office/school' : null;

  const cooking = /\b(induction|electric cook(?:ing|top)?|electric stove)\b|इंडक्शन|इंडक्‍शन/u.test(text) ? 'induction/electric'
    : /\b(gas(?: stove| cook(?:ing|top)?)?|lpg)\b|गैस|गॅस/u.test(text) ? 'gas stove' : null;

  const filtration = /\b(?:no|without|don['’]?t have an?|do not have an?)\s+(?:air |hepa )?(?:purifier|filter)\b|(?:फ़िल्टर|फिल्टर|प्यूरिफायर)(?:\s+.{0,12})?\s+(?:नहीं|नाही)/u.test(text) ? 'no purifier'
    : /\bhepa\b|हेपा/u.test(text) ? 'HEPA purifier'
      : /\b(diy|filter fan|filtered fan)\b/.test(text) ? 'DIY filtered-air setup' : null;

  const vulnerable = [
    /\b(child|children|kids?|baby)\b|बच्च[ेा]|मुल[ंे]/u.test(text) && !/\bno (?:children|kids?)\b/.test(text) && 'children',
    /\b(older adult|elderly|senior|grandparent)s?\b|बुज़ुर्ग|बुजुर्ग|वृद्ध/u.test(text) && 'older adults',
    /\b(asthma|lung condition|heart condition|respiratory condition|copd)\b|अस्थमा|दमा/u.test(text) && !/\bno asthma\b/.test(text) && 'heart/lung sensitivity',
  ].filter(Boolean);
  return { commute, routine, cooking, filtration, vulnerable };
}

export function isSmogProfile(message) {
  if (/^(?:skip|not sure|(?:i )?don['’]?t know|give me a general plan)[.!?]*$/i.test(message.trim())) return true;
  if (/^(?:how|what|why|when|where|can you|could you|do i|should i)\b/i.test(message.trim())) return false;
  const { commute, routine, cooking, filtration, vulnerable } = parseSmogProfile(message);
  return Boolean(commute || routine || cooking || filtration || vulnerable.length);
}
