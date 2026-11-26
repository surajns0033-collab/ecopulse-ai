const SAMPLE_RATE = 24000;
const BUFFER_BYTES = 7680; // 160ms of audio before scheduling another buffer
let retryNeuralAfter = 0;

export function speechLanguage(text, fallback = 'en-IN') {
  if (/\p{Script=Devanagari}/u.test(text)) {
    if (/(?:^|\s)(?:आहे|नाही|मला|तुम्ही|आणि|पाहू|सांगाल|हवामान|मध्ये|माझ्या|इथे|कसा|कशी|काय|कुठे|सध्या|पाऊस|बरोबर)(?=\s|[.।?!,]|$)/u.test(text)) return 'mr-IN';
    if (/(?:^|\s)(?:है|हैं|का|की|क्या|कैसा|कैसी|मौसम|में|मैं|मुझे|नमस्ते|हाँ|हां|नहीं)(?=\s|[.।?!,]|$)/u.test(text)) return 'hi-IN';
    return /^(?:hi|mr)(?:-|$)/.test(fallback) ? fallback : (fallback ? 'hi-IN' : '');
  }
  const scripts = [
    [/\p{Script=Arabic}/u, 'ar'], [/\p{Script=Bengali}/u, 'bn-IN'], [/\p{Script=Gujarati}/u, 'gu-IN'],
    [/\p{Script=Tamil}/u, 'ta-IN'], [/\p{Script=Telugu}/u, 'te-IN'], [/\p{Script=Kannada}/u, 'kn-IN'],
    [/\p{Script=Malayalam}/u, 'ml-IN'], [/\p{Script=Cyrillic}/u, 'ru'], [/\p{Script=Hangul}/u, 'ko'],
    [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'], [/\p{Script=Han}/u, 'zh'],
  ];
  const scriptLanguage = scripts.find(([script]) => script.test(text))?.[1];
  if (scriptLanguage) return scriptLanguage;
  if (/\b(?:havaman|madhye|madhe|aahe|sanga|majhya|aajcha)\b/i.test(text)) return 'mr-IN';
  if (/\b(?:mausam|baarish|batao|bataiye|kya|kaise|kaisa|mein|mujhe|namaste)\b|\b(?:ka|ki)\s+(?:aqi|hawa|weather)\b/i.test(text)) return 'hi-IN';
  // A browser locale is for recognition, not proof of the reply language. Keep
  // context only for terse follow-ups such as a bare place name or “yes”.
  if (/\b(?:whats?|which|when|where|why|how|is|the|can|could|please|should|hello|thanks|help|show|tell|check|use|set|weather|temperature|forecast|news|smog plan|map|near me)\b|\baqi\s+(?:in|for|here|today)\b|^(?:hi|hey|good morning|good evening)[.!?]*$/i.test(text.trim())) {
    return fallback.startsWith('en') ? fallback : 'en-IN';
  }
  return fallback;
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
  const voices = synth.getVoices().filter((voice) => voice.lang.toLowerCase().split('-')[0] === lang.split('-')[0]);
  const score = (voice) => 20 * (voice.lang.toLowerCase() === lang) +
    100 * /natural|neural|premium|enhanced/i.test(voice.name) + 45 * /google/i.test(voice.name) + 8 * voice.default;
  voices.sort((a, b) => score(b) - score(a));

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
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
