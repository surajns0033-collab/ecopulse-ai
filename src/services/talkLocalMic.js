import { createTalkAudioWindow, TALK_CAPTURE_SECONDS, TALK_SAMPLE_RATE } from './talkCaptureAudio.js';
import { isTalkEcho } from './talkMic.js';

const workletURL = new URL('./talkCapture.worklet.js?no-inline', import.meta.url);
const releaseStream = (stream) => stream?.getTracks().forEach((track) => track.stop());
const LOAD_IDLE_MS = 60000;
const LOAD_MAX_MS = 300000;

// The recognizer assets are downloaded; the mic stream is never uploaded.
// Audio is transferred once to a worker, not to browser storage.
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
    session.window?.clear();
    session.window = null;
  }

  function end(session, outcome) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    clearTimeout(session.loadDeadline);
    releaseCapture(session);
    if (worker && ready) idleTimer = setTimeout(closeWorker, 90000);
    else closeWorker();
    if (outcome) session.options.onEnd(outcome);
  }

  function failRecognizer(error = 'local-unavailable') {
    closeWorker();
    if (active) end(active, { error });
  }

  function openMic(session) {
    clearTimeout(session.loadDeadline);
    clearTimeout(session.timer);
    session.options.onOpening?.();
    session.timer = setTimeout(() => end(session, { error: 'start-timeout' }), 18000);
    void open(session);
  }

  function prepare(session) {
    if (ready) { openMic(session); return; }
    session.options.onPrepare?.();
    const onTimeout = () => failRecognizer('load-timeout');
    session.timer = setTimeout(onTimeout, LOAD_IDLE_MS);
    session.loadDeadline = setTimeout(onTimeout, LOAD_MAX_MS);
    try {
      const instance = worker = workerFactory();
      instance.onerror = instance.onmessageerror = () => { if (worker === instance) failRecognizer(ready ? 'decode-failed' : 'local-unavailable'); };
      instance.onmessage = ({ data }) => {
        if (worker !== instance) return;
        if (data.type === 'failed') { failRecognizer(ready ? 'decode-failed' : 'local-unavailable'); return; }
        if (!ready && data.type === 'load-activity') {
          clearTimeout(session.timer);
          session.timer = setTimeout(onTimeout, LOAD_IDLE_MS);
          return;
        }
        if (!ready && data.type === 'ready') {
          ready = true;
          openMic(session);
          return;
        }
        const current = active;
        if (data.type !== 'result' || !current?.decoding || data.id !== current.id) return;
        const { result } = data;
        if (result?.transcript && !isTalkEcho(result.transcript, current.options.playback)) end(current, { result });
        else end(current, { error: 'unrecognized-speech' });
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
    session.timer = setTimeout(() => failRecognizer('decode-timeout'), Math.min(55000, 28000 + Math.round(audio.length / TALK_SAMPLE_RATE * 3000)));
    session.options.onDecode?.();
    try { worker.postMessage({ type: 'transcribe', id: session.id, audio }, [audio.buffer]); }
    catch { if (audio.byteLength) audio.fill(0); failRecognizer('decode-failed'); }
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
      // Do not pin either device. Each capture uses the current browser/OS
      // default and requests echo cancellation for speaker as well as headset use.
      stream = await media.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      end(session, { error: /^(?:NotAllowedError|SecurityError)$/.test(error?.name) ? 'not-allowed'
        : error?.name === 'NotFoundError' ? 'no-microphone' : 'audio-capture' });
      return;
    }
    // The OS permission prompt can finish after the user stopped or left.
    if (active !== session) { releaseStream(stream); return; }
    session.stream = stream;
    try {
      const track = stream.getAudioTracks().find((input) => input.readyState === 'live');
      if (!track) { end(session, { error: 'no-microphone' }); return; }
      session.trackEnded = () => {
        if (active !== session || session.stream !== stream) return;
        // A headset may disappear before the user starts speaking. Reopen the
        // new default once; never pass speech cut off by removal as a full turn.
        if (session.reopened || session.window?.hasVoice) { end(session, { error: 'microphone-disconnected' }); return; }
        session.reopened = true;
        session.started = false;
        releaseCapture(session);
        openMic(session);
      };
      track.addEventListener('ended', session.trackEnded, { once: true });
      if (context.state && context.state !== 'running') void context.resume().catch(() => {});
      if (!worklets.has(context)) worklets.set(context, context.audioWorklet.addModule(workletURL.href));
      await worklets.get(context);
      if (active !== session || session.stream !== stream) return;
      session.window = createTalkAudioWindow(context.sampleRate);
      session.source = context.createMediaStreamSource(stream);
      const node = session.node = new WorkletNode(context, 'talk-capture', { channelCount: 1, channelCountMode: 'explicit' });
      node.onprocessorerror = () => end(session, { error: 'audio-capture' });
      node.port.onmessage = ({ data }) => {
        if (active !== session || session.node !== node || !data?.length) return;
        if (!session.started) {
          session.started = true;
          clearTimeout(session.timer);
          session.timer = setTimeout(() => finishInput(session), (TALK_CAPTURE_SECONDS + 3) * 1000);
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
      if (active === session && session.stream === stream) end(session, { error: 'audio-capture' });
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
      const context = getContext?.();
      if (!context?.audioWorklet) {
        incompatible = true;
        end(session, { error: 'local-unavailable' });
      } else prepare(session);
    },
    finishInput() { if (active?.window?.hasVoice) finishInput(active); },
    abort,
    dispose() { abort(); closeWorker(); },
  };
}
