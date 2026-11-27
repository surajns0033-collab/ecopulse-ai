import { CLIPFeatureExtractor, CLIPModel, CLIPTokenizer, ZeroShotImageClassificationPipeline, env } from '@huggingface/transformers';
import wasmBinary from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmLoader from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

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

export function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadRuntime().catch(error => {
      runtimePromise = null; // Allow another photo to retry after a failed download.
      throw error;
    });
  }
  return runtimePromise;
}
