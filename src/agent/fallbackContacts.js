export function cityLabel(location) {
  const city = location?.city;
  if (!city || city === 'Unknown' || city === 'your city') return 'your area';
  return city;
}

export function contactLines(recipient) {
  if (!recipient) return [];
  if (recipient.jurisdiction !== 'india') return recipient.disclaimer ? [recipient.disclaimer] : [];
  const lines = [];
  if (recipient.localUnavailable) lines.push('📍 **No verified local contact**');
  else if (recipient.organization) lines.push(`🏛️ **Local — ${recipient.organization}**`);
  if (recipient.email && recipient.email.includes('@')) lines.push(`📧 Email: ${recipient.email}`);
  if (recipient.helpline) lines.push(`📞 Helpline: ${recipient.helpline}`);
  if (recipient.whatsapp) lines.push(`💬 WhatsApp: ${recipient.whatsapp}`);
  if (recipient.portalUrl) lines.push(`🌐 ${recipient.localUnavailable ? 'National portal' : 'Portal'}: ${recipient.portalUrl}`);
  if (recipient.sourceUrl) lines.push(`[Official contact listing](${recipient.sourceUrl})`);
  if (recipient.forestEmail) {
    lines.push(`🌳 Forest / Tree Cell: ${recipient.forestEmail}${recipient.forestHelpline ? ` · ${recipient.forestHelpline}` : ''}`);
  }

  const state = recipient.stateAuthority;
  if (state) {
    const bits = [
      state.emails?.length ? `📧 ${state.emails.slice(0, 2).join(' · ')}` : null,
      state.phones?.length ? `📞 ${state.phones.slice(0, 2).join(' · ')}` : null,
      state.portal ? `🌐 ${state.portal}` : null,
    ].filter(Boolean);
    lines.push(`🏛️ **State — ${state.name}**`);
    if (bits.length) lines.push(bits.join('  |  '));
  }

  const national = (recipient.nationalAuthority || []).find((a) => a.id === 'cpcb');
  if (national) {
    const bits = [
      national.emails?.length ? `📧 ${national.emails[0]}` : null,
      national.phones?.length ? `📞 ${national.phones[0]}` : null,
      national.portal ? `🌐 ${national.portal}` : null,
    ].filter(Boolean);
    lines.push(`🇮🇳 **National — ${national.name}**`);
    if (bits.length) lines.push(bits.join('  |  '));
  }
  if (recipient.nationalPortal) lines.push(`🧾 Tracked grievance: ${recipient.nationalPortal}`);
  if (recipient.civicDomain === 'traffic') {
    lines.push('🚨 Immediate danger / blocked emergency access: **112**');
  } else {
    lines.push('🚨 Fire, chemical leak, or immediate danger to life: **112**');
  }

  return lines;
}

export function liveSummary(aqi, weather, city) {
  const parts = [];
  if (weather) parts.push(`🌤️ ${weather.temp}°C, ${weather.description}, humidity ${weather.humidity}%`);
  if (aqi) parts.push(`🌬️ AQI ${aqi.aqi} (PM2.5 ${aqi.pm25 ?? '—'} µg/m³)`);
  if (!parts.length) return '';
  return `Right now in **${city}**:\n${parts.join('\n')}`;
}

export function buildComplaintEmailTemplate({ situation, recipient, city, issueLabel, hasPhoto = false }) {
  const place = city && city !== 'Unknown' ? city : 'my locality';
  const name = recipient?.name || 'Sir/Madam';
  const issueText = issueLabel ? issueLabel.toLowerCase() : 'an environmental problem';
  const subject = `Environmental complaint${issueLabel ? ` — ${issueLabel}` : ''} — ${place}`;

  const body = [
    `Dear ${name},`,
    '',
    `I wish to report ${issueText} in ${place}.`,
    '',
    'Details of the issue:',
    situation && situation.trim() ? situation.trim() : '[Describe what is happening]',
    '',
    'Location: [Building / street / landmark]',
    'Since when: [Date and time noticed]',
    'Affected residents: [Approximate number or "my household and neighbours"]',
    hasPhoto ? '[Attach the photo of the site if it is safe and appropriate to share.]' : null,
    '',
    'Please inspect the site and let me know what action can be taken.',
    '',
    'Regards,',
    '[Your full name]',
    '[Your address]',
    '[Your phone number]',
  ].filter((line) => line !== null).join('\n');

  return { subject, body };
}
