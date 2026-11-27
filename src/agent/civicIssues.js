function isRoadObstruction(text) {
  return /parking|parked|vehicle/i.test(text) && /block|obstruct|road|footpath/i.test(text);
}

// Drafts and the contact directory use the authority's complaint categories.
// For overlapping observations, earlier matches determine the recipient.
const AUTHORITY_CATEGORIES = [
  ['water', /water|paani/i],
  ['sewage', /sewage|drain|nali|naala|nala/i],
  ['trees', /tree/i],
  ['greenspace', /landfill|land filling|excavation material|soil dumping/i],
  ['construction', /construction|dust/i],
  ['burning', /burn|jalana/i],
  ['industrial', /industrial|factory|chemical/i],
  ['air', /air|smoke|smog/i],
  ['garbage', /garbage|waste|kachra|plastic/i],
];

export function detectIssueCategory(text = '') {
  if (/polluted (?:naala|nala|drain)/i.test(text)) return 'water';
  if (isRoadObstruction(text)) return 'road_obstruction';
  return AUTHORITY_CATEGORIES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'default';
}

// Saved reports have their own labels and priority. For example, a report about
// smoke from burning plastic goes to open burning, and keeps that title offline.
const REPORT_CATEGORIES = [
  ['burning', /burning|buring|jalana|smoke/i, 'Open Burning Issue'],
  ['greenspace', /landfill|land filling|excavation material|soil dumping|rubble dumping/i, 'Land Filling / Excavation Material Dumping'],
  ['garbage', /garbage|kachra|dumping/i, 'Illegal Garbage Dumping'],
  ['plastic', /plastic/i, 'Plastic Waste Issue'],
  ['sewage', /sewage|nali|naala|nala|drain/i, 'Sewage / Polluted Drain Issue'],
  ['water', /water/i, 'Water Pollution Issue'],
  ['trees', /tree|mangrove/i, 'Tree / Mangrove Damage Issue'],
  ['construction', /construction|dust/i, 'Construction Dust Issue'],
  ['air', /air|pollution/i, 'Air Pollution Issue'],
];

export function classifyReport(text) {
  if (isRoadObstruction(text)) return { category: 'road_obstruction', title: 'Road / Footpath Obstruction by Parked Vehicle' };
  const match = REPORT_CATEGORIES.find(([, pattern]) => pattern.test(text));
  if (!match) return { category: 'other', title: 'Environmental Issue Report' };
  const [category, , title] = match;
  return { category, title };
}

export const ISSUE_LABELS = {
  garbage: 'Garbage dumping',
  burning: 'Open burning of waste',
  air: 'Air pollution',
  sewage: 'Sewage overflow',
  water: 'Water pollution',
  trees: 'Tree cutting',
  construction: 'Construction material, dust, or debris',
  greenspace: 'Land filling or excavation-material dumping',
  plastic: 'Plastic waste dumping',
  industrial: 'Industrial or scrap-waste dumping',
  road_obstruction: 'Road or footpath obstruction by a parked vehicle',
  other: 'Environmental issue',
  default: 'Environmental issue',
};

const ISSUE_KEYWORDS = [
  'garbage', 'waste', 'kachra', 'dump', 'dumping', 'landfill', 'land filling', 'excavation material', 'soil dumping', 'rubble', 'debris', 'plastic', 'litter',
  'water', 'paani', 'pani', 'sewage', 'drain', 'nali', 'leak', 'overflow',
  'burning', 'buring', 'burn', 'tyre', 'tire', 'fire', 'jalana', 'smoke', 'smog', 'dust', 'construction', 'air pollution',
  'tree', 'cutting', 'industrial', 'chemical', 'noise', 'smell', 'stink', 'parking', 'parked', 'vehicle', 'blocked road', 'obstruction', 'footpath',
];

export function hasConcreteIssue(text) {
  const lower = (text || '').toLowerCase();
  const hasIssueWord = ISSUE_KEYWORDS.some((kw) => lower.includes(kw));
  const wordCount = lower.trim().split(/\s+/).filter(Boolean).length;
  return hasIssueWord && wordCount >= 2;
}

const DRAFT_REQUEST = /^(?:(?:please|(?:can|could|would) you|i (?:want|need) (?:you )?to)\s+)?(?:draft|write|compose|prepare|create|send|generate|make)\b/i;
const OBSERVATION = /\b(?:i|we)\s+(?:saw|noticed|witnessed|observed)\b/i;

export function describesIssue(text) {
  if (!hasConcreteIssue(text)) return false;
  if (/^(?:how|why|what|which|where|who|can i|is there|should i|tell me|show me|check)\b/i.test(text.trim())) return false;
  return !DRAFT_REQUEST.test(text.trim()) || OBSERVATION.test(text);
}

export function observationText(message) {
  const text = message.trim();
  const start = DRAFT_REQUEST.test(text) ? text.search(OBSERVATION) : -1;
  return start < 0 ? text : text.slice(start);
}
