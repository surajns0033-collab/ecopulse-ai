// Fallback brain — answers that stay useful when no AI provider is reachable.
//
// Rules: never invent data, never invent contacts, never promise an action
// that didn't happen. Everything here is either (a) live data passed in,
// (b) verified official contact info passed in, or (c) a question that
// moves the conversation forward.

const GREETING = /^(hi+|hello+|hey+|yo|hola|namaste|namaskar|namaskaram|good\s+(morning|afternoon|evening)|salaam|salam|hii+|helo+)\b/i;
const THANKS = /\b(thanks?|thank you|thx|shukriya|dhanyawad|dhanyavad)\b/i;
const BYE = /^(bye+|goodbye|see you|good night|gn|ok bye)\b/i;
const WHO = /\b(who are you|what are you|what can you do|what do you do|your name|tum kaun|aap kaun|kaun ho|kya kar sakte)\b/i;
const COMPLAINT = /\b(complain|complaint|shikayat|grievance|authority contacts?|complaint portal|helpline|nmmc|bmc|mcgm|municipal|pollution board|mpcb)\b/i;

function cityLabel(location) {
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

function liveSummary(aqi, weather, city) {
  const parts = [];
  if (weather) parts.push(`🌤️ ${weather.temp}°C, ${weather.description}, humidity ${weather.humidity}%`);
  if (aqi) parts.push(`🌬️ AQI ${aqi.aqi} (PM2.5 ${aqi.pm25 ?? '—'} µg/m³)`);
  if (!parts.length) return '';
  return `Right now in **${city}**:\n${parts.join('\n')}`;
}

/**
 * @returns {{text: string, cards: Array, actions: Array, status: string}}
 */
export function buildFallbackReply({
  message = '',
  location,
  recipient = null,
  aqi = null,
  weather = null,
  isComplaintContext = false,
} = {}) {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  const city = cityLabel(location);
  const contacts = contactLines(recipient);
  const live = liveSummary(aqi, weather, city);

  // 1. Greeting / small talk
  if (GREETING.test(text) && text.split(/\s+/).length <= 5) {
    return {
      text: 'Hi! How’s your day going?',
      cards: [], actions: [],
      status: 'success',
    };
  }

  if (/\b(?:i\s*need|ineed|need|can you|could you|pls|please).{0,20}\bhelp\b/i.test(lower) || /^(?:help|help me)$/i.test(lower)) {
    return {
      text: `Of course—I'm here. Tell me what you need help with in your own words; it doesn't have to be perfectly typed.`,
      cards: [],
      actions: [],
      status: 'success',
    };
  }

  // 2. Who are you / capabilities
  if (WHO.test(lower)) {
    return {
      text: `I'm **EcoPulse AI**, your environmental assistant for **${city}**. 🌱\n\nI can:\n• Check live **air quality** and **weather** for any city\n• Tell you the **right authority, email, portal and helpline** for a complaint\n• **Draft a complaint email** from your own words\n• Analyse a **photo** of the problem and guide the report\n• Find eco-events and give AQI-based health tips\n\nWhat would you like to do?`,
      cards: [],
      actions: [
        { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'primary' },
        { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
      ],
      status: 'success',
    };
  }

  // 3. Thanks / bye
  if (THANKS.test(lower) && text.split(/\s+/).length <= 6) {
    return {
      text: 'Anytime! 🌿 If you spot a problem later, send me a photo or the location and I\'ll point you to the right authority.',
      cards: [], actions: [], status: 'success',
    };
  }
  if (BYE.test(lower)) {
    return { text: 'Take care! 🌱 Come back anytime you need help with your area.', cards: [], actions: [], status: 'success' };
  }

  // 4. Complaint / contact question — give the verified route
  if (COMPLAINT.test(lower) || isComplaintContext) {
    const contactBlock = contacts.length
      ? contacts.join('\n')
      : 'Which city and country is the issue in? I don’t have a verified local contact yet.';

    return {
      text: `${contactBlock}\n\nFor a written complaint, include the **exact location, date and time**, attach any evidence, and keep the reference number.`,
      cards: [],
      actions: [
        { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
        { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' },
      ],
      status: 'success',
    };
  }

  // 5. Live data question without a model
  if (live && /\b(aqi|air|weather|temperature|pollution|mausam|garmi|humid)\b/i.test(lower)) {
    return {
      text: `${live}\n\nBased on this: ${aqi && aqi.aqi > 150
        ? 'avoid outdoor exercise, keep windows closed at peak traffic hours and wear an N95 if you must go out.'
        : aqi && aqi.aqi > 100
          ? 'sensitive people (children, elderly, asthma) should limit long outdoor exposure.'
          : 'it\'s fine for normal outdoor activity.'}`,
      cards: [],
      actions: [{ label: '💊 Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' }],
      status: 'success',
    };
  }

  // 6. Practical environmental knowledge that does not require live data or a
  // model. These are intentionally general, safe actions—not invented local facts.
  if (/\b(electricity|energy|power bill|bijli|geyser|air conditioner|\bac\b)\b/i.test(lower)) {
    return {
      text: `⚡ **Practical ways to cut home electricity use:**\n\n• Set the AC around **24–26°C**, clean its filter, and keep doors/windows shut while it runs.\n• Use a timer for the **geyser** and switch it off after heating.\n• Replace frequently used bulbs with **LEDs**.\n• Turn off lights, chargers, TVs and set-top boxes at the socket when not needed.\n• Run washing machines only with a useful load and use fans before AC when comfortable.\n\nStart by checking which appliance runs longest—that usually gives the easiest saving.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(save water|water saving|conserve water|paani bach|water waste|leaking tap)\b/i.test(lower)) {
    return {
      text: `💧 **Simple water-saving steps:**\n\n• Repair dripping taps and running toilet cisterns first.\n• Use a bucket or shut the tap while brushing/soaping instead of letting water run.\n• Run laundry only with a useful load.\n• Reuse safe grey water (for example, vegetable-rinse water) for plants or cleaning—never water containing harsh chemicals.\n• Water plants early morning/evening and mulch the soil to slow evaporation.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(compost|composting|kitchen scraps?|food scraps?)\b/i.test(lower)) {
    return {
      text: `🌱 **Easy home composting:**\n\n1. Add fruit/vegetable scraps, tea leaves and crushed eggshells.\n2. Cover each wet layer with dry leaves, shredded cardboard or cocopeat.\n3. Keep it damp like a squeezed sponge—not soggy—and mix it every few days.\n4. Avoid meat, dairy, oily food and pet waste in a basic home bin.\n5. A bad smell usually means too much moisture: add dry material and aerate.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(e-?waste|electronic waste|old phone|old laptop|battery disposal)\b/i.test(lower)) {
    return {
      text: `🔋 **Handle e-waste safely:**\n\n• Back up and erase personal data; remove SIM/memory cards.\n• Keep batteries separate—never burn them or put swollen batteries in household waste.\n• Use an **authorised producer take-back point, municipal e-waste centre, or registered recycler**.\n• Ask for a receipt for valuable devices or bulk disposal.\n\nTell me your city and I’ll look for a verified municipal route without guessing a recycler.`,
      cards: [], actions: [{ label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' }], status: 'success',
    };
  }

  if (/\b(climate change|global warming|carbon footprint|co2|greenhouse)\b/i.test(lower)) {
    return {
      text: `🌍 **For a lower everyday footprint, focus on the big repeat choices:**\n\n• Walk, cycle, use public transport or carpool when practical.\n• Reduce unnecessary AC use and choose efficient appliances.\n• Eat food you buy—preventing waste matters more than perfect packaging.\n• Repair/reuse items and avoid frequent low-quality replacements.\n• Support local tree and habitat protection, but don’t treat planting as a substitute for reducing emissions.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(indoor air|ventilation|mould|mold|cooking smoke|room pollution)\b/i.test(lower)) {
    return {
      text: `🏠 **For healthier indoor air:**\n\n• Vent cooking fumes outdoors with an exhaust fan/window.\n• Never burn waste, incense in excess, or charcoal in an unventilated room.\n• Fix dampness and visible mould at the moisture source; don’t just paint over it.\n• Vacuum/wet-dust regularly and keep smoking outdoors.\n• During a severe outdoor pollution episode, keep windows shut at peak hours and use a genuine HEPA purifier if available.`,
      cards: [], actions: [], status: 'success',
    };
  }

  // 7. Anything else — be honest and move the conversation forward
  const asksAboutEnvironment = /\b(environment|climate|waste|plastic|tree|water|pollution|garbage|kachra|recycle|compost|energy|eco|green|bird|animal|forest|river|beach)\b/i.test(lower);

  return {
    text: asksAboutEnvironment
      ? `I want to help with that properly, but I can't reach the AI service at this moment — so I won't guess. 🌱\n\nTell me the **city/area** and **what's happening**, and I'll give you the verified authority, helpline and portal, and draft the complaint for you.`
      : `I'm having trouble reaching the AI service right now, so I'd rather not guess. I can still help with live **air quality/weather for ${city}**, the **correct authority and contacts** for an environmental complaint, or **filing a report** with a photo.\n\nWhat would you like to do?`,
    cards: [],
    actions: [
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'primary' },
      { label: '📋 Report an Issue', action: 'QUICK_REPORT', variant: 'secondary' },
    ],
    status: 'success',
  };
}

/** Factual complaint draft from provided details; the user reviews it before sending. */
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
