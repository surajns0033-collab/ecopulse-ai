// Private image understanding in the browser.
//
// The model is fetched from Hugging Face on first photo analysis and cached by
// the browser. Model weights are never committed to this repository and the
// user's photo is processed locally (it is not uploaded by this fallback).

import { extractVisibleText } from './imageOcr';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

const LABELS = [
  {
    prompt: 'outdoor garbage dump',
    aliases: ['garbage pile', 'rubbish heap', 'illegal dumping', 'household trash outdoors'],
    category: 'garbage',
    issue: 'Likely garbage dumping',
    description: 'The attached photograph appears to show mixed garbage or household waste dumped outdoors.',
    actions: ['Record the exact location and time.', 'Keep the original photo as evidence.', 'Report it to the local solid-waste department.'],
  },
  {
    prompt: 'open waste burning',
    aliases: ['burning garbage', 'outdoor flames and smoke', 'trash fire', 'leaves burning'],
    category: 'burning',
    issue: 'Likely open waste burning',
    description: 'The attached photograph appears to show waste or vegetation being burned in the open.',
    actions: ['Move away from the smoke and avoid breathing it.', 'Call the local helpline if burning is happening now.', 'Record the location without confronting anyone.'],
  },
  {
    prompt: 'sewage overflow on a street',
    aliases: ['dirty wastewater', 'blocked drain overflow', 'raw sewage', 'flooded dirty street', 'sewage flowing from an open drain'],
    category: 'sewage',
    issue: 'Likely sewage or drain overflow',
    description: 'The attached photograph appears to show sewage or dirty wastewater overflowing in a public area.',
    actions: ['Avoid contact with the water.', 'Record the exact drain, road, or landmark.', 'Report it to the municipal drainage department.'],
  },
  {
    prompt: 'tree cutting',
    aliases: ['felled tree', 'chainsaw cutting a tree', 'freshly cut tree trunk', 'damaged tree'],
    category: 'trees',
    issue: 'Possible tree cutting or damage',
    description: 'The attached photograph appears to show a tree being cut or damaged.',
    actions: ['Record the exact location and time.', 'Photograph any vehicle or permit board from a safe place.', 'Report active cutting immediately to the tree or forest authority.'],
  },
  {
    prompt: 'dusty construction site',
    aliases: ['uncovered sand and cement', 'building rubble on a road', 'construction debris', 'demolition dust', 'excavated soil dumped beside a road'],
    category: 'construction',
    issue: 'Possible construction material, dust, or debris',
    description: 'The attached photograph appears to show uncovered construction material, dust, or debris affecting a public area.',
    actions: ['Note the site address and contractor board.', 'Keep the photo showing uncovered material or dust.', 'Report it to the municipal ward and pollution-control authority.'],
  },
  {
    prompt: 'illegal land filling with dumped soil and rubble',
    aliases: ['excavation material dumping', 'earth and stones dumped on open land', 'debris filling a wetland', 'soil dumping in a mangrove', 'land reclamation with construction rubble'],
    category: 'greenspace',
    issue: 'Possible land filling or excavation-material dumping',
    description: 'The attached photograph appears to show soil, rubble, or excavation material dumped on or used to fill open land.',
    actions: ['Record the exact location and nearby water, wetland, or mangrove boundary.', 'Safely photograph vehicle numbers or contractor boards if visible.', 'Report it to the local planning authority and, near wetlands or mangroves, the forest/environment department.'],
  },
  {
    prompt: 'polluted river or lake',
    aliases: ['foam on dirty water', 'trash floating in water', 'contaminated river', 'polluted open drain or naala', 'black water in a drainage canal', 'garbage-filled stormwater drain'],
    category: 'water',
    issue: 'Possible water pollution',
    description: 'The attached photograph appears to show visible pollution or waste in a water body.',
    actions: ['Do not touch or enter the water.', 'Record the exact bank, bridge, or outlet location.', 'Report it to the local authority and state pollution board.'],
  },
  {
    prompt: 'plastic litter',
    aliases: ['plastic bottles on the ground', 'plastic bags and wrappers', 'plastic waste dump', 'littered plastic'],
    category: 'plastic',
    issue: 'Likely plastic litter or dumping',
    description: 'The attached photograph appears to show plastic litter or dumped plastic waste outdoors.',
    actions: ['Record the exact location.', 'Keep the original photo as evidence.', 'Report it to the local solid-waste department.'],
  },
  {
    prompt: 'scrap yard with discarded machinery',
    aliases: ['junkyard', 'scrap metal pile', 'discarded appliances', 'industrial waste dump'],
    category: 'industrial',
    issue: 'Possible scrap or industrial-waste dumping',
    description: 'The attached photograph appears to show a large outdoor pile of scrap, machinery, appliances, or other industrial waste.',
    actions: ['Record the exact location and visible facility name.', 'Keep the original photograph as evidence.', 'Report it to the local authority and state pollution-control board.'],
  },
  {
    prompt: 'factory chimney smoke',
    aliases: ['black smoke from a smokestack', 'industrial air pollution', 'factory emissions in the sky', 'smoky chimney'],
    category: 'air',
    issue: 'Possible industrial air emission',
    description: 'The attached photograph appears to show visible smoke or emissions from an industrial source.',
    actions: ['Avoid the plume and stay upwind.', 'Record the facility name and time if safely visible.', 'Report it to the state pollution-control board.'],
  },
  {
    prompt: 'a vehicle parked across and blocking a public road',
    aliases: ['illegal parking blocking traffic', 'a car parked on and blocking a footpath', 'double parked vehicle obstructing a street', 'truck blocking a road', 'vehicle blocking an entrance'],
    category: 'road_obstruction',
    issue: 'Possible road or footpath obstruction by a parked vehicle',
    description: 'The attached photograph appears to show a parked vehicle obstructing a public road, entrance, cycle lane, or footpath.',
    actions: ['Record the exact location, date, and time.', 'Safely retain a clear photo of the obstruction and vehicle number.', 'Report it to the local traffic police; call emergency services only if it creates immediate danger.'],
  },
  {
    prompt: 'clean normal outdoor scene',
    aliases: ['clean street', 'clean park', 'normal building or monument', 'outdoor scene with no pollution'],
    category: 'none',
    issue: 'No clear environmental issue detected',
    description: 'No specific environmental violation can be identified confidently from this photograph.',
    actions: [],
  },
];

let runtimePromise = null;

async function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('@huggingface/transformers')
      .then(async ({ pipeline, env }) => {
        env.allowLocalModels = false;
        const promptEntries = LABELS.flatMap((entry) => (
          [entry.prompt, ...(entry.aliases || [])].map((prompt) => ({ entry, prompt }))
        ));
        return {
          promptEntries,
          classifier: await pipeline('zero-shot-image-classification', MODEL_ID, { dtype: 'q8' }),
        };
      })
      .catch((error) => {
        runtimePromise = null; // allow a later retry after a network failure
        throw error;
      });
  }
  return runtimePromise;
}

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

/**
 * Classify common environmental complaint scenes entirely on-device.
 * Returns an `uncertain` result when the image is ambiguous; callers must never guess.
 */
export async function analyzeImageOnDevice(base64, mimeType = 'image/jpeg', contextHint = '') {
  if (!base64) return null;

  try {
    const runtime = await getRuntime();
    const cleanBase64 = String(base64).replace(/^data:[^,]+,/, '');
    const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
    const promptResults = await runtime.classifier(
      dataUrl,
      runtime.promptEntries.map(({ prompt }) => prompt),
      { hypothesis_template: 'a photo of {}' },
    );
    // Prompt ensembling: keep the strongest matching phrase for each category,
    // then normalize category scores. This is more reliable than one long label.
    const bestPromptByCategory = LABELS.map((entry) => promptResults
      .filter((result) => runtime.promptEntries.some((item) => item.entry === entry && item.prompt === result.label))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null);
    const rawCategoryScores = bestPromptByCategory.map((result) => Number(result?.score || 0));
    const scoreTotal = rawCategoryScores.reduce((sum, score) => sum + score, 0) || 1;
    const results = LABELS.map((entry, index) => ({
      label: entry.prompt,
      score: rawCategoryScores[index] / scoreTotal,
      matchedPrompt: bestPromptByCategory[index]?.label || entry.prompt,
    })).sort((a, b) => b.score - a.score);

    if (!Array.isArray(results) || !results.length) return null;

    // A short user note is supporting context, not permission to override the
    // photograph. It only adds a small tie-break boost to the matching class.
    const hintedCategory = contextCategory(contextHint);
    const ranked = results.map((result) => {
      const index = LABELS.findIndex((entry) => entry.prompt === result.label);
      const entry = LABELS[index];
      const boost = hintedCategory && entry?.category === hintedCategory ? 0.04 : 0;
      return { ...result, entry, adjustedScore: Number(result.score || 0) + boost };
    }).filter((result) => result.entry).sort((a, b) => b.adjustedScore - a.adjustedScore);

    let best = ranked[0];
    let second = ranked[1];

    // Soil/rubble dumping is visually split by CLIP across construction,
    // industrial waste and land-filling labels. Combine that evidence only
    // when the dedicated land-filling label itself is also meaningfully present.
    const initialScoreFor = (category) => ranked.find((item) => item.entry.category === category)?.score || 0;
    const landFillingCandidate = ranked.find((item) => item.entry.category === 'greenspace');
    const landFillingCluster = initialScoreFor('greenspace') + initialScoreFor('construction') + initialScoreFor('industrial');
    const hasCombinedLandFillingEvidence = landFillingCandidate &&
      landFillingCandidate.score >= 0.14 && landFillingCluster >= 0.65;
    if (hasCombinedLandFillingEvidence && ['construction', 'industrial'].includes(best?.entry.category)) {
      second = best;
      best = landFillingCandidate;
    }

    const margin = best.adjustedScore - (second?.adjustedScore || 0);
    const explicitlyAskedForOcr = /\b(read|ocr|text|sign|signboard|board|name|number|permit|notice|vehicle|factory)\b/i.test(contextHint);
    const explicitOcr = explicitlyAskedForOcr
      ? await extractVisibleText(cleanBase64, mimeType)
      : { lines: [], confidence: 0 };
    if (import.meta.env.DEV) {
      console.info('On-device vision candidates:', JSON.stringify(ranked.slice(0, 4).map((item) => ({
        category: item.entry.category,
        score: Number(item.score.toFixed(4)),
      }))));
    }
    // A page/sign containing several confidently read lines is primarily a text
    // image. Unless the user also named an environmental issue, do not force it
    // into one of the visual complaint categories.
    if (explicitlyAskedForOcr && explicitOcr.lines.length >= 3 && !hintedCategory) {
      return {
        uncertain: true,
        reason: 'text-dominant-image',
        provider: 'On-device CLIP + OCR',
        confidence: explicitOcr.confidence ? explicitOcr.confidence / 100 : 0,
        visibleText: explicitOcr.lines,
        ocrConfidence: explicitOcr.confidence ? explicitOcr.confidence / 100 : 0,
      };
    }
    if (!best || best.entry.category === 'none' || best.entry.category === 'unclear') {
      return {
        uncertain: true,
        reason: 'no-clear-environmental-issue',
        provider: 'On-device CLIP',
        confidence: Number(best?.score || 0),
        visibleText: explicitOcr.lines,
        ocrConfidence: explicitOcr.confidence ? explicitOcr.confidence / 100 : 0,
      };
    }

    // CLIP probabilities are relative to the supplied labels. Require both a
    // meaningful score and separation from the runner-up before making a claim.
    const scoreFor = (category) => ranked.find((item) => item.entry.category === category)?.score || 0;
    const hasCombinedSmokeEvidence = ['burning', 'air'].includes(best.entry.category) &&
      (scoreFor('burning') + scoreFor('air') >= 0.36);
    if (!hasCombinedSmokeEvidence && !hasCombinedLandFillingEvidence && (best.score < 0.30 || (best.score < 0.40 && margin < 0.04))) {
      return {
        uncertain: true,
        reason: 'ambiguous-image',
        provider: 'On-device CLIP',
        confidence: Number(best.score || 0),
        visibleText: explicitOcr.lines,
        ocrConfidence: explicitOcr.confidence ? explicitOcr.confidence / 100 : 0,
      };
    }

    // CLIP scores are relative ranking scores, not calibrated probabilities.
    // Keep the displayed confidence conservative rather than claiming 90%+.
    const confidence = Math.max(0.45, Math.min(
      0.88,
      0.40 + (best.score * 0.45) + (Math.max(0, margin) * 0.35),
    ));
    const severity = best.entry.category === 'burning' || best.entry.category === 'air'
      ? 'severe'
      : 'moderate';

    // OCR is intentionally opt-in ("read the sign/number"). Running three
    // language packs on every high-resolution complaint photo is slow and most
    // photos contain no useful text.
    const shouldReadText = explicitlyAskedForOcr;
    const ocr = shouldReadText
      ? (explicitlyAskedForOcr ? explicitOcr : await extractVisibleText(cleanBase64, mimeType))
      : { lines: [], confidence: 0 };

    return {
      issue: best.entry.issue,
      severity,
      category: best.entry.category,
      description: best.entry.description,
      actions: best.entry.actions,
      confidence,
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
  } catch (error) {
    console.warn('On-device vision unavailable:', error?.message || error);
    return null;
  }
}
