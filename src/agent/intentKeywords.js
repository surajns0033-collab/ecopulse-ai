import { INTENTS, INTENT_PATTERNS } from './intentPatterns.js';

// Delimit complete words so "chair" cannot match "air", or "street" match "tree".
export function keywordText(text) {
  return ' ' + text.replace(/[^\p{L}\p{M}\p{N}.-]+/gu, ' ').replace(/[.](?!\d)/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

export function keywordIntent(text) {
  let best = { intent: INTENTS.ASK_QUESTION, confidence: 0.5 };
  for (const pattern of INTENT_PATTERNS) {
    const matches = pattern.keywords.filter(keyword => text.includes(' ' + keyword + ' '));
    if (!matches.length) continue;
    const confidence = pattern.confidence * Math.min(1, 0.6 + matches.length * 0.2);
    if (confidence > best.confidence) best = { intent: pattern.intent, confidence, matchedKeywords: matches };
  }
  return best;
}

export function extractEntities(message) {
  const entities = {};

  // Category
  const categories = {
    cleanup: ['cleanup', 'clean up', 'cleaning'],
    plantation: ['plantation', 'tree', 'trees', 'plant'],
    waste_reduction: ['waste', 'plastic', 'reduce'],
    biodiversity: ['biodiversity', 'nature', 'mangrove', 'wildlife'],
    awareness: ['awareness', 'education', 'learn'],
  };
  for (const [cat, kws] of Object.entries(categories)) {
    if (kws.some((kw) => message.includes(' ' + kw + ' '))) {
      entities.category = cat;
      break;
    }
  }

  // Locations mentioned
  const locations = ['vashi', 'kharghar', 'belapur', 'panvel', 'ulwe', 'airoli', 'nerul', 'seawoods', 'navi mumbai', 'mumbai'];
  for (const loc of locations) {
    if (message.includes(' ' + loc + ' ')) {
      entities.location = loc;
      break;
    }
  }

  return entities;
}
