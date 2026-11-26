const SAMPLE_RATE = 24000;
const BUFFER_BYTES = 7680; // 160ms of audio before scheduling another buffer
let retryNeuralAfter = 0;

// Releasing capture lets mobile browsers switch back to the system's media
// output (speaker or connected headphones). Do not select a specific device.
export function setTalkAudioRoute(type) {
  try {
    if (globalThis.navigator?.audioSession) navigator.audioSession.type = type;
  } catch { /* browsers without Audio Session use their default routing */ }
}

async function resumeTalkOutput(context) {
  if (!context || context.state === 'running' || context.state === 'closed') return;
  let timer;
  try {
    await Promise.race([context.resume(), new Promise((resolve) => { timer = setTimeout(resolve, 400); })]);
  } catch { /* use browser playback if Web Audio can't resume */ }
  finally { clearTimeout(timer); }
}

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
  if (signal.aborted || Date.now() < retryNeuralAfter) return false;
  await resumeTalkOutput(context);
  if (context?.state !== 'running' || signal.aborted) return false;
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

const voiceLocale = (locale) => (locale || '').toLowerCase().replaceAll('_', '-');

export function playBrowserVoice(text, language, { signal, onStart, onLevel, fromGesture = false }) {
  const synth = window.speechSynthesis;
  if (signal.aborted) return Promise.resolve('cancelled');
  if (!synth || !window.SpeechSynthesisUtterance) return Promise.resolve('unavailable');
  const lang = voiceLocale(language);
  const score = (voice) => 100 * (voiceLocale(voice.lang) === lang) + 60 * Boolean(voice.localService) +
    20 * /natural|neural|premium|enhanced/i.test(voice.name) + 5 * Boolean(voice.default);

  return new Promise((resolve) => {
    let utterance, timer, voices;
    function detach() {
      clearTimeout(timer);
      if (utterance) utterance.onstart = utterance.onboundary = utterance.onend = utterance.onerror = null;
      utterance = null;
    }
    function finish(outcome, cancel = false) {
      const wasQueued = Boolean(utterance);
      detach();
      synth.removeEventListener?.('voiceschanged', voicesChanged);
      signal.removeEventListener('abort', stop);
      if (cancel && wasQueued) {
        try { synth.cancel(); } catch { /* no further speech is queued here */ }
      }
      resolve(outcome);
    }
    function stop() { finish('cancelled', true); }

    function speakNext() {
      if (!voices.length) { finish('failed'); return; }
      let started = false, pulse = false;
      function startedSpeaking() {
        if (started) return;
        started = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish('incomplete', true), 22000);
        onStart();
      }
      function failed({ error } = {}) {
        if (started) { finish('incomplete'); return; }
        if (error === 'not-allowed') { finish('blocked'); return; }
        // A listed voice can be unavailable on mobile. Try another matching
        // voice only before any words have been spoken.
        detach();
        speakNext();
      }
      const voice = voices.shift();
      try {
        utterance = new window.SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || language;
        utterance.rate = .98;
        utterance.onstart = startedSpeaking;
        utterance.onboundary = () => { startedSpeaking(); pulse = !pulse; onLevel(pulse ? .8 : .3); };
        utterance.onend = () => { if (started) finish('played'); else failed(); };
        utterance.onerror = failed;
        timer = setTimeout(() => finish('blocked', true), 3000);
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      } catch { failed(); }
    }

    function begin(available) {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', voicesChanged);
      if (signal.aborted) { stop(); return; }
      const matching = available.filter((voice) => voiceLocale(voice.lang).split('-')[0] === lang.split('-')[0]);
      // Some engines don't enumerate voices but honor the requested locale.
      // Never use the default when we know it speaks a different language.
      if (available.length && !matching.length) { finish('no-voice'); return; }
      voices = matching.length ? matching.sort((a, b) => score(b) - score(a)).slice(0, 3) : [null];
      speakNext();
    }
    function voicesChanged() {
      const available = synth.getVoices();
      if (available.length) begin(available);
    }

    signal.addEventListener('abort', stop, { once: true });
    const available = synth.getVoices();
    // An explicit tap must invoke speak in the same event, without waiting
    // for a network response or voiceschanged and losing user activation.
    if (available.length || fromGesture || !synth.addEventListener) begin(available);
    else {
      synth.addEventListener('voiceschanged', voicesChanged);
      timer = setTimeout(() => begin(synth.getVoices()), 650);
    }
  });
}
