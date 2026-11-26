export const TALK_SAMPLE_RATE = 16000;
export const TALK_CAPTURE_SECONDS = 20;

export function boostQuietTalkAudio(audio) {
  let peak = 0;
  for (const sample of audio) peak = Math.max(peak, Math.abs(sample));
  const gain = Math.min(12, .55 / peak);
  // Applied in place after voice activity detection, never to a live stream.
  if (peak && gain > 1) for (let i = 0; i < audio.length; i++) audio[i] *= gain;
  return audio;
}

function resample(frames, length, sampleRate) {
  const pcm = new Float32Array(length);
  let offset = 0;
  for (const frame of frames) {
    const piece = frame.subarray(0, length - offset);
    pcm.set(piece, offset);
    offset += piece.length;
    if (offset === length) break;
  }
  if (sampleRate === TALK_SAMPLE_RATE) return pcm;

  // Average source samples over each output interval (including fractional
  // samples at 44.1 kHz). The mic's actual rate need not be the model's rate.
  const ratio = sampleRate / TALK_SAMPLE_RATE;
  const audio = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < audio.length; i++) {
    const start = i * ratio, end = (i + 1) * ratio;
    let sum = 0;
    for (let j = Math.floor(start); j < Math.ceil(end) && j < length; j++) {
      sum += pcm[j] * (Math.min(end, j + 1) - Math.max(start, j));
    }
    audio[i] = sum / ratio;
  }
  return audio;
}

// A bounded, in-memory audio window. Keep a little of the lead-in so that the
// first consonant of a brief answer isn't lost while confirming voice activity.
export function createTalkAudioWindow(sampleRate) {
  const frames = [];
  let elapsed = 0, length = 0, voiced = 0, lastVoice = 0, noise = .001;
  let hasVoice = false;

  return {
    get hasVoice() { return hasVoice; },
    push(frame) {
      let energy = 0;
      for (const sample of frame) energy += sample * sample;
      const rms = Math.sqrt(energy / frame.length);
      const audible = rms >= Math.max(.0024, noise * 3);
      const before = hasVoice;
      frames.push(frame);
      length += frame.length;
      elapsed += frame.length;
      if (audible) {
        voiced += frame.length;
        lastVoice = length;
        if (voiced >= sampleRate * .08) hasVoice = true;
      } else if (!hasVoice) {
        noise = .95 * noise + .05 * rms;
        voiced = Math.max(0, voiced - frame.length);
      }
      if (!hasVoice) {
        while (length > sampleRate * .32 && frames.length > 1) {
          const drop = frames.shift().length;
          length -= drop;
          lastVoice = Math.max(0, lastVoice - drop);
        }
      }
      const done = hasVoice ? (length - lastVoice >= sampleRate * 1.35 || elapsed >= sampleRate * TALK_CAPTURE_SECONDS)
        : elapsed >= sampleRate * 12;
      return { started: hasVoice && !before, done, level: Math.min(1, rms * 16) };
    },
    finish() {
      if (!hasVoice) return null;
      const end = Math.min(length, lastVoice + Math.round(sampleRate * .35));
      return resample(frames, end, sampleRate);
    },
  };
}
