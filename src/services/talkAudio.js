const SAMPLE_RATE = 24000;
const BUFFER_BYTES = 7680; // 160ms of audio before scheduling another buffer
let retryNeuralAfter = 0;

function whenEnded(source, signal) {
  if (!source || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      source.removeEventListener('ended', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    source.addEventListener('ended', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });
  });
}

// Keep microphone audio out of the synthesis endpoint: it only receives the
// short reply. Decode PCM incrementally to start before the whole reply arrives.
export async function playNeuralVoice(context, text, { signal, onStart, onLevel }) {
  if (context?.state !== 'running' || signal.aborted || Date.now() < retryNeuralAfter) return false;
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal, AbortSignal.timeout(28000)]);
  const timer = setTimeout(() => deadline.abort(), 5500);
  const nodes = new Set();
  let reader, analyser, frame, lastNode;
  let started = false;
  let firstTime = 0;
  let nextTime = 0;
  const hasPlayed = () => started || Boolean(firstTime && context.currentTime >= firstTime);
  const stopNodes = () => {
    for (const node of nodes) { node.stop(); node.disconnect(); }
    nodes.clear();
  };
  combined.addEventListener('abort', stopNodes, { once: true });

  try {
    const response = await fetch('/api/ai/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: combined,
    });
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get('retry-after')) || 30;
      retryNeuralAfter = Date.now() + Math.max(30, wait) * 1000;
    }
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream' || !response.body) return false;

    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    const animate = () => {
      if (combined.aborted) return;
      if (!started && hasPlayed()) {
        started = true;
        onStart();
      }
      if (started) {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((total, sample) => total + sample * sample, 0) / samples.length);
        onLevel(Math.min(1, rms * 5));
      }
      frame = requestAnimationFrame(animate);
    };

    function schedule(bytes, length) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, length);
      const buffer = context.createBuffer(1, length / 2, SAMPLE_RATE);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;

      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(analyser);
      node.addEventListener('ended', () => { node.disconnect(); nodes.delete(node); }, { once: true });
      const time = nextTime > context.currentTime ? nextTime : context.currentTime + .12;
      node.start(time);
      nodes.add(node);
      lastNode = node;
      nextTime = time + buffer.duration;
      if (!firstTime) {
        firstTime = time;
        clearTimeout(timer);
        frame = requestAnimationFrame(animate);
      }
    }

    reader = response.body.getReader();
    let pending = new Uint8Array(0);
    while (!combined.aborted) {
      const { value, done } = await reader.read();
      if (done || combined.aborted) break;
      const bytes = new Uint8Array(pending.length + value.length);
      bytes.set(pending);
      bytes.set(value, pending.length);
      if (bytes.length >= BUFFER_BYTES) {
        const even = bytes.length - (bytes.length % 2);
        schedule(bytes, even);
        pending = bytes.subarray(even);
      } else {
        pending = bytes;
      }
    }
    if (!combined.aborted && pending.length >= 2) schedule(pending, pending.length - (pending.length % 2));
    if (nodes.has(lastNode)) await whenEnded(lastNode, combined);
    return hasPlayed();
  } catch {
    // If sound already began, don't repeat the same sentence in another voice.
    return hasPlayed();
  } finally {
    clearTimeout(timer);
    if (frame != null) cancelAnimationFrame(frame);
    combined.removeEventListener('abort', stopNodes);
    stopNodes();
    analyser?.disconnect();
    if (reader) void reader.cancel().catch(() => {});
  }
}

export function playBrowserVoice(text, language, { signal, onStart, onLevel }) {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance || signal.aborted) return Promise.resolve(false);
  const lang = language.toLowerCase();
  const available = synth.getVoices();
  const voices = available.filter((voice) => voice.lang.toLowerCase().split('-')[0] === lang.split('-')[0]);
  // Don't silently use an installed default voice from another language.
  // Some browsers expose no voice list but honor the utterance's language.
  if (available.length && !voices.length) return Promise.resolve(false);
  const score = (voice) => 20 * (voice.lang.toLowerCase() === lang) +
    100 * /natural|neural|premium|enhanced/i.test(voice.name) + 45 * /google/i.test(voice.name) + 8 * voice.default;
  voices.sort((a, b) => score(b) - score(a));

  return new Promise((resolve) => {
    const utterance = new window.SpeechSynthesisUtterance(text);
    const preferred = voices[0];
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred?.lang || language;
    utterance.rate = .98;
    let started = false;
    let pulse = false;
    let timer = setTimeout(stop, 4000);
    function finish(ok) {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      utterance.onstart = utterance.onboundary = utterance.onend = utterance.onerror = null;
      resolve(ok);
    }
    function stop() { finish(started); synth.cancel(); }
    utterance.onstart = () => {
      clearTimeout(timer);
      timer = setTimeout(stop, 22000);
      started = true;
      onStart();
    };
    utterance.onboundary = () => { pulse = !pulse; onLevel(pulse ? .8 : .3); };
    utterance.onend = () => finish(started);
    utterance.onerror = () => finish(started);
    signal.addEventListener('abort', stop, { once: true });
    try { synth.speak(utterance); } catch { finish(false); }
  });
}
