import { emailPreviewData, forestDraftCopy } from './civicReportDetails.js';
import { findVerifiedRecipient } from '../services/verifiedRecipient.js';
import { buildComplaintEmailTemplate } from './fallbackContacts.js';
import { AWAITING_DRAFT_DETAILS, incidentCity } from './chatPlaces.js';
import { describesIssue, detectIssueCategory, ISSUE_LABELS, observationText } from './civicIssues.js';

function previousIssue(history, city) {
  let remainingUserTurns = 4;
  for (let i = history.length - 1; i >= 0 && remainingUserTurns > 0; i--) {
    const { role, text, incident } = history[i];
    // A completed report binds the original observation to the city the user resolved.
    if (role === 'ai' && incident) return incident.city === city ? incident.text : '';
    if (role !== 'user' || !text) continue;
    remainingUserTurns--;
    if (describesIssue(text)) return matchesIncidentCity(text, city) ? text : '';
  }
  return '';
}

function matchesIncidentCity(message, city) {
  const parts = value => String(value || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const [place, ...qualifiers] = parts(incidentCity(message));
  const [current, ...jurisdiction] = parts(city);
  return Boolean(place && place === current && qualifiers.every(part => jurisdiction.includes(part)));
}

export async function handleCreateEmail(userMessage, conversationHistory, city, turn) {
  const cityOnly = /^city:\s*[^.!?;\n]+[.!?]?$/i.test(userMessage.trim());
  const currentHasIssue = !cityOnly && (turn?.draftDetails || describesIssue(userMessage));
  const observation = currentHasIssue ? userMessage : previousIssue(conversationHistory || [], city);
  if (!observation) {
    return {
      text: `I can draft a complaint${city ? ` for **${city}**` : ''}. What happened, where exactly, and when did you notice it? If it happened in a different city, include its name and state or country.`,
      cards: [],
      actions: [],
      status: 'needs_info',
      pending: AWAITING_DRAFT_DETAILS,
      pendingData: { draftIssue: cityOnly ? turn?.draftIssue : detectIssueCategory(userMessage) },
    };
  }

  const situationText = observationText(observation);
  const detectedCategory = detectIssueCategory(situationText);
  const issueCategory = detectedCategory === 'default' ? (turn?.draftIssue || detectedCategory) : detectedCategory;
  const recipient = await findVerifiedRecipient({ issueCategory, city });

  const { cc, ccLabel } = forestDraftCopy(recipient, situationText, userMessage);

  // Keep the observed facts verbatim. Unknown dates and addresses stay as
  // placeholders, and we do not send complaint details to a model to guess them.
  const { subject, body } = buildComplaintEmailTemplate({
    situation: situationText,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[issueCategory],
    hasPhoto: /\b(?:i have|i took|and have|attached|attaching)\b.*\b(?:photo|picture|image)\b/i.test(situationText),
  });

  const draftData = emailPreviewData(recipient, city, { subject, body }, { cc, ccLabel });

  return {
    text: recipient.email
      ? `I drafted this complaint for **${recipient.organization}**. Review the details and fill in any blanks before sending.`
      : 'I drafted the complaint without an email address because I couldn’t verify one. Review the details and use the official portal if listed.',
    cards: [{ type: 'email-preview', data: draftData }],
    actions: [],
    status: 'preview',
  };
}
