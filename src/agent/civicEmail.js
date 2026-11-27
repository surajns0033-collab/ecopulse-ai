import { tools } from '../services/agentTools';
import { buildComplaintEmailTemplate } from './fallbackBrain.js';
import { AWAITING_DRAFT_DETAILS, incidentCity } from './chatPlaces.js';
import { describesIssue, detectIssueCategory, mentionsForest, ISSUE_LABELS, observationText } from './civicIssues.js';

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
