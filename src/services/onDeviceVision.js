// Private image understanding in the browser.
//
// The model is fetched from Hugging Face on first photo analysis and cached by
// the browser. Model weights are never committed to this repository and the
// user's photo is processed locally (it is not uploaded by this fallback).

import { CLIPFeatureExtractor, CLIPModel, CLIPTokenizer, ZeroShotImageClassificationPipeline, env } from '@huggingface/transformers';
import wasmBinary from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmLoader from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { photoPrompts, rankPhotoCategories } from './photoCategories.js';
import { extractVisibleText } from './imageOcr';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

let runtimePromise = null;

async function loadRuntime() {
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths = { mjs: wasmLoader, wasm: wasmBinary };
  // Only this CLIP checkpoint is used by the on-device photo fallback.
  const [tokenizer, processor] = await Promise.all([
    CLIPTokenizer.from_pretrained(MODEL_ID),
    CLIPFeatureExtractor.from_pretrained(MODEL_ID),
  ]);
  const model = await CLIPModel.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
  return new ZeroShotImageClassificationPipeline({
    task: 'zero-shot-image-classification', model, tokenizer, processor,
  });
}

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadRuntime().catch(error => {
      runtimePromise = null; // Allow another photo to retry after a failed download.
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
    const classifier = await getRuntime();
    const cleanBase64 = String(base64).replace(/^data:[^,]+,/, '');
    const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
    const promptResults = await classifier(dataUrl, photoPrompts, { hypothesis_template: 'a photo of {}' });
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

    const margin = best.adjustedScore - (second?.adjustedScore || 0);
    const explicitlyAskedForOcr = /\b(read|ocr|text|sign|signboard|board|name|number|permit|notice|vehicle|factory)\b/i.test(contextHint);
    const ocr = explicitlyAskedForOcr
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

    // CLIP scores are relative ranking scores, not calibrated probabilities.
    // Keep the displayed confidence conservative rather than claiming 90%+.
    const confidence = Math.max(0.45, Math.min(
      0.88,
      0.40 + (best.score * 0.45) + (Math.max(0, margin) * 0.35),
    ));
    const severity = best.entry.category === 'burning' || best.entry.category === 'air'
      ? 'severe'
      : 'moderate';

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
