import { tools } from '../services/agentTools';
import { getJsonResponse } from '../services/geminiService';
import { resolveCity } from './placeContext.js';
import { classifyReport, describesIssue, mentionsForest } from './civicIssues.js';
import { reportContacts, reportFields, reportUrgency } from './civicReportDetails.js';

export { handleCreateEmail } from './civicEmail.js';

export { handleAuthorityContacts } from './civicContacts.js';

function asksWhereToReport(message) {
  return /\b(where|whom|kisko|kahan|kaha|kaise|how do i|how to)\b/i.test(message) &&
    !/\b(my|our|near|nearby|outside|behind|beside|opposite|society|street|road|happening|since|yesterday|today|saw|seen|noticed|smell|stink|gate)\b/i.test(message);
}

function reportActions(category, preview, incident) {
  return [
    { label: preview ? '📧 Draft Email' : '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL',
      variant: preview ? 'secondary' : 'primary', ...(incident ? { data: { incident } } : {}) },
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
  const resolvedCity = resolveCity(location?.city);
  const city = resolvedCity || 'your area';
  const { category, title } = classifyReport(userMessage);
  const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
  const forest = mentionsForest(userMessage);
  if (asksWhereToReport(userMessage)) return reportingInstructions(city, category, recipient, forest);

  const structured = await extractObservation(userMessage, city);
  const fields = reportFields(userMessage, city, title, structured);
  const data = { ...fields, category, userId, lat: location?.lat, lng: location?.lng };
  const contacts = reportContacts(recipient, forest, true);
  const urgency = reportUrgency(recipient, forest, true);
  const incident = resolvedCity && describesIssue(userMessage) ? { city: resolvedCity, text: userMessage } : null;
  const photoHint = forest && recipient.forestEmail
    ? '📸 *Got a photo? Attach it — it speeds up inspection. **Draft Email** will also CC the Forest Cell.*'
    : '📸 *Got a photo? Attach it — evidence makes the complaint much harder to ignore.*';
  return {
    text: `Thank you for speaking up for **${fields.location}**! 🙌 Reporting this really makes a difference in our community.\n\n${urgency}\n\n${contacts}\n${recipient.disclaimer}\n\n${photoHint}`,
    cards: [{ type: 'report-preview', data }], actions: reportActions(category, true, incident), status: 'preview',
  };
}
