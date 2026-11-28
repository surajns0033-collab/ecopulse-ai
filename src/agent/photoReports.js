import { emailPreviewData } from './civicReportDetails.js';
import { tools } from '../services/agentTools';
import { buildComplaintEmailTemplate, contactLines } from './fallbackBrain.js';
import { detectIssueCategory, hasConcreteIssue, ISSUE_LABELS } from './civicIssues.js';
import { resolveCity } from './placeContext.js';
import { logAction } from './activityLog';
import { photoFinding } from './photoFinding.js';

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

async function askForObservation(result, city, location) {
  const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
  const visible = result?.visibleText?.length
    ? '\n\n📝 **Text read from the photo (please verify):** ' + result.visibleText.join(' · ') : '';
  const explanation = result ? "I checked the photo, but I **couldn't identify a specific environmental problem confidently**."
    : "I can't analyze the photo automatically right now.";
  return {
    text: explanation + visible + '\n\nChoose what you can confirm in the photo to start a complaint draft.\n\n' + contactLines(recipient).join('\n'),
    cards: [], actions: photoIssueActions(location), status: 'info',
  };
}

async function draftFromNote(note, city, photoLocation) {
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
      data: emailPreviewData(recipient, city, template, { cc, ccLabel }),
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

export async function handleImageAnalysis(imageData, userMessage, userId, location, signal) {
  const city = resolveCity(location?.city);
  const photoLocation = location ?? null;
  const result = await tools.analyzeEnvironmentalImage({
    base64: imageData.base64,
    mimeType: imageData.mimeType,
    contextHint: userMessage || '', signal,
  });

  signal?.throwIfAborted();
  logAction(userId, 'image_analyzed', { hasResult: !!result, city });

  if (result?.uncertain) return askForObservation(result, city, location);
  if (result) return photoFinding({ result, userMessage, city, photoLocation, imageData });
  const note = (userMessage || '').trim();
  if (note.length > 3 && hasConcreteIssue(note)) return draftFromNote(note, city, photoLocation);
  return askForObservation(null, city, location);
}
