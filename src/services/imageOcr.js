import { logFailure } from './diagnostics.js';
// Optional on-device OCR for signboards, facility names and permit notices.
// It runs only when useful and never sends the photograph to an OCR server.

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker(['eng', 'hin', 'mar']))
      .catch((error) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

function cleanOcrLines(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => {
      if (line.length < 3 || line.length > 100) return false;
      if (!/[\p{L}\p{N}]/u.test(line)) return false;
      const meaningful = (line.match(/[\p{L}\p{N}\s.,:/#&()-]/gu) || []).join('').length;
      if (meaningful / line.length < 0.65) return false;
      const key = line.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

/** Returns only reasonably confident text; empty means "do not quote OCR". */
export async function extractVisibleText(base64, mimeType = 'image/jpeg', signal) {
  signal?.throwIfAborted();
  if (!base64) return { lines: [], confidence: 0 };
  try {
    const cleanBase64 = String(base64).replace(/^data:[^,]+,/, '');
    const image = `data:${mimeType};base64,${cleanBase64}`;
    const worker = await getWorker();
    signal?.throwIfAborted();
    const { data } = await worker.recognize(image);
    signal?.throwIfAborted();
    const confidence = Number(data?.confidence || 0);
    if (confidence < 55) return { lines: [], confidence };
    return { lines: cleanOcrLines(data?.text), confidence };
  } catch {
    signal?.throwIfAborted();
    logFailure('vision.ocr');
    return { lines: [], confidence: 0 };
  }
}
