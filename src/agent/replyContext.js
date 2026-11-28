export function conversationStyle(userMessage) {
  const lower = userMessage.toLowerCase().trim();
  if (/^(?:i\s*need|ineed|need|can you|could you|please|pls)?.{0,18}\bhelp(?:\s+me)?[.!?]*$/i.test(lower)) return 'The user has only said they need help. Reply with one warm, open-ended sentence asking what they need help with. Do not list capabilities, examples, location, or environmental features.';
  if (/^(?:what'?s?\s+(?:going(?:\s+on)?|up|new)|whatsgoing|how(?:'s| is|s)\s+it\s+going|how\s+are\s+you|sup|wassup|wyd)[.!?]*$/i.test(lower)) return 'This is casual small talk. Reply naturally like a friendly conversational partner in no more than two short sentences. Do not list capabilities, mention location, AQI, weather, complaints, or advertise features.';
  if (/\b(not (?:good|okay|ok|well)|bad day|feeling (?:sad|low|down|stressed|anxious|lonely|tired)|i(?:'m| am) (?:sad|upset|stressed|anxious|lonely|tired)|need to talk)\b/i.test(lower)) return 'This is a personal or emotional conversation. Respond empathetically to what the user actually said and invite them to share more when appropriate. Do not advertise tools, list capabilities, mention location, environment, AQI, authorities, or complaints. Do not diagnose.';
  return '';
}

export function wantsWeb(message) {
  return /\b(search (?:the )?web|google (?:this|it|for)|look (?:this )?up|latest|recent news|today['’]?s news|current (?:rule|rules|law|laws|policy|policies|deadline|official update)|what happened today)\b/i.test(message);
}

export function concernsComplaint(message) {
  return /\b(complain|complaint|grievance|authority contacts?|helpline|midc|mpcb|nmmc|bmc|mcd|bbmp|shikayat)\b/i.test(message);
}

function authorityDetails(authority) {
  return [authority.name, ...(authority.emails || []), ...(authority.phones || []), authority.portal].filter(Boolean).join(' | ');
}

function verifiedContacts(recipient) {
  if (recipient.jurisdiction !== 'india') return [recipient.disclaimer];
  const local = recipient.localUnavailable ? 'No verified local contact.' : recipient.organization;
  return [local, recipient.email, recipient.portalUrl, recipient.helpline, recipient.whatsapp,
    recipient.sourceUrl, recipient.forestEmail, recipient.forestHelpline, recipient.nationalPortal,
    ...[recipient.stateAuthority, ...(recipient.nationalAuthority || [])].filter(Boolean).map(authorityDetails),
    'Quote only these contacts. If a level is missing, say so and refer to the official portal.'];
}

export function replyContext(city, message, recipient) {
  const location = city ? 'Most recently discussed city: ' + city + '. Use this only when the question refers to that city. The user may be elsewhere.' : 'Ask for the city if local evidence is needed.';
  const guidance = [location, conversationStyle(message)];
  if (recipient) guidance.push(...verifiedContacts(recipient));
  return guidance.filter(Boolean).join('\n');
}
