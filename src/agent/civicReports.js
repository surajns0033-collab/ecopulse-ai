import { tools } from '../services/agentTools';
import { getJsonResponse } from '../services/geminiService';
import { buildComplaintEmailTemplate } from './fallbackBrain.js';
import { AWAITING_DRAFT_DETAILS, incidentCity } from './chatPlaces.js';
import { resolveCity } from './placeContext.js';
import { classifyReport, describesIssue, detectIssueCategory, mentionsForest, ISSUE_LABELS, observationText } from './civicIssues.js';

import { reportContacts, reportFields, reportUrgency } from './civicReportDetails.js';
export { handleAuthorityContacts } from './civicContacts.js';

function asksWhereToReport(message) {
  return /\b(where|whom|kisko|kahan|kaha|kaise|how do i|how to)\b/i.test(message) &&
    !/\b(my|our|near|nearby|outside|behind|beside|opposite|society|street|road|happening|since|yesterday|today|saw|seen|noticed|smell|stink|gate)\b/i.test(message);
}

function reportActions(category, preview) {
  return [
    { label: preview ? '📧 Draft Email' : '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: preview ? 'secondary' : 'primary' },
    { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category } },
  ];
}

function reportingInstructions(city, category, recipient, forest) {
  const contacts = reportContacts(recipient, forest, false);
  const urgency = reportUrgency(recipient, forest, false);
  return {
    text: `Here's how to report the issue for **${city}**:\n\n${contacts}\n${recipient.disclaimer}\n\n**To make it count:** write it down with the **exact location, date and time**, attach **photos/video**, and note the **reference number** you get back. ${urgency}\n\nWant me to draft the email? 📧`,
    cards: [], actions: reportActions(category, false), status: 'info',
  };
}

function extractObservation(userMessage, city) {
  return getJsonResponse(
    `Extract a concise report title, a clean factual 1-2 sentence description, and the specific locality from this complaint.
Complaint: "${userMessage}"
Default city: "${city}".
Rules: do not invent names, streets, dates or facts. If the locality is not stated, use the default city.
Respond in JSON: {"title":"...","description":"...","locality":"..."}`,
    '',
    { timeoutMs: 15000 }
  );
}

export async function handleCreateReport(userMessage, userId, location) {
  const city = resolveCity(location?.city) || 'your area';
  const { category, title } = classifyReport(userMessage);
  const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
  const forest = mentionsForest(userMessage);
  if (asksWhereToReport(userMessage)) return reportingInstructions(city, category, recipient, forest);

  const structured = await extractObservation(userMessage, city);
  const fields = reportFields(userMessage, city, title, structured);
  const data = { ...fields, category, userId, lat: location?.lat, lng: location?.lng };
  const contacts = reportContacts(recipient, forest, true);
  const urgency = reportUrgency(recipient, forest, true);
  const photoHint = forest && recipient.forestEmail
    ? '📸 *Got a photo? Attach it — it speeds up inspection. **Draft Email** will also CC the Forest Cell.*'
    : '📸 *Got a photo? Attach it — evidence makes the complaint much harder to ignore.*';
  return {
    text: `Thank you for speaking up for **${fields.location}**! 🙌 Reporting this really makes a difference in our community.\n\n${urgency}\n\n${contacts}\n${recipient.disclaimer}\n\n${photoHint}`,
    cards: [{ type: 'report-preview', data }], actions: reportActions(category, true), status: 'preview',
  };
}

function previousIssue(conversationHistory) {
  const recentUserMessages = (conversationHistory || [])
    .filter((m) => m.role === 'user' && m.text)
    .slice(-4)
    .map((m) => m.text);

  return recentUserMessages.reverse().find(describesIssue);
}

function matchesIncidentCity(message, city) {
  const historyPlace = message && incidentCity(message);
  const parts = (value) => String(value || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const currentCity = parts(city);
  return historyPlace && parts(historyPlace).every(part => currentCity.includes(part));
}

function forestCopy(recipient, situationText, userMessage) {
  let cc = null;
  let ccLabel = null;
  const isTreeOrForestIssue =
    mentionsForest(situationText) || /\b(?:jungle|wood|felling|cutting)\b/i.test(situationText) ||
    mentionsForest(userMessage) || /\bcc\b/i.test(userMessage);

  if (isTreeOrForestIssue && recipient.forestEmail) {
    cc = recipient.forestEmail;
    ccLabel = recipient.forestHelpline ? `State Forest Dept (Helpline: ${recipient.forestHelpline})` : 'State Forest Department';
  }
  return { cc, ccLabel };
}

export async function handleCreateEmail(userMessage, conversationHistory, city, turn) {
  const cityOnly = /^city:\s*[^.!?;\n]+[.!?]?$/i.test(userMessage.trim());
  const currentHasIssue = !cityOnly && (turn?.draftDetails || describesIssue(userMessage));
  const historyIssueMsg = previousIssue(conversationHistory);
  // If user hasn't explained a concrete issue/situation for the current city yet, ask clarifying questions
  if (!currentHasIssue && !matchesIncidentCity(historyIssueMsg, city)) {
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

  const { cc, ccLabel } = forestCopy(recipient, situationText, userMessage);

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
