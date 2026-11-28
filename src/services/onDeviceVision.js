import { logFailure } from './diagnostics.js';
import { photoPrompts } from './photoCategories.js';
import { assessScene } from './sceneAssessment.js';
import { extractVisibleText } from './imageOcr';
import { getRuntime } from './visionRuntime.js';

export async function analyzeImageOnDevice(base64, mimeType = 'image/jpeg', contextHint = '', signal) {
  signal?.throwIfAborted();
  if (!base64) return null;
  try {
    const classifier = await getRuntime();
    signal?.throwIfAborted();
    const clean = String(base64).replace(/^data:[^,]+,/, '');
    const scores = await classifier('data:' + mimeType + ';base64,' + clean, photoPrompts, { hypothesis_template: 'a photo of {}' });
    signal?.throwIfAborted();
    const wantsText = /\b(read|ocr|text|sign|signboard|board|name|number|permit|notice|vehicle|factory)\b/i.test(contextHint);
    const ocr = wantsText ? await extractVisibleText(clean, mimeType, signal) : { lines: [], confidence: 0 };
    signal?.throwIfAborted();
    return assessScene(contextHint, scores, ocr, wantsText);
  } catch {
    signal?.throwIfAborted();
    logFailure('vision.classify');
    return null;
  }
}
