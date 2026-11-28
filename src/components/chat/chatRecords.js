import { attendanceMessage, meetupErrorMessage } from '../../services/meetupMessages';

function confirmation(title, message, id, actions = []) {
  return { cards: [{ type: 'confirmation', data: { title, message, id } }], actions };
}

async function publishMeetup(user, data) {
  const { createMeetup } = await import('../../services/meetups');
  const { title, description, category, location, date, time, capacity, lat, lng } = data;
  const result = await createMeetup({ userId: user.uid, organizer: user.displayName || 'Guest Organizer',
    title, description, category, location, date, time, capacity, lat, lng });
  return confirmation(result.localOnly ? 'Meetup saved on this device' : 'Meetup published',
    `"${title}" at ${location} is on your Events page.`, result.eventId,
    [{ label: '🗓️ View Events', action: 'GOTO_MEETUPS', variant: 'primary' }]);
}

async function updateAttendance(user, event, join) {
  const { joinMeetup, cancelMeetupRSVP } = await import('../../services/meetups');
  const save = join ? joinMeetup : cancelMeetupRSVP;
  const result = await save({ userId: user.uid, meetupDocId: event.id, meetupId: event.eventId });
  return attendanceReply(event, attendanceMessage(result));
}

function attendanceReply(event, message) {
  return { text: `**${event.title}** — ${message}`, actions: [{ label: 'View events', action: 'GOTO_MEETUPS', variant: 'secondary' }] };
}

async function submitReport(user, data) {
  const { tools } = await import('../../services/agentTools');
  const { title, description, category, location, lat, lng } = data;
  const result = await tools.createEnvironmentalReport({ userId: user.uid, title, description, category, location, lat, lng });
  return confirmation(result.localOnly ? 'Report saved on this device' : 'Report submitted',
    'Your report is ready to review. You can also draft an email to the relevant authority.', result.reportId, [
      { label: 'View my report', action: 'VIEW_REPORT', variant: 'primary', data: { id: result.docId } },
      { label: '📧 Draft Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
      { label: '🏠 Done', action: 'CANCEL', variant: 'secondary' },
    ]);
}

async function saveEmailDraft(user, data) {
  const { tools } = await import('../../services/agentTools');
  const result = await tools.createEmailDraft({ userId: user.uid, reportId: data.reportId || null,
    issue: data.subject, location: data.location || null, recipientType: 'municipal',
    recipientEmail: data.to, subject: data.subject, body: data.body });
  return confirmation('Email Draft Saved! 📧', 'Draft saved to your account. Nothing was sent.', result.draftId);
}

export const RECORD_ACTIONS = {
  PUBLISH_MEETUP: { status: 'Publishing meetup...', save: publishMeetup },
  JOIN_MEETUP: { status: 'Joining meetup...', save: (user, event) => updateAttendance(user, event, true) },
  CANCEL_MEETUP: { status: 'Updating attendance...', save: (user, event) => updateAttendance(user, event, false) },
  SUBMIT_REPORT: { status: 'Submitting report...', save: submitReport },
  SAVE_EMAIL_DRAFT: { status: 'Saving email draft...', save: saveEmailDraft },
};

export function recordError(action, error, user, data) {
  if (action === 'PUBLISH_MEETUP') return { text: user.isAnonymous ? 'Sign in with Google or email to publish a meetup.' : meetupErrorMessage(error) };
  if (action === 'SAVE_EMAIL_DRAFT') return { text: 'Could not save the email draft. Please try again.' };
  if (action === 'SUBMIT_REPORT') return { text: 'Report could not be submitted right now. Please try again.' };
  return attendanceReply(data, meetupErrorMessage(error));
}
