import { keywordText, keywordIntent, extractEntities } from './intentKeywords.js';
import { INTENTS, INTENT_PATTERNS } from './intentPatterns.js';

import { smogRequestKind } from './smogRequests.js';
import { localizedIntent } from './localizedIntents.js';
import { recognitionText } from './chatLanguage.js';

export { INTENTS } from './intentPatterns.js';

export { asksForSmogPlan } from './smogRequests.js';

const INTENT_DETAILS = new Map(INTENT_PATTERNS.map(pattern => [pattern.intent, pattern]));

const civicTopic = /\b(complaint|municipal|authority|pollution|garbage|dumping|burning|sewage|naala|nala|tree cutting|forest|traffic police|road obstruction|mpcb|nmmc|bmc|bbmp|mcd)\b/i;
const incident = /\b(garbage|kachra|waste|dumping|dump|landfill|excavation|rubble|soil|debris|burning|buring|smoke|sewage|nali|naala|nala|drain|overflow|tree|cutting|felling|plastic|litter|dust|construction|pollution|parking|parked|vehicle|obstruction|blocked|footpath|leak|chemical|stink|smell)\b/i;
const incidentContext = /\b(my|our|near|nearby|outside|behind|in front|beside|society|building|street|road|area|locality|colony|vashi|kharghar|belapur|panvel|ulwe|airoli|nerul|saw|seen|noticed|happening|since|stink|smell|complain|complaint|report|shikayat|kisko|kahan|where|whom)\b/i;

function asksForContacts(text) {
  return (/\b(national|central|state|local)\b/.test(text) && /\b(contact|contacts|helpline|email|phone|portal|authorit)/.test(text))
    || /\b(contact details?|contact numbers?|helpline numbers?|list of (authorities|contacts)|authority contacts?|all contacts?)\b/.test(text);
}

function asksForDraft(text) {
  const writing = /\b(draft|write|compose|create|send|bhejo|provide|give|generate|prepare|make)\b/.test(text);
  return (writing && /\b(email|mail|complaint)\b/.test(text))
    || (/\b(cc|forest)\b/.test(text) && /\b(email|mail)\b/.test(text))
    || /^(email|mail|draft|draft email|provide email|give email|send email)$/.test(text)
    || text.startsWith('draft ');
}

function isGeneralTopic(text, civicContext) {
  if (/\b(health|sleep|diet|exercise|stress|sehat|healthy)\b/.test(text)
      && !/\b(aqi|air quality|pollution|smog|pm2\.5|pm10|smoke exposure)\b/.test(text)) return true;
  if (/\b(route|travel|trip)\b/.test(text) && !/\b(traffic|commute|pollution|green route|low-traffic|low pollution)\b/.test(text)) return true;
  if (/\b(event|events)\b/.test(text) && !/\b(eco|environment|cleanup|clean-up|plantation|community)\b/.test(text)) return true;
  if (/\b(email|mail|letter|message|application|resume|cover letter)\b/.test(text) && !civicContext) return true;
  return /\b(plan my day|daily schedule|study plan|work plan|interview plan|trip plan|plan today|air india|air fryer|air conditioner|air conditioning)\b/.test(text);
}

function asksHowTo(text) {
  const emailFeedback = /\b(not enough|not engough|insufficient|more|other|what|which|who|whom|tell|is there|any other)\b/.test(text) && /\b(email|mail)\b/.test(text);
  const question = emailFeedback || /\b(how|where|steps|step|process|procedure|which|who|whom|what|why|kaise|kahan|kisko|kya)\b/.test(text) || /https?:\/\//.test(text);
  return question && !/\b(aqi|air quality|weather|temperature|meetup|meetups|event|events|route|routes|health tips|waste reduction)\b/.test(text);
}

function asksAboutEventCreation(text) {
  return /\b(create|organi[sz]e|host|start|plan|make|setup|set up)\b/.test(text) && /\b(meetup|meet-up|event|drive|cleanup|clean-up|plantation)\b/.test(text);
}

function describesLocalIncident(text) {
  return incident.test(text) && incidentContext.test(text) && text.split(/\s+/).length >= 3;
}

function witnessedIncident(text) {
  return /\b(saw|seen|sighted|noticed|happening|going on|someone is)\b/.test(text)
    && /\b(garbage|waste|dumping|smoke|industrial|burning|buring|sewage|drain|tree|cutting|pollution|leak|chemical)\b/.test(text);
}

// Explicit requests take precedence over keyword matches. The order also keeps
// a local incident separate from general questions about the same subject.
function explicitIntent(text, history) {
  const plan = smogRequestKind(text);
  if (plan === 'policy') return { intent: INTENTS.ASK_QUESTION, useSearch: true, confidence: 0.99 };
  if (plan === 'household') return { intent: INTENTS.GET_SMOG_PLAN, confidence: 0.99 };
  if (asksAboutEventCreation(text)) return { intent: INTENTS.CREATE_EVENT, confidence: 0.98 };
  if (asksForContacts(text)) return { intent: INTENTS.GET_AUTHORITY_CONTACTS, confidence: 0.97 };
  if (/\b(search (?:the )?web|google (?:this|it|for)|look (?:this )?up|latest (?:news|update|information)|recent news|today'?s news|current (?:law|rules?|policy|deadline|official update))\b/.test(text)) {
    return { intent: INTENTS.ASK_QUESTION, confidence: 0.99 };
  }

  const localized = localizedIntent(text);
  if (localized) return { intent: localized, confidence: 0.97 };
  const recent = (history || []).slice(-5).map(item => item.text || '').join(' ');
  const civicContext = civicTopic.test(text) || civicTopic.test(recognitionText(recent));
  if (civicContext && asksForDraft(text)) return { intent: INTENTS.CREATE_EMAIL, confidence: 0.97 };
  if (isGeneralTopic(text, civicContext)) return { intent: INTENTS.ASK_QUESTION, confidence: 0.98 };
  if (describesLocalIncident(text)) return { intent: INTENTS.CREATE_REPORT, confidence: 0.95 };
  if (asksHowTo(text)) return { intent: INTENTS.ASK_QUESTION, confidence: 0.96 };
  if (witnessedIncident(text)) return { intent: INTENTS.CREATE_REPORT, confidence: 0.96 };
  return null;
}

export function detectIntent(message, conversationHistory = []) {
  const original = message.toLowerCase().trim();
  const text = recognitionText(original);
  const match = explicitIntent(text, conversationHistory) ?? keywordIntent(keywordText(text));
  const details = INTENT_DETAILS.get(match.intent);
  return {
    ...match,
    suggestedTool: details?.tool ?? null,
    requiresConfirmation: details?.requiresConfirmation ?? false,
    entities: extractEntities(keywordText(text)),
    message: original,
  };
}
