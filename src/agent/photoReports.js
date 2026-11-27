import { tools } from '../services/agentTools';
import { buildComplaintEmailTemplate, contactLines } from './fallbackBrain.js';
import { detectIssueCategory, hasConcreteIssue, ISSUE_LABELS } from './civicIssues.js';
import { resolveCity } from './placeContext.js';
import { logAction } from './activityLog';

function photoIssueActions(location) {
  return [
    ['🗑️ Garbage dumping', 'garbage'],
    ['🔥 Open burning', 'burning'],
    ['💧 Sewage overflow', 'sewage'],
    ['🌳 Tree cutting', 'trees'],
  ].map(([label, category], index) => ({
    label, action: 'PHOTO_ISSUE', variant: index === 0 ? 'primary' : 'secondary',
    data: { issue: ISSUE_LABELS[category], photoLocation: location ?? null },
  }));
}

export async function handleImageAnalysis(imageData, userMessage, userId, location) {
  const city = resolveCity(location?.city);
  const photoLocation = location ?? null;
  const result = await tools.analyzeEnvironmentalImage({
    base64: imageData.base64,
    mimeType: imageData.mimeType,
    contextHint: userMessage || '',
  });

  logAction(userId, 'image_analyzed', { hasResult: !!result, city });

  // The on-device model ran successfully but found no complaint category with
  // enough certainty. Keep the photo flow useful without claiming it failed.
  if (result?.uncertain) {
    const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
    const ocrText = result.visibleText?.length
      ? `\n\n📝 **Text I could read (OCR — verify against the photo):** ${result.visibleText.map((line) => `“${line}”`).join(' · ')}`
      : '';
    return {
      text: `I checked the photo, but I **couldn't identify a specific environmental problem confidently**. 🔍${ocrText}\n\nChoose what you can confirm in the photo below to start a complaint draft.\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: photoIssueActions(location),
      status: 'info',
    };
  }

  // Vision unavailable — never pretend to see the photo.
  // Use details from the note if present; otherwise let the user pick the issue.
  if (!result) {
    const note = (userMessage || '').trim();
    const userDescribed = note.length > 3 && hasConcreteIssue(note);

    if (userDescribed) {
      const category = detectIssueCategory(note);
      const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
      const isTree = /tree|mangrove|forest|cutting|felling/i.test(note);
      const cc = isTree && recipient.forestEmail ? recipient.forestEmail : null;
      const ccLabel = cc ? 'State Forest Department' : null;
      const template = buildComplaintEmailTemplate({
        situation: note,
        recipient,
        city,
        issueLabel: ISSUE_LABELS[category] || ISSUE_LABELS.other,
        hasPhoto: true,
      });

      return {
        text: `I couldn't analyze the photo automatically. I prepared a draft from your description instead. Review it and verify the recipient before sending.\n\n${contactLines(recipient).join('\n')}`,
        cards: [{
          type: 'email-preview',
          data: {
            to: recipient.email,
            recipientName: recipient.name,
            organization: recipient.organization,
            location: city,
            cc,
            ccLabel,
            portalUrl: recipient.portalUrl,
            sourceUrl: recipient.sourceUrl,
            helpline: recipient.helpline,
            subject: template.subject,
            body: template.body,
            disclaimer: recipient.disclaimer,
          },
        }],
        actions: [{
          label: '📋 Also file a report',
          action: 'FILE_REPORT_FROM_ANALYSIS',
          variant: 'secondary',
          data: { situation: note, category, photoLocation },
        }],
        status: 'preview',
      };
    }

    const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
    return {
      text: `I can't analyze the photo automatically right now, and I won't guess what's in it. 🔍\n\nChoose what you can confirm in the photo below to start a complaint draft.\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: photoIssueActions(location),
      status: 'info',
    };
  }

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
        data: {
          to: recipient.email,
          recipientName: recipient.name,
          organization: recipient.organization,
          location: city,
          cc: draftCc,
          ccLabel: draftCcLabel,
          portalUrl: recipient.portalUrl,
          sourceUrl: recipient.sourceUrl,
          helpline: recipient.helpline,
          subject: emailTemplate.subject,
          body: emailTemplate.body,
          disclaimer: `${recipient.disclaimer} Automated photo classification — verify the description before sending.`,
        },
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
