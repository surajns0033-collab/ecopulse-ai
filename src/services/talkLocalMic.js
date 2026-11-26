import { createTalkAudioWindow, TALK_CAPTURE_SECONDS, TALK_SAMPLE_RATE } from './talkCaptureAudio.js';
import { isTalkEcho } from './talkMic.js';

const workletURL = new URL('./talkCapture.worklet.js?no-inline', import.meta.url);
const releaseStream = (stream) => stream?.getTracks().forEach((track) => track.stop());

// Only the model weights are downloaded. The microphone stream is never
// uploaded, and audio is transferred once to a worker, not to browser storage.
export function createLocalTalkMic({
  getContext,
  media = globalThis.navigator?.mediaDevices,
  WorkletNode = globalThis.AudioWorkletNode,
  workerFactory = globalThis.Worker && (() => new Worker(new URL('./talkRecognizer.worker.js', import.meta.url), { type: 'module' })),
} = {}) {
  const available = Boolean(media?.getUserMedia && WorkletNode && workerFactory);
  const worklets = new WeakMap();
  let active, worker, idleTimer, ready, incompatible, nextId = 0;

  function closeWorker() {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    ready = false;
  }

  function releaseCapture(session) {
    if (session.node) {
      session.node.port.onmessage = null;
      session.node.port.close();
      session.node.onprocessorerror = null;
      session.node.disconnect();
      session.node = null;
    }
    session.source?.disconnect();
    session.source = null;
    for (const track of session.stream?.getAudioTracks() || []) track.removeEventListener('ended', session.trackEnded);
    releaseStream(session.stream);
    session.stream = null;
    session.window = null;
  }

  function end(session, outcome) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    releaseCapture(session);
    // A silent attempt queued no audio. Let its model download finish so
    // retrying doesn't start the same large download again.
    if (worker && (ready || outcome?.error === 'no-speech')) idleTimer = setTimeout(closeWorker, 90000);
    else closeWorker();
    if (outcome) session.options.onEnd(outcome);
  }

  function failRecognizer(error = 'local-unavailable') {
    closeWorker();
    if (active) end(active, { error });
  }

  function waitForRecognition(session) {
    clearTimeout(session.timer);
    session.timer = ready ? setTimeout(() => failRecognizer('decode-timeout'), session.decodeTimeout)
      : setTimeout(failRecognizer, 90000);
    session.options.onDecode?.(ready);
  }

  function warmup() {
    if (worker) return;
    try {
      const instance = worker = workerFactory();
      instance.onerror = instance.onmessageerror = () => { if (worker === instance) failRecognizer(); };
      instance.onmessage = ({ data }) => {
        if (worker !== instance) return;
        if (data.type === 'failed') { failRecognizer(ready ? 'decode-failed' : 'local-unavailable'); return; }
        if (data.type === 'ready') {
          ready = true;
          if (active?.decoding) waitForRecognition(active);
          return;
        }
        const session = active;
        if (data.type !== 'result' || !session?.decoding || data.id !== session.id) return;
        const { result } = data;
        if (result?.transcript && !isTalkEcho(result.transcript, session.options.playback)) end(session, { result });
        else end(session, { error: 'unrecognized-speech' });
      };
      instance.postMessage({ type: 'warmup' });
    } catch { failRecognizer(); }
  }

  function finishInput(session) {
    if (active !== session || session.decoding) return;
    const audio = session.window?.finish();
    if (!audio) { end(session, { error: 'no-speech' }); return; }
    clearTimeout(session.timer);
    releaseCapture(session);
    session.decoding = true;
    // The fixed encoder pass is slower on single-threaded browsers than in
    // native benchmarks; longer turns also need more autoregressive steps.
    session.decodeTimeout = Math.min(55000, 28000 + Math.round(audio.length / TALK_SAMPLE_RATE * 3000));
    waitForRecognition(session);
    try { worker.postMessage({ type: 'transcribe', id: session.id, audio }, [audio.buffer]); }
    catch { failRecognizer(); }
  }

  async function open(session) {
    const context = getContext?.();
    if (!context?.audioWorklet) {
      incompatible = true;
      end(session, { error: 'local-unavailable' });
      return;
    }
    let stream;
    try {
      stream = await media.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      end(session, { error: /^(?:NotAllowedError|SecurityError)$/.test(error?.name) ? 'not-allowed' : 'audio-capture' });
      return;
    }
    // The OS permission prompt can finish after the user stopped or left.
    if (active !== session) { releaseStream(stream); return; }
    session.stream = stream;
    try {
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        end(session, { error: 'audio-capture' });
        return;
      }
      if (!worklets.has(context)) worklets.set(context, context.audioWorklet.addModule(workletURL.href));
      await worklets.get(context);
      if (active !== session) return;
      session.window = createTalkAudioWindow(context.sampleRate);
      session.source = context.createMediaStreamSource(stream);
      const node = session.node = new WorkletNode(context, 'talk-capture', { channelCount: 1, channelCountMode: 'explicit' });
      session.trackEnded = node.onprocessorerror = () => end(session, { error: 'audio-capture' });
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', session.trackEnded, { once: true });
      node.port.onmessage = ({ data }) => {
        if (active !== session || session.decoding || !data?.length) return;
        if (!session.started) {
          session.started = true;
          clearTimeout(session.timer);
          session.timer = setTimeout(() => finishInput(session), (TALK_CAPTURE_SECONDS + 3) * 1000);
          warmup();
          if (active !== session) return;
          session.options.onStart?.();
        }
        const { started, done, level } = session.window.push(data);
        session.options.onLevel?.(level);
        if (started) session.options.onInput?.();
        if (done) finishInput(session);
      };
      session.source.connect(node);
      node.connect(context.destination);
    } catch {
      worklets.delete(context);
      if (active === session) failRecognizer();
    }
  }

  function abort() {
    if (!active) return;
    if (active.decoding) closeWorker();
    end(active);
  }

  return {
    get supported() { return available && !incompatible; },
    listen(options) {
      abort();
      clearTimeout(idleTimer);
      const session = active = { id: ++nextId, options };
      session.timer = setTimeout(() => end(session, { error: 'start-timeout' }), 18000);
      void open(session);
    },
    finishInput() { if (active?.window?.hasVoice) finishInput(active); },
    abort,
    dispose() { abort(); closeWorker(); },
  };
}
