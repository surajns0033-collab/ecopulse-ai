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

export function assessScene(contextHint, promptResults, ocr, explicitlyAskedForOcr) {
  const { best, margin, ranked, scoreFor, hintedCategory, hasCombinedLandFillingEvidence } = candidates(contextHint, promptResults);
  // A page/sign containing several confidently read lines is primarily a text
  // image. Unless the user also named an environmental issue, do not force it
  // into one of the visual complaint categories.
  if (explicitlyAskedForOcr && ocr.lines.length >= 3 && !hintedCategory) {
    return {
      uncertain: true,
      reason: 'text-dominant-image',
      provider: 'On-device CLIP + OCR',
      confidence: ocr.confidence ? ocr.confidence / 100 : 0,
      visibleText: ocr.lines,
      ocrConfidence: ocr.confidence ? ocr.confidence / 100 : 0,
    };
  }
  if (!best || best.entry.category === 'none' || best.entry.category === 'unclear') {
    return {
      uncertain: true,
      reason: 'no-clear-environmental-issue',
      provider: 'On-device CLIP',
      confidence: Number(best?.score || 0),
      visibleText: ocr.lines,
      ocrConfidence: ocr.confidence ? ocr.confidence / 100 : 0,
    };
  }

  // CLIP probabilities are relative to the supplied labels. Require both a
  // meaningful score and separation from the runner-up before making a claim.
  const hasCombinedSmokeEvidence = ['burning', 'air'].includes(best.entry.category) &&
    (scoreFor('burning') + scoreFor('air') >= 0.36);
  if (!hasCombinedSmokeEvidence && !hasCombinedLandFillingEvidence && (best.score < 0.30 || (best.score < 0.40 && margin < 0.04))) {
    return {
      uncertain: true,
      reason: 'ambiguous-image',
      provider: 'On-device CLIP',
      confidence: Number(best.score || 0),
      visibleText: ocr.lines,
      ocrConfidence: ocr.confidence ? ocr.confidence / 100 : 0,
    };
  }

  const severity = best.entry.category === 'burning' || best.entry.category === 'air'
    ? 'severe'
    : 'moderate';

  return {
    issue: best.entry.issue,
    severity,
    category: best.entry.category,
    description: best.entry.description,
    actions: best.entry.actions,
    provider: 'On-device CLIP',
    needsUserVerification: true,
    matchedPrompt: best.matchedPrompt,
    visibleText: ocr.lines,
    ocrConfidence: ocr.confidence ? ocr.confidence / 100 : 0,
    alternatives: ranked.slice(1, 3).map((item) => ({
      category: item.entry.category,
      score: Number(item.score || 0),
    })),
  };
}
