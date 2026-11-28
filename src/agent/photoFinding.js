import { emailPreviewData } from './civicReportDetails.js';
import { tools } from '../services/agentTools';
import { buildComplaintEmailTemplate, contactLines } from './fallbackBrain.js';
import { ISSUE_LABELS } from './civicIssues.js';

function copyRecipient(result, userMessage, recipient) {
  let draftCc = null;
  let draftCcLabel = null;
  const greenspaceNeedsForest = result.category === 'greenspace' &&
    /wetland|mangrove|forest/i.test(`${result.matchedPrompt || ''} ${userMessage || ''}`);
  if ((result.category === 'trees' || greenspaceNeedsForest) && recipient.forestEmail) {
    draftCc = recipient.forestEmail;
    draftCcLabel = 'State Forest / Tree Protection Department';
  } else if (['burning', 'industrial', 'air', 'construction', 'greenspace', 'water'].includes(result.category)) {
    draftCc = recipient.stateAuthority?.emails?.[0] || null;
    draftCcLabel = draftCc ? recipient.stateAuthority.name : null;
  }

  return { cc: draftCc, ccLabel: draftCcLabel };
}

function findingEmail(result, userMessage, city, recipient) {
  const imageSituation = [
    result.description,
    result.visibleText?.length
      ? `Text visible in the photograph (OCR — verify against the original before sending): ${result.visibleText.join(' | ')}`
      : null,
    userMessage?.trim() ? `User's note: ${userMessage.trim()}` : null,
  ].filter(Boolean).join('\n');
  return buildComplaintEmailTemplate({
    situation: imageSituation,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[result.category] || result.issue,
    hasPhoto: true,
  });
}

function findingText(result, recipient) {
  const contacts = contactLines(recipient).join('\n');
  const urgentNumber = recipient.helpline || (result.category === 'trees' ? recipient.forestHelpline : null);
  const isUrgent = result.severity === 'severe' || result.category === 'burning';
  const severityLabel = { mild: '🟡 Mild', moderate: '🟠 Moderate', severe: '🔴 Severe' }[result.severity] || 'Severity unconfirmed';
  const nextSteps = (result.actions || []).slice(0, 3).map((a) => `• ${a}`).join('\n');

  return [
    `🔍 **Possible finding:** ${result.issue} — ${severityLabel}`,
    result.description,
    '⚠️ This is an automated assessment. Please verify it against the photo before sending.',
    result.visibleText?.length
      ? `📝 **Text read from the photo (OCR — please verify):** ${result.visibleText.map((line) => `“${line}”`).join(' · ')}`
      : null,
    isUrgent ? (urgentNumber ? `🚨 **Happening right now?** Check the appropriate official helpline: **${urgentNumber}**.`
      : '🚨 If there is immediate danger, follow local emergency guidance. I don’t have a verified local number for this report.') : null,
    nextSteps ? `**What to do next**\n${nextSteps}` : null,
    contacts ? `**Who to send it to**\n${contacts}` : null,
    '📧 **I also prepared a complaint draft below.** Review it against the original photo and confirm the recipient before sending.',
  ].filter(Boolean).join('\n\n');
}

export async function photoFinding({ result, userMessage, city, photoLocation, imageData }) {
  const recipient = await tools.findVerifiedRecipient({ issueCategory: result.category, city });
  const emailTemplate = findingEmail(result, userMessage, city, recipient);
  return {
    text: findingText(result, recipient),
    cards: [
      {
        type: 'image-analysis',
        data: {
          ...result,
          preview: imageData.preview,
          location: city || 'Incident location not verified',
          authority: {
            organization: recipient.organization,
            email: recipient.email,
            helpline: recipient.helpline,
            portalUrl: recipient.portalUrl,
          },
        },
      },
      {
        type: 'email-preview',
        data: emailPreviewData(recipient, city, emailTemplate, {
          ...copyRecipient(result, userMessage, recipient),
          disclaimer: `${recipient.disclaimer} Automated photo classification — verify the description before sending.`,
        }),
      },
    ],
    actions: [
      {
        label: '📋 File Report',
        action: 'FILE_REPORT_FROM_ANALYSIS',
        variant: 'primary',
        data: { situation: result.description, category: result.category, photoLocation },
      },
      { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category: result.category, photoLocation } },
    ],
    status: 'success',
  };
}
