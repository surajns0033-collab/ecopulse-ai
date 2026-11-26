import { AutoProcessor, env, softmax, Tensor, WhisperForConditionalGeneration } from '@huggingface/transformers';
import { boostQuietTalkAudio, TALK_SAMPLE_RATE, TALK_CAPTURE_SECONDS } from './talkCaptureAudio.js';

const MODEL = 'Xenova/whisper-base';
const REVISION = '64da57285918e20ea79ea5c88eed7197933abaa8';

export function unclearTalkDecode(score, noSpeech, language) {
  // Weak token scores alone are common for a short, valid city name. Retry
  // when the audio ALSO looks like silence or has no reliable language signal.
  return !score || (noSpeech > .55 && score < .55) || (noSpeech > .30 && language < .40 && score < .45);
}

export async function loadTalkRecognizer(device = 'wasm', progressCallback) {
  env.allowLocalModels = false;
  if (device === 'wasm') {
    const { wasm } = env.backends.onnx;
    wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, globalThis.navigator?.hardwareConcurrency || 1) : 1;
    wasm.proxy = false;
    // This worker only uses CPU inference. Skip the heavier WebGPU-capable
    // Asyncify runtime; keep the exact runtime version selected by the library.
    if (wasm.wasmPaths?.wasm && wasm.wasmPaths?.mjs) {
      wasm.wasmPaths = {
        wasm: wasm.wasmPaths.wasm.replace('.asyncify.wasm', '.wasm'),
        mjs: wasm.wasmPaths.mjs.replace('.asyncify.mjs', '.mjs'),
      };
    }
  }
  const [model, processor] = await Promise.all([
    WhisperForConditionalGeneration.from_pretrained(MODEL, { revision: REVISION, dtype: 'q8', device, progress_callback: progressCallback }),
    AutoProcessor.from_pretrained(MODEL, { revision: REVISION }),
  ]);
  const { tokenizer } = processor;
  const config = model.generation_config;
  const languages = Object.entries(config.lang_to_id);
  const eos = config.eos_token_id;
  const noTimestamps = config.no_timestamps_token_id;
  const noSpeech = noTimestamps - 1; // Whisper's <|nospeech|> token
  const start = config.decoder_start_token_id;
  const transcribe = config.task_to_id.transcribe;
  const suppress = config.suppress_tokens;
  const suppressFirst = config.begin_suppress_tokens;

  // Only request the encoder state, not several hundred MB of attention
  // matrices that aren't needed for dictation. Reuse it for generation.
  model.forward_params.push('encoder_outputs');

  return async function recognize(audio) {
    if (!(audio instanceof Float32Array) || !audio.length || audio.length > (TALK_CAPTURE_SECONDS + 1) * TALK_SAMPLE_RATE) return null;
    let features, encoder, sequence;
    try {
      ({ input_features: features } = await processor(boostQuietTalkAudio(audio)));
      const output = await model.sessions.model.run({ input_features: features.ort_tensor }, ['last_hidden_state']);
      encoder = new Tensor(output.last_hidden_state);
      let lang = '', languageProbability = 0, noSpeechProbability = 1, logProbability = 0, tokenCount = 0, weakest = 1;
      const force = (data, id) => { data.fill(-Infinity); data[id] = 0; };

      // Transformers.js defaults Whisper to English if no language is set.
      // Choose a language from THIS audio instead, then force transcription
      // (not translation). Do both in one pass through the encoder.
      const processLogits = ([tokens], logits) => {
        const scores = logits.data;
        if (tokens.length === 1) {
          noSpeechProbability = softmax(scores)[noSpeech];
          let best = 0;
          const langScores = languages.map(([, id], index) => {
            if (scores[id] > scores[languages[best][1]]) best = index;
            return scores[id];
          });
          languageProbability = softmax(langScores)[best];
          if (languageProbability >= .45) lang = languages[best][0].slice(2, -2);
          force(scores, noSpeechProbability > .85 ? eos : languages[best][1]);
        } else if (tokens.length === 2) force(scores, transcribe);
        else if (tokens.length === 3) force(scores, noTimestamps);
        else {
          for (const id of suppress) scores[id] = -Infinity;
          if (tokens.length === 4) for (const id of suppressFirst) scores[id] = -Infinity;
          scores.fill(-Infinity, eos + 1);
          let best = 0;
          for (let i = 1; i <= eos; i++) if (scores[i] > scores[best]) best = i;
          if (best !== eos) {
            const probability = softmax(scores)[best];
            logProbability += Math.log(Math.max(.001, probability));
            tokenCount++;
            weakest = Math.min(weakest, probability);
          }
        }
        return logits;
      };
      sequence = await model.generate({
        inputs: features, encoder_outputs: encoder, decoder_input_ids: [start],
        begin_suppress_tokens: null, suppress_tokens: null, do_sample: false, no_repeat_ngram_size: 4,
        max_new_tokens: Math.min(144, Math.ceil(audio.length / TALK_SAMPLE_RATE * 14) + 16),
        logits_processor: [processLogits],
      });
      const ids = sequence.tolist()[0];
      const score = tokenCount && Math.exp(logProbability / tokenCount);
      if (Number(ids.at(-1)) !== eos || unclearTalkDecode(score, noSpeechProbability, languageProbability)) return null;
      const transcript = tokenizer.decode(ids, { skip_special_tokens: true }).trim();
      if (!/[\p{L}\p{N}]/u.test(transcript)) return null;
      // These scores aren't calibrated word confidence. Keep a plausible
      // short name, but don't silently commit an uncertain city match.
      return { transcript, locale: lang, uncertain: score < .80 || weakest < .40 || languageProbability < .45 };
    } finally {
      features?.dispose();
      encoder?.dispose();
      sequence?.dispose();
    }
  };
}
