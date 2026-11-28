import { rankPhotoCategories } from './photoCategories.js';

function contextCategory(text) {
  const lower = (text || '').toLowerCase();
  if ((/parking|parked|vehicle/.test(lower)) && (/block|obstruct|road|footpath/.test(lower))) return 'road_obstruction';
  if (/landfill|land filling|excavation material|soil dumping|rubble dumping|land reclamation/.test(lower)) return 'greenspace';
  if (/polluted (?:naala|nala|drain)/.test(lower)) return 'water';
  if (/burn|smoke|fire|jalana/.test(lower)) return 'burning';
  if (/sewage|drain|overflow|nali/.test(lower)) return 'sewage';
  if (/tree|mangrove|cutting|felling/.test(lower)) return 'trees';
  if (/construction|dust|debris/.test(lower)) return 'construction';
  if (/river|lake|water|paani|foam/.test(lower)) return 'water';
  if (/plastic/.test(lower)) return 'plastic';
  if (/factory|industrial|chimney|emission/.test(lower)) return 'industrial';
  if (/garbage|waste|trash|dump|kachra/.test(lower)) return 'garbage';
  return null;
}

function candidates(contextHint, promptResults) {
  const hintedCategory = contextCategory(contextHint);
  const ranked = rankPhotoCategories(promptResults, hintedCategory);
  const categoryScores = new Map(ranked.map(item => [item.entry.category, item.score]));
  const scoreFor = category => categoryScores.get(category) ?? 0;

  let best = ranked[0];
  let second = ranked[1];

  // Soil/rubble dumping is visually split by CLIP across construction,
  // industrial waste and land-filling labels. Combine that evidence only
  // when the dedicated land-filling label itself is also meaningfully present.
  const landFillingCandidate = ranked.find((item) => item.entry.category === 'greenspace');
  const landFillingCluster = scoreFor('greenspace') + scoreFor('construction') + scoreFor('industrial');
  const hasCombinedLandFillingEvidence = landFillingCandidate &&
    landFillingCandidate.score >= 0.14 && landFillingCluster >= 0.65;
  if (hasCombinedLandFillingEvidence && ['construction', 'industrial'].includes(best?.entry.category)) {
    second = best;
    best = landFillingCandidate;
  }

  const margin = (best?.adjustedScore || 0) - (second?.adjustedScore || 0);
  return { best, margin, ranked, scoreFor, hintedCategory, hasCombinedLandFillingEvidence };
}

function uncertain(reason, ocr, score, provider = 'On-device CLIP') {
  return { uncertain: true, reason, provider, confidence: score, visibleText: ocr.lines, ocrConfidence: ocr.confidence / 100 };
}

function ambiguous(best, margin, scoreFor, combinedLand) {
  const combinedSmoke = ['burning', 'air'].includes(best.entry.category) && scoreFor('burning') + scoreFor('air') >= 0.36;
  return !combinedSmoke && !combinedLand && (best.score < 0.30 || (best.score < 0.40 && margin < 0.04));
}

export function assessScene(contextHint, promptResults, ocr, explicitlyAskedForOcr) {
  const { best, margin, ranked, scoreFor, hintedCategory, hasCombinedLandFillingEvidence } = candidates(contextHint, promptResults);
  if (explicitlyAskedForOcr && ocr.lines.length >= 3 && !hintedCategory) {
    return uncertain('text-dominant-image', ocr, ocr.confidence / 100, 'On-device CLIP + OCR');
  }
  if (!best || ['none', 'unclear'].includes(best.entry.category)) {
    return uncertain('no-clear-environmental-issue', ocr, best?.score || 0);
  }
  if (ambiguous(best, margin, scoreFor, hasCombinedLandFillingEvidence)) return uncertain('ambiguous-image', ocr, best.score);
  return {
    issue: best.entry.issue,
    severity: null, // Scene categories alone cannot establish severity.
    category: best.entry.category,
    description: best.entry.description,
    actions: best.entry.actions,
    provider: 'On-device CLIP',
    needsUserVerification: true,
    matchedPrompt: best.matchedPrompt,
    visibleText: ocr.lines,
    ocrConfidence: ocr.confidence / 100,
    alternatives: ranked.slice(1, 3).map((item) => ({
      category: item.entry.category,
      score: Number(item.score || 0),
    })),
  };
}
