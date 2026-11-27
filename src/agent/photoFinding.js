import { emailPreviewData } from './civicReportDetails.js';
import { tools } from '../services/agentTools';
import { buildComplaintEmailTemplate, contactLines } from './fallbackBrain.js';
import { ISSUE_LABELS } from './civicIssues.js';

export async function photoFinding({ result, userMessage, city, photoLocation, imageData }) {
  const recipientCategory = result.category === 'plastic'
    ? 'garbage'
    : (result.category === 'burning' || result.category === 'industrial' ? 'air' : result.category);
  const recipient = await tools.findVerifiedRecipient({ issueCategory: recipientCategory, city });
  const contacts = contactLines(recipient).join('\n');
  const urgentNumber = recipient.helpline || (result.category === 'trees' ? recipient.forestHelpline : null);
  const isUrgent = result.severity === 'severe' || result.category === 'burning';

  // Turn the visual finding into a usable draft immediately. The wording says
  // "appears to show" and asks the user to verify it, so an on-device classifier
  // is never presented as infallible evidence.
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

  const imageSituation = [
    result.description,
    result.visibleText?.length
      ? `Text visible in the photograph (OCR — verify against the original before sending): ${result.visibleText.join(' | ')}`
      : null,
    userMessage?.trim() ? `User's note: ${userMessage.trim()}` : null,
  ].filter(Boolean).join('\n');
  const emailTemplate = buildComplaintEmailTemplate({
    situation: imageSituation,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[result.category] || result.issue,
    hasPhoto: true,
  });

  const severityLabel = { mild: '🟡 Mild', moderate: '🟠 Moderate', severe: '🔴 Severe' }[result.severity] || '🟠 Moderate';
  const nextSteps = (result.actions || []).slice(0, 3).map((a) => `• ${a}`).join('\n');

  const text = [
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

  return {
    text,
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
          cc: draftCc, ccLabel: draftCcLabel,
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
