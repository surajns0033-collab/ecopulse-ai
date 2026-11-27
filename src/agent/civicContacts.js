import { tools } from '../services/agentTools';
import { getAuthorityBundle } from '../services/authorityDirectory.js';
import { detectIssueCategory } from './civicIssues.js';
import { resolveCity } from './placeContext.js';

function nationalContact(authority) {
  const parts = [`**${authority.name}**`];
  if (authority.emails?.length) parts.push(`📧 ${authority.emails.join(' · ')}`);
  if (authority.phones?.length) parts.push(`📞 ${authority.phones.join(' · ')}`);
  if (authority.portal) parts.push(`🌐 ${authority.portal}`);
  return `• ${parts.join('  |  ')}`;
}

function regionalContact(state, place) {
  const regional = state.regional?.find(office => place.toLowerCase().includes(office.area.toLowerCase()));
  if (!regional) return null;
  return [
    `**${regional.area} regional office**`,
    regional.emails?.length && `📧 ${regional.emails.join(' · ')}`,
    regional.phones?.length && `📞 ${regional.phones.join(' · ')}`,
  ].filter(Boolean).join('  |  ');
}

function stateContact(state, place, traffic) {
  if (!state) return traffic
    ? '🏛️ **State police**\nUse your state police citizen portal for a tracked complaint. Call 112 only for immediate danger.'
    : `🏛️ **State pollution control board**\nFind your state board's official contact on CPCB's directory: 🌐 https://cpcb.nic.in — then use its grievance form.`;
  return [
    `🏛️ **${state.name}**`,
    state.emails?.length && `📧 ${state.emails.join(' · ')}`,
    state.phones?.length && `📞 ${state.phones.join(' · ')}`,
    state.portal && `🌐 ${state.portal}`,
    state.notes && `ℹ️ ${state.notes}`,
    regionalContact(state, place),
    !state.verified && '⚠️ Email not published — use the online grievance form on the portal.',
  ].filter(Boolean).join('\n');
}

function localContact(recipient) {
  const localLines = [recipient.localUnavailable ? '📍 **No verified local contact**' : `📍 **${recipient.organization}**`];
  if (recipient.email && recipient.email.includes('@')) localLines.push(`📧 ${recipient.email}`);
  else localLines.push('📧 No verified email published — use the portal form');
  if (recipient.helpline) localLines.push(`📞 ${recipient.helpline}`);
  if (recipient.whatsapp) localLines.push(`💬 WhatsApp: ${recipient.whatsapp}`);
  if (recipient.portalUrl) localLines.push(`🌐 ${recipient.localUnavailable ? 'National portal: ' : ''}${recipient.portalUrl}`);
  if (recipient.sourceUrl) localLines.push(`[Official contact listing](${recipient.sourceUrl})`);
  if (recipient.forestEmail) {
    localLines.push(`🌳 Forest / Tree Cell: ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`);
  }
  return localLines.join('\n');
}

/**
 * Full three-level contact directory: national → state → local.
 * Only publicly published contacts are shown. Where no email is confirmed we
 * point at the official grievance form rather than inventing an address.
 */
export async function handleAuthorityContacts(userMessage, location) {
  const city = resolveCity(location?.city);
  const recipient = await tools.findVerifiedRecipient({
    issueCategory: detectIssueCategory(userMessage),
    city,
  });
  if (recipient.jurisdiction !== 'india') {
    return {
      text: recipient.jurisdiction === 'unknown' ? 'Which city and country do you need the authority contacts for?'
        : `I don't have verified local contacts for **${city}**. Check the official city or regional website for its **environment, sanitation, public works, or police** complaint page.`,
      cards: [],
      actions: [],
      status: 'info',
    };
  }
  const bundle = getAuthorityBundle(city);
  const isTraffic = recipient.civicDomain === 'traffic';
  const stateAuthority = recipient.stateAuthority || bundle.state;
  const nationalAuthorities = isTraffic
    ? bundle.national.filter((authority) => authority.id === 'emergency')
    : bundle.national;

  const text = [
    `Here are the **national → state → local** contacts for **${city}**. 📇`,
    '',
    '🇮🇳 **National (escalation & policy)**',
    ...nationalAuthorities.map(nationalContact),
    '',
    stateContact(stateAuthority, city, isTraffic),
    '',
    localContact(recipient),
    '',
    '🧭 **Which one should you use?**',
    isTraffic
      ? '• **Parking / road obstruction** → local traffic police helpline or complaint portal first.'
      : '• **Day-to-day civic issue** (garbage, burning, sewage, dust, tree cutting) → **local** body first.',
    isTraffic
      ? '• Keep the exact location, time, obstruction photo, and vehicle number; do not confront the driver.'
      : '• **No action in 7–15 days** → escalate to the **state** pollution board, CC the local body.',
    isTraffic
      ? '• For a non-emergency, use the written police portal so you receive a complaint record.'
      : '• **Still nothing, or it is serious/illegal** → file on **CPGRAMS** (tracked) and/or approach the **NGT**.',
    '• **Happening right now** → call the published local/state helpline. Use **112** only for fire, hazardous leaks, blocked emergency access, or immediate danger to life.',
    '',
    '_Publicly listed official contacts — verify on the official portal before sending._',
  ].join('\n');

  return {
    text,
    cards: [],
    actions: [
      { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
      { label: '📋 File Report', action: 'QUICK_REPORT', variant: 'secondary' },
    ],
    status: 'info',
  };
}
