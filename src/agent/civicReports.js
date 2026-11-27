import { tools } from '../services/agentTools';
import { getJsonResponse } from '../services/geminiService';
import { getAuthorityBundle } from '../services/authorityDirectory.js';
import { buildComplaintEmailTemplate } from './fallbackBrain.js';
import { AWAITING_DRAFT_DETAILS, incidentCity } from './chatPlaces.js';
import { resolveCity } from './placeContext.js';
import { describesIssue, detectIssueCategory, ISSUE_LABELS, observationText } from './civicIssues.js';

export async function handleCreateReport(userMessage, userId, location) {
  const city = resolveCity(location?.city) || 'your area';
  const lat = location?.lat;
  const lng = location?.lng;

  const lower = userMessage.toLowerCase();
  let category = 'other';
  let title = 'Environmental Issue Report';

  if ((lower.includes('parking') || lower.includes('parked') || lower.includes('vehicle')) && (lower.includes('block') || lower.includes('obstruct') || lower.includes('road') || lower.includes('footpath'))) { category = 'road_obstruction'; title = 'Road / Footpath Obstruction by Parked Vehicle'; }
  else if (lower.includes('burning') || lower.includes('buring') || lower.includes('jalana') || lower.includes('smoke')) { category = 'burning'; title = 'Open Burning Issue'; }
  else if (lower.includes('landfill') || lower.includes('land filling') || lower.includes('excavation material') || lower.includes('soil dumping') || lower.includes('rubble dumping')) { category = 'greenspace'; title = 'Land Filling / Excavation Material Dumping'; }
  else if (lower.includes('garbage') || lower.includes('kachra') || lower.includes('dumping')) { category = 'garbage'; title = 'Illegal Garbage Dumping'; }
  else if (lower.includes('plastic')) { category = 'plastic'; title = 'Plastic Waste Issue'; }
  else if (lower.includes('sewage') || lower.includes('nali') || lower.includes('naala') || lower.includes('nala') || lower.includes('drain')) { category = 'sewage'; title = 'Sewage / Polluted Drain Issue'; }
  else if (lower.includes('water')) { category = 'water'; title = 'Water Pollution Issue'; }
  else if (lower.includes('tree') || lower.includes('mangrove')) { category = 'trees'; title = 'Tree / Mangrove Damage Issue'; }
  else if (lower.includes('construction') || lower.includes('dust')) { category = 'construction'; title = 'Construction Dust Issue'; }
  else if (lower.includes('air') || lower.includes('pollution')) { category = 'air'; title = 'Air Pollution Issue'; }

  // Fetch official authority details so user knows whom to complain to
  const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
  const isTreeOrMangrove = lower.includes('tree') || lower.includes('mangrove') || lower.includes('forest');

  const forestLine = isTreeOrMangrove && recipient.forestEmail
    ? `🌿 **Forest / Tree Protection Cell:** ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`
    : null;

  // "Where do I complain about X?" — the user wants the route, not a report draft.
  const askingWhere =
    /\b(where|whom|kisko|kahan|kaha|kaise|how do i|how to)\b/i.test(lower) &&
    !/\b(my|our|near|nearby|outside|behind|beside|opposite|society|street|road|happening|since|yesterday|today|saw|seen|noticed|smell|stink|gate)\b/i.test(lower);

  if (askingWhere) {
    const immediateNumber = !/emergency only/i.test(recipient.helpline || '')
      ? (recipient.helpline || (isTreeOrMangrove ? recipient.forestHelpline : null))
      : null;
    const contactBlock = [
      `🏛️ **${recipient.organization}**`,
      recipient.email && recipient.email.includes('@') ? `📧 Email: ${recipient.email}` : null,
      recipient.helpline ? `📞 Helpline: ${recipient.helpline}` : null,
      recipient.whatsapp ? `💬 WhatsApp: ${recipient.whatsapp}` : null,
      recipient.portalUrl ? `🌐 Portal: ${recipient.portalUrl}` : null,
      recipient.sourceUrl ? `[Official contact listing](${recipient.sourceUrl})` : null,
      forestLine,
    ].filter(Boolean).join('\n');

    return {
      text: `Here's how to report the issue for **${city}**:\n\n${contactBlock}\n${recipient.disclaimer}\n\n**To make it count:** write it down with the **exact location, date and time**, attach **photos/video**, and note the **reference number** you get back.${immediateNumber ? ` If it's happening right now, call **${immediateNumber}** first so the responsible team can inspect.` : recipient.jurisdiction !== 'india' ? ' Verify the emergency number for this location with local authorities.' : ' If there is fire or immediate danger to life, call **112**; otherwise use the official portal for a tracked complaint.'}\n\nWant me to draft the email? 📧`,
      cards: [],
      actions: [
        { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
        { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category } },
      ],
      status: 'info',
    };
  }
  // Use AI to structure title/description/locality cleanly from the user's message.
  // If the model is unreachable we keep the user's own words — never invent place names.
  let finalLocation = city;
  let finalDescription = userMessage.trim();
  const structured = await getJsonResponse(
    `Extract a concise report title, a clean factual 1-2 sentence description, and the specific locality from this complaint.
Complaint: "${userMessage}"
Default city: "${city}".
Rules: do not invent names, streets, dates or facts. If the locality is not stated, use the default city.
Respond in JSON: {"title":"...","description":"...","locality":"..."}`,
    '',
    { timeoutMs: 15000 }
  );
  if (structured) {
    if (structured.title) title = String(structured.title).slice(0, 120);
    if (structured.description) finalDescription = String(structured.description).slice(0, 600);
    const loc = typeof structured.locality === 'string' ? structured.locality.trim().slice(0, 120) : '';
    if (loc && lower.includes(loc.toLowerCase()) && !/unknown|not specified/i.test(loc)) {
      const cityShort = city.split(',')[0].trim();
      finalLocation = loc.toLowerCase().includes(cityShort.toLowerCase()) ? loc : `${loc}, ${city}`;
    }
  }

  const previewData = {
    title,
    category,
    description: finalDescription,
    location: finalLocation,
    userId,
    lat,
    lng,
  };

  const authorityLines = [
    `🏛️ **Where to complain:** ${recipient.organization}`,
    recipient.email && recipient.email.includes('@') ? `📧 Email: ${recipient.email}` : null,
    recipient.helpline ? `📞 Helpline: ${recipient.helpline}` : null,
    recipient.whatsapp ? `💬 WhatsApp: ${recipient.whatsapp}` : null,
    recipient.portalUrl ? `🌐 Portal: ${recipient.portalUrl}` : null,
    recipient.sourceUrl ? `[Official contact listing](${recipient.sourceUrl})` : null,
    isTreeOrMangrove && recipient.forestEmail
      ? `🌿 **Forest / Tree Protection Cell CC:** ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`
      : (isTreeOrMangrove && recipient.forestHelpline ? `🌿 **State Forest Helpline (24/7):** ${recipient.forestHelpline}` : null),
  ].filter(Boolean).join('\n');

  const urgentHelpline = !/emergency only/i.test(recipient.helpline || '')
    ? (recipient.helpline || (isTreeOrMangrove ? recipient.forestHelpline : null))
    : null;

  const proofHint = isTreeOrMangrove
    ? '📸 *Got a photo? Attach it — it speeds up inspection. **Draft Email** will also CC the Forest Cell.*'
    : '📸 *Got a photo? Attach it — evidence makes the complaint much harder to ignore.*';

  return {
    text: `Thank you for speaking up for **${finalLocation}**! 🙌 Reporting this really makes a difference in our community.${urgentHelpline ? `\n\n🚨 **Happening right now?** Call **${urgentHelpline}** so the responsible local team can inspect it.` : recipient.jurisdiction !== 'india' ? '\n\n🚨 Verify the correct emergency number on the local government or police website; none is guessed here.' : '\n\n🚨 If there is fire, a hazardous leak, or immediate danger to life, call **112**; otherwise review the written complaint below.'}\n\n${authorityLines}\n${recipient.disclaimer}\n\n${proofHint}`,
    cards: [{ type: 'report-preview', data: previewData }],
    actions: [
      { label: '📧 Draft Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
      { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category } },
    ],
    status: 'preview',
  };
}

/**
 * Full three-level contact directory: national → state → local.
 * Only publicly published contacts are shown. Where no email is confirmed we
 * point at the official grievance form rather than inventing an address.
 */
export async function handleAuthorityContacts(userMessage, location) {
  const city = resolveCity(location?.city);
  const place = city;

  const bundle = getAuthorityBundle(city);
  const recipient = await tools.findVerifiedRecipient({
    issueCategory: detectIssueCategory(userMessage),
    city,
  });
  if (recipient.jurisdiction !== 'india') {
    return {
      text: recipient.jurisdiction === 'unknown' ? 'Which city and country do you need the authority contacts for?'
        : `I don't have verified local contacts for **${place}**. Check the official city or regional website for its **environment, sanitation, public works, or police** complaint page.`,
      cards: [],
      actions: [],
      status: 'info',
    };
  }
  const isTraffic = recipient.civicDomain === 'traffic';
  const stateAuthority = recipient.stateAuthority || bundle.state;
  const nationalAuthorities = isTraffic
    ? bundle.national.filter((authority) => authority.id === 'emergency')
    : bundle.national;

  // ---- National ----
  const nationalLines = nationalAuthorities.map((a) => {
    const parts = [`**${a.name}**`];
    if (a.emails?.length) parts.push(`📧 ${a.emails.join(' · ')}`);
    if (a.phones?.length) parts.push(`📞 ${a.phones.join(' · ')}`);
    if (a.portal) parts.push(`🌐 ${a.portal}`);
    return `• ${parts.join('  |  ')}`;
  });

  // ---- State ----
  let stateBlock;
  if (stateAuthority) {
    const stateLines = [`🏛️ **${stateAuthority.name}**`];
    if (stateAuthority.emails?.length) stateLines.push(`📧 ${stateAuthority.emails.join(' · ')}`);
    if (stateAuthority.phones?.length) stateLines.push(`📞 ${stateAuthority.phones.join(' · ')}`);
    if (stateAuthority.portal) stateLines.push(`🌐 ${stateAuthority.portal}`);
    if (stateAuthority.notes) stateLines.push(`ℹ️ ${stateAuthority.notes}`);

    const regional = (stateAuthority.regional || []).find((r) => place.toLowerCase().includes(r.area.toLowerCase()));
    if (regional) {
      const regionalBits = [
        `**${regional.area} regional office**`,
        regional.emails?.length ? `📧 ${regional.emails.join(' · ')}` : null,
        regional.phones?.length ? `📞 ${regional.phones.join(' · ')}` : null,
      ].filter(Boolean);
      stateLines.push(regionalBits.join('  |  '));
    }
    if (!stateAuthority.verified) {
      stateLines.push('⚠️ Email not published — use the online grievance form on the portal.');
    }
    stateBlock = stateLines.join('\n');
  } else {
    stateBlock = isTraffic
      ? '🏛️ **State police**\nUse your state police citizen portal for a tracked complaint. Call 112 only for immediate danger.'
      : `🏛️ **State pollution control board**\nFind your state board's official contact on CPCB's directory: 🌐 https://cpcb.nic.in — then use its grievance form.`;
  }

  // ---- Local ----
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

  const text = [
    `Here are the **national → state → local** contacts for **${place}**. 📇`,
    '',
    '🇮🇳 **National (escalation & policy)**',
    ...nationalLines,
    '',
    stateBlock,
    '',
    localLines.join('\n'),
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

export async function handleCreateEmail(userMessage, conversationHistory, city, turn) {
  const recentUserMessages = (conversationHistory || [])
    .filter((m) => m.role === 'user' && m.text)
    .slice(-4)
    .map((m) => m.text);

  const cityOnly = /^city:\s*[^.!?;\n]+[.!?]?$/i.test(userMessage.trim());
  const currentHasIssue = !cityOnly && (turn?.draftDetails || describesIssue(userMessage));
  const historyIssueMsg = [...recentUserMessages].reverse().find(describesIssue);
  const historyPlace = historyIssueMsg ? incidentCity(historyIssueMsg) : '';
  const parts = (value) => String(value || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const historyMatchesCurrentCity = historyPlace && parts(historyPlace).every((part) => parts(city).includes(part));

  // If user hasn't explained a concrete issue/situation for the current city yet, ask clarifying questions
  if (!currentHasIssue && (!historyIssueMsg || !historyMatchesCurrentCity)) {
    return {
      text: `I can draft a complaint${city ? ` for **${city}**` : ''}. What happened, where exactly, and when did you notice it? If it happened in a different city, include its name and state or country.`,
      cards: [],
      actions: [],
      status: 'needs_info',
      pending: AWAITING_DRAFT_DETAILS,
      pendingData: { draftIssue: cityOnly ? turn?.draftIssue : detectIssueCategory(userMessage) },
    };
  }

  const situationText = observationText(currentHasIssue ? userMessage : historyIssueMsg);
  const detectedCategory = detectIssueCategory(situationText);
  const issueCategory = detectedCategory === 'default' ? (turn?.draftIssue || detectedCategory) : detectedCategory;
  const recipient = await tools.findVerifiedRecipient({ issueCategory, city });

  let cc = null;
  let ccLabel = null;
  const isTreeOrForestIssue =
    /tree|mangrove|forest|jungle|wood|felling|cutting/i.test(situationText) ||
    /tree|mangrove|forest|cc/i.test(userMessage);

  if (isTreeOrForestIssue && recipient.forestEmail) {
    cc = recipient.forestEmail;
    ccLabel = recipient.forestHelpline ? `State Forest Dept (Helpline: ${recipient.forestHelpline})` : 'State Forest Department';
  }

  // Keep the observed facts verbatim. Unknown dates and addresses stay as
  // placeholders, and we do not send complaint details to a model to guess them.
  const { subject, body } = buildComplaintEmailTemplate({
    situation: situationText,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[issueCategory],
    hasPhoto: /\b(?:i have|i took|and have|attached|attaching)\b.*\b(?:photo|picture|image)\b/i.test(situationText),
  });

  const draftData = {
    to: recipient.email,
    recipientName: recipient.name,
    organization: recipient.organization,
    location: city,
    cc,
    ccLabel,
    portalUrl: recipient.portalUrl,
    sourceUrl: recipient.sourceUrl,
    helpline: recipient.helpline,
    subject,
    body,
    disclaimer: recipient.disclaimer,
  };

  return {
    text: recipient.email
      ? `I drafted this complaint for **${recipient.organization}**. Review the details and fill in any blanks before sending.`
      : 'I drafted the complaint without an email address because I couldn’t verify one. Review the details and use the official portal if listed.',
    cards: [{ type: 'email-preview', data: draftData }],
    actions: [],
    status: 'preview',
  };
}
