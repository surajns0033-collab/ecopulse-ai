import { cityLabel, contactLines } from './fallbackContacts.js';
import { casualReply } from './fallbackSmallTalk.js';
import { environmentalAdvice } from './fallbackAdvice.js';

export { contactLines, buildComplaintEmailTemplate } from './fallbackContacts.js';

const COMPLAINT = /\b(complain|complaint|shikayat|grievance|authority contacts?|complaint portal|helpline|nmmc|bmc|mcgm|municipal|pollution board|mpcb)\b/i;

export function buildFallbackReply({
  message = '',
  location,
  recipient = null,
  isComplaintContext = false,
} = {}) {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  const city = cityLabel(location);

  const casual = casualReply(text, lower, city);
  if (casual) return casual;

  if (COMPLAINT.test(lower) || isComplaintContext) {
    const contacts = contactLines(recipient);
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

  const advice = environmentalAdvice(lower);
  if (advice) return advice;

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
