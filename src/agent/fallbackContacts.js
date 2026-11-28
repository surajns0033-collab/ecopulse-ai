export function cityLabel(location) {
  const city = location?.city;
  if (!city || city === 'Unknown' || city === 'your city') return 'your area';
  return city;
}

function localContactLines(recipient) {
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

  return lines;
}

function authorityLines(authority, heading, limit) {
  if (!authority) return [];
  const emails = authority.emails?.slice(0, limit).join(' · ');
  const phones = authority.phones?.slice(0, limit).join(' · ');
  const channels = [emails && '📧 ' + emails, phones && '📞 ' + phones, authority.portal && '🌐 ' + authority.portal];
  return [heading + authority.name + '**', channels.filter(Boolean).join('  |  ')].filter(Boolean);
}

export function contactLines(recipient) {
  if (!recipient) return [];
  if (recipient.jurisdiction !== 'india') return recipient.disclaimer ? [recipient.disclaimer] : [];
  const national = recipient.nationalAuthority?.find(authority => authority.id === 'cpcb');
  const lines = [
    ...localContactLines(recipient),
    ...authorityLines(recipient.stateAuthority, '🏛️ **State — ', 2),
    ...authorityLines(national, '🇮🇳 **National — ', 1),
  ];
  if (recipient.nationalPortal) lines.push(`🧾 Tracked grievance: ${recipient.nationalPortal}`);
  if (recipient.civicDomain === 'traffic') {
    lines.push('🚨 Immediate danger / blocked emergency access: **112**');
  } else {
    lines.push('🚨 Fire, chemical leak, or immediate danger to life: **112**');
  }

  return lines;
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
