import test from 'node:test';
import assert from 'node:assert/strict';
import { boostQuietTalkAudio, createTalkAudioWindow, TALK_SAMPLE_RATE } from '../src/services/talkCaptureAudio.js';
import { createLocalTalkMic } from '../src/services/talkLocalMic.js';
import { unclearTalkDecode } from '../src/services/talkRecognizer.js';

function frame(rate, level = 0) {
  return Float32Array.from({ length: rate / 50 }, (_, i) => level * Math.sin(2 * Math.PI * 220 * i / rate));
}

test('quiet captured speech can be amplified without clipping or changing already loud samples', () => {
  const soft = new Float32Array([-.1, 0, .06]);
  assert.equal(boostQuietTalkAudio(soft), soft);
  assert.ok(Math.abs(soft[0] + .55) < .0001);
  assert.deepEqual(boostQuietTalkAudio(new Float32Array([-.9, 0, .6])), new Float32Array([-.9, 0, .6]));
  assert.deepEqual(boostQuietTalkAudio(new Float32Array(3)), new Float32Array(3));
});

test('the decoder retries weak speech without throwing out an uncertain city name', () => {
  assert.equal(unclearTalkDecode(0, 1, 0), true);
  assert.equal(unclearTalkDecode(.40, .62, .82), true);
  assert.equal(unclearTalkDecode(.39, .53, .39), true);
  assert.equal(unclearTalkDecode(.28, .43, .31), true);
  assert.equal(unclearTalkDecode(.33, .07, .64), false, 'a name can have a low token score');
  assert.equal(unclearTalkDecode(.39, .25, .46), false, 'language switching need not score like English dictation');
});

test('a silent input window times out without handing any audio to recognition', () => {
  const input = createTalkAudioWindow(TALK_SAMPLE_RATE);
  for (let i = 0; i < 600; i++) {
    const event = input.push(frame(TALK_SAMPLE_RATE));
    assert.equal(event.started, false);
    assert.equal(event.done, i === 599);
  }
  assert.equal(input.finish(), null);
});

test('a quiet utterance at 44.1 kHz keeps its beginning, tolerates pauses, and resamples to 16 kHz', () => {
  const rate = 44100;
  const input = createTalkAudioWindow(rate);
  function push(count, level) {
    return Array.from({ length: count }, () => input.push(frame(rate, level)));
  }
  push(36, 0);
  push(4, .002); // The quiet first part is below the activity threshold.
  assert.equal(input.hasVoice, false);
  const active = push(10, .018);
  assert.equal(active.filter(({ started }) => started).length, 1);
  assert.ok(active[0].level > 0);
  assert.ok(push(36, 0).every(({ done }) => !done));
  push(11, .012);
  assert.equal(push(68, 0).at(-1).done, true);
  const audio = input.finish();
  assert.ok(audio instanceof Float32Array);
  assert.equal(audio.length, Math.round(1.75 * TALK_SAMPLE_RATE));
  assert.ok(audio.slice(190 * 16, 250 * 16).some((sample) => Math.abs(sample) > .001));
});

test('Stop releases a stream granted after cancellation and never starts recognition', async () => {
  let grant;
  let releases = 0;
  const track = { stop: () => { releases++; } };
  const mic = createLocalTalkMic({
    getContext: () => ({ audioWorklet: { addModule: assert.fail } }),
    media: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) },
    WorkletNode: class {}, workerFactory: () => worker,
  });
  const worker = { postMessage() {}, terminate() {} };
  mic.listen({ onStart: assert.fail, onInput: assert.fail, onEnd: assert.fail });
  worker.onmessage({ data: { type: 'ready' } });
  mic.abort();
  grant({ getTracks: () => [track] });
  await Promise.resolve();
  assert.equal(releases, 1);
  mic.dispose();
});

function localMicFixture() {
  let node;
  let connected;
  const tracks = [], workers = [];
  const context = {
    audioWorklet: { addModule: async () => {} }, sampleRate: TALK_SAMPLE_RATE,
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  };
  const mic = createLocalTalkMic({
    getContext: () => context,
    media: { async getUserMedia(constraints) {
      assert.equal(constraints.audio.deviceId, undefined, 'follow the current default input');
      assert.equal(constraints.audio.echoCancellation, true, 'speaker playback needs echo cancellation');
      const track = Object.assign(new EventTarget(), {
        readyState: 'live', stop() { this.readyState = 'ended'; },
        unplug() { this.stop(); this.dispatchEvent(new Event('ended')); },
      });
      tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } },
    WorkletNode: class {
      constructor() { node = this; this.port = { close() {} }; }
      connect() { connected(); }
      disconnect() {}
    },
    workerFactory() {
      const worker = {
        messages: [],
        postMessage({ type, audio, id }, transfer) {
          if (type === 'transcribe') {
            assert.equal(tracks.at(-1).readyState, 'ended', 'release capture before handing audio to recognition');
            assert.ok(audio instanceof Float32Array && audio.length > 0);
            assert.deepEqual(transfer, [audio.buffer]);
          }
          this.messages.push({ type, id });
        },
        terminate() { this.stopped = true; },
      };
      workers.push(worker);
      return worker;
    },
  });
  const begin = (options) => {
    const opening = new Promise((resolve) => { connected = resolve; });
    mic.listen(options);
    return opening;
  };
  return {
    mic, tracks, workers,
    begin,
    whenReconnected: () => new Promise((resolve) => { connected = resolve; }),
    open(options) {
      const opening = begin(options);
      const worker = workers.at(-1);
      worker.onmessage({ data: { type: 'ready' } });
      return opening;
    },
    feed(count, level = 0) {
      for (let i = 0; i < count; i++) node.port.onmessage({ data: frame(TALK_SAMPLE_RATE, level) });
    },
  };
}

test('the mic closes before decoding; Stop ignores any late worker result', async () => {
  const { mic, tracks, workers, open, feed } = localMicFixture();
  await open({ onEnd: assert.fail });
  mic.finishInput();
  assert.equal(tracks[0].readyState, 'live');
  feed(6, .018);
  mic.finishInput();
  assert.equal(tracks[0].readyState, 'ended');
  mic.abort();
  workers[0].onmessage({ data: { type: 'result', id: 1, result: { transcript: 'A late result' } } });
  assert.equal(workers[0].stopped, true);
});

test('preparing the recognizer keeps the mic off until it is ready', async (t) => {
  const { mic, tracks, workers, begin, feed } = localMicFixture();
  t.after(() => mic.dispose());
  const statuses = [];
  const opening = begin({
    onPrepare: () => statuses.push('preparing'),
    onOpening: () => statuses.push('opening'),
    onStart: () => statuses.push('listening'),
    onEnd: assert.fail,
  });
  const [worker] = workers;
  worker.onmessage({ data: { type: 'load-activity' } });
  mic.finishInput();
  assert.deepEqual(statuses, ['preparing']);
  assert.equal(tracks.length, 0);
  worker.onmessage({ data: { type: 'ready' } });
  await opening;
  feed(1);
  assert.deepEqual(statuses, ['preparing', 'opening', 'listening']);
});

test('Stop while loading never opens the mic on a late ready message', (t) => {
  const { mic, tracks, workers } = localMicFixture();
  t.after(() => mic.dispose());
  mic.listen({ onOpening: assert.fail, onEnd: assert.fail });
  mic.abort();
  workers[0].onmessage({ data: { type: 'ready' } });
  assert.equal(tracks.length, 0);
  assert.ok(workers[0].stopped);
});

test('active load progress extends the idle deadline, but a stall does not open the mic', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, tracks, workers } = localMicFixture();
  t.after(() => mic.dispose());
  const ended = [];
  mic.listen({ onEnd: (outcome) => ended.push(outcome) });
  t.mock.timers.tick(45000);
  workers[0].onmessage({ data: { type: 'load-activity' } });
  t.mock.timers.tick(45000);
  assert.deepEqual(ended, []);
  t.mock.timers.tick(15000);
  assert.deepEqual(ended, [{ error: 'load-timeout' }]);
  assert.equal(tracks.length, 0);
});

test('a silent attempt sends no audio and leaves a warm model for the next explicit tap', async (t) => {
  const { mic, tracks, workers, open, feed } = localMicFixture();
  t.after(() => mic.dispose());
  const ended = [];
  const playback = 'Which city should I check?';
  const options = { playback, onEnd: (outcome) => ended.push(outcome) };
  await open(options);
  feed(600);
  assert.deepEqual(ended, [{ error: 'no-speech' }]);
  assert.equal(tracks[0].readyState, 'ended');
  assert.equal(workers.length, 1);
  const [worker] = workers;
  assert.deepEqual(worker.messages.map(({ type }) => type), ['warmup']);
  await open(options);
  feed(6, .018);
  mic.finishInput();
  const { id } = worker.messages.at(-1);
  worker.onmessage({ data: { type: 'result', id, result: { transcript: playback } } });
  assert.deepEqual(ended.at(-1), { error: 'unrecognized-speech' });
  assert.equal(tracks.length, 2, 'an echo does not reopen the mic');
});

test('a decode timeout stops the worker, not the next manual attempt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, workers, open, feed } = localMicFixture();
  t.after(() => mic.dispose());
  const ended = [];
  const options = { onEnd: (outcome) => ended.push(outcome) };
  await open(options);
  feed(6, .018);
  const [worker] = workers;
  mic.finishInput();
  t.mock.timers.tick(55000);
  assert.deepEqual(ended, [{ error: 'decode-timeout' }]);
  assert.equal(worker.stopped, true);

  await open(options);
  feed(6, .018);
  mic.finishInput();
  const retry = workers[1];
  worker.onmessage({ data: { type: 'failed' } });
  assert.equal(ended.length, 1, 'stale worker errors cannot stop a retry');
  const result = { transcript: 'Mumbai', locale: 'en', uncertain: true };
  retry.onmessage({ data: { type: 'result', id: retry.messages.at(-1).id, result } });
  assert.deepEqual(ended.at(-1), { result });
});

test('unplugging a headset before speech reopens the current mic once; it never submits clipped speech', async (t) => {
  const { mic, tracks, workers, open, feed, whenReconnected } = localMicFixture();
  t.after(() => mic.dispose());
  const ended = [];
  await open({ onEnd: (outcome) => ended.push(outcome) });
  feed(1);
  const reconnect = whenReconnected();
  tracks[0].unplug();
  await reconnect;
  assert.equal(tracks.length, 2);
  assert.equal(tracks[1].readyState, 'live');
  feed(6, .018);
  tracks[1].unplug();
  assert.deepEqual(ended, [{ error: 'microphone-disconnected' }]);
  assert.deepEqual(workers[0].messages.map(({ type }) => type), ['warmup']);
});
