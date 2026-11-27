export function detectIssueCategory(text) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('polluted naala') || lower.includes('polluted nala') || lower.includes('polluted drain')) return 'water';
  if ((lower.includes('parking') || lower.includes('parked') || lower.includes('vehicle')) && (lower.includes('block') || lower.includes('obstruct') || lower.includes('road') || lower.includes('footpath'))) return 'road_obstruction';
  if (lower.includes('water') || lower.includes('paani')) return 'water';
  if (lower.includes('sewage') || lower.includes('drain') || lower.includes('nali') || lower.includes('naala') || lower.includes('nala')) return 'sewage';
  if (lower.includes('tree')) return 'trees';
  if (lower.includes('landfill') || lower.includes('land filling') || lower.includes('excavation material') || lower.includes('soil dumping')) return 'greenspace';
  if (lower.includes('construction') || lower.includes('dust')) return 'construction';
  if (lower.includes('burning') || lower.includes('burn') || lower.includes('jalana')) return 'burning';
  if (lower.includes('industrial') || lower.includes('factory') || lower.includes('chemical')) return 'industrial';
  if (lower.includes('air') || lower.includes('smoke') || lower.includes('smog')) return 'air';
  if (lower.includes('garbage') || lower.includes('waste') || lower.includes('kachra') || lower.includes('plastic')) return 'garbage';
  return 'default';
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
