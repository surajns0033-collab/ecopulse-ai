export function officialLinkRequest(message) {
  if (!/\bofficial\b/i.test(message) || !/\b(?:site|website|page|portal|link|url)\b/i.test(message)) return null;
  const domain = message.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,24}(?![a-z0-9-]|\.[a-z0-9-])/i)?.[0];
  return { domain: domain?.toLowerCase().replace(/^www\./, '') || null };
}
