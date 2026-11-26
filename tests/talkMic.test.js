import test from 'node:test';
import assert from 'node:assert/strict';
import { createTalkMic, isTalkEcho, isTalkStop } from '../src/services/talkMic.js';

function micFixture({ autoStart = true } = {}) {
  const sessions = [];
  let recording = null;
  class Recognition {
    start() {
      assert.equal(recording, null, 'The previous browser session must release the mic first');
      recording = this;
      sessions.push(this);
      if (autoStart) this.onstart();
    }
    say(transcript, isFinal = true, { index = 0, confidence = .91 } = {}) {
      const results = [];
      results[index] = Object.assign([{ transcript, confidence }], { isFinal });
      this.onresult({ resultIndex: index, results });
    }
    end() {
      if (recording === this) recording = null;
      this.onend();
    }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  return { mic: createTalkMic(Recognition), sessions };
}

test('voice stop accepts explicit commands without treating ordinary speech or playback as commands', () => {
  for (const text of ['Stop!', 'EcoPulse, stop speaking.', 'Please stop.', 'That’s enough.', 'बस करो।', 'थांबा.', 'स्टॉप स्पीकिंग', 'बोलणं थांबवा.']) {
    assert.equal(isTalkStop(text), true, text);
  }
  for (const text of ['How do I stop smoking?', 'Stop using gas', 'Stop by later', 'Yes, that’s right', '']) {
    assert.equal(isTalkStop(text), false, text);
  }
  assert.equal(isTalkStop('stop', 'Don’t stop your prescribed medication.'), false);
  assert.equal(isTalkStop('stop speaking', 'Don’t stop your prescribed medication.'), true);
});

test('the follow-up mic stays open through a tap and ignores the question’s late echo', () => {
  const { mic, sessions } = micFixture();
  const playback = 'Which city should I check?';
  mic.listen({ language: 'en-IN', playback, onStop: () => assert.fail('echo is not a stop'), onEnd: () => assert.fail('stale end') });
  const [monitor] = sessions;
  monitor.say('An earlier playback segment.');
  monitor.say('Which city should', false, { index: 1 });
  const answers = [];
  let ready = 0, heard = 0;
  mic.listen({ language: 'en-IN', playback, followUp: true, onStart: () => ready++, onInput: () => heard++, onEnd: (outcome) => answers.push(outcome) });
  assert.equal(ready, 1);
  assert.equal(sessions.length, 1);
  mic.finishInput();
  assert.equal(monitor.stopped, undefined);
  monitor.say('An earlier playback segment.', true, { index: 0 });
  monitor.say('Which city should I check?', true, { index: 1 });
  assert.equal(heard, 0);
  monitor.say('Mumbai, Maharashtra, India.', true, { index: 2 });
  assert.equal(heard, 1);
  mic.finishInput();
  assert.equal(monitor.stopped, true);
  monitor.end();
  assert.deepEqual(answers, [{ result: { transcript: 'Mumbai, Maharashtra, India.', confidence: .91 }, error: undefined }]);
  assert.equal(isTalkEcho('San Francisco, California, United States', 'Did you mean San Francisco, California, United States?'), false);
});

test('interrupting a reply while recognition is starting waits for the mic to be ready', () => {
  const { mic, sessions } = micFixture({ autoStart: false });
  const prompt = { language: 'en-IN', playback: 'Which city should I check?' };
  mic.listen({ ...prompt, onStop: () => assert.fail('stale stop'), onStart: () => assert.fail('stale monitor'), onEnd: () => assert.fail('stale end') });
  let ready = false;
  const answers = [];
  mic.listen({ ...prompt, onStart: () => { ready = true; }, onEnd: (result) => answers.push(result) });
  assert.equal(ready, false);
  const [input] = sessions;
  assert.equal(input.aborted, undefined);
  input.onstart();
  assert.equal(ready, true);
  input.say('Mumbai');
  input.end();
  assert.equal(answers[0].result.transcript, 'Mumbai');
  assert.equal(sessions.length, 1);
});

test('the playback mic ignores echo and other speech, then handles stop without dictating it', () => {
  const { mic, sessions } = micFixture();
  let stops = 0;
  mic.listen({
    language: 'en-IN', playback: 'Did you mean Mumbai?',
    onEnd: () => assert.fail('An explicitly cancelled playback session must not dispatch a result'),
    onStop: () => { stops++; mic.abort(); },
  });
  const [monitor] = sessions;
  assert.equal(monitor.continuous, true);
  assert.equal(monitor.interimResults, true);
  monitor.say('Did you mean Mumbai?');
  monitor.say('Yes');
  monitor.say('stop', false);
  assert.equal(stops, 0);
  monitor.say('Stop speaking.', false);
  assert.equal(stops, 1);
  assert.equal(monitor.aborted, true);
  monitor.say('Stop');
  monitor.end();
  assert.equal(stops, 1);
  assert.equal(sessions.length, 1);
});

test('interrupting playback waits for mic release and delivers the new answer exactly once', () => {
  const { mic, sessions } = micFixture();
  mic.listen({ onStop: () => assert.fail('stale stop'), onEnd: () => assert.fail('stale end') });
  const [monitor] = sessions;
  const answers = [];
  mic.listen({ language: 'en-IN', followUp: true, onEnd: (outcome) => answers.push(outcome) });
  assert.equal(monitor.aborted, true);
  assert.equal(sessions.length, 1);
  monitor.say('Stop');
  monitor.end();
  const input = sessions[1];
  assert.equal(input.continuous, true);
  assert.equal(input.lang, 'en-IN');
  monitor.end();
  input.say('Yes, that’s right.', false);
  input.say('Yes, that’s right.');
  mic.finishInput();
  assert.equal(input.stopped, true);
  assert.deepEqual(answers, []);
  input.end();
  input.end();
  assert.deepEqual(answers, [{ result: { transcript: 'Yes, that’s right.', confidence: .91 }, error: undefined }]);
});

test('dictation waits through a pause, combines final segments, and ignores interim guesses', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, sessions } = micFixture();
  const answers = [];
  mic.listen({ onEnd: (outcome) => answers.push(outcome) });
  const [input] = sessions;
  input.say('I take the bus');
  t.mock.timers.tick(700);
  input.say('and work indoors', false, { index: 1 });
  t.mock.timers.tick(500);
  assert.equal(input.stopped, undefined);
  input.say('and work outdoors', true, { index: 1, confidence: .66 });
  t.mock.timers.tick(1000);
  assert.equal(input.stopped, true);
  input.end();
  assert.deepEqual(answers, [{ result: { transcript: 'I take the bus and work outdoors', confidence: .66 }, error: undefined }]);
});

test('finishing dictation allows a late final result and does not send partial guesses', () => {
  const { mic, sessions } = micFixture();
  const answers = [];
  mic.listen({ onEnd: (outcome) => answers.push(outcome) });
  sessions[0].say('weather in Pennsylvania', false);
  mic.finishInput();
  sessions[0].say('weather in Panvel');
  sessions[0].end();
  assert.equal(answers[0].result.transcript, 'weather in Panvel');
  mic.listen({ onEnd: (outcome) => answers.push(outcome) });
  sessions[1].say('weather in Pennsylvania', false);
  sessions[1].end();
  assert.deepEqual(answers[1], { result: undefined, error: 'unrecognized-speech' });
  assert.equal(sessions.length, 2, 'An unsuccessful attempt must not open the mic again');
  mic.listen({ onEnd: (outcome) => answers.push(outcome) });
  assert.equal(sessions[2].continuous, false, 'Try single-utterance recognition on the next explicit attempt');
  sessions[2].say('Panvel');
  sessions[2].end();
  assert.equal(answers[2].result.transcript, 'Panvel');
});

test('a speech-end event requests a final result after the pause, not while the speaker is continuing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, sessions } = micFixture();
  const answers = [];
  mic.listen({ onEnd: (outcome) => answers.push(outcome) });
  const [input] = sessions;
  input.onspeechstart();
  input.say('weather in', false);
  input.onspeechend();
  t.mock.timers.tick(750);
  input.onspeechstart();
  t.mock.timers.tick(750);
  assert.equal(input.stopped, undefined);
  input.onspeechend();
  t.mock.timers.tick(1000);
  assert.equal(input.stopped, true);
  input.say('weather in Mumbai');
  input.end();
  assert.equal(answers[0].result.transcript, 'weather in Mumbai');
});

test('an opening microphone that never becomes ready reports an error and does not retry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, sessions } = micFixture({ autoStart: false });
  const answers = [];
  mic.listen({ onStart: () => assert.fail('Mic is not ready'), onEnd: (outcome) => answers.push(outcome) });
  t.mock.timers.tick(8000);
  assert.equal(sessions[0].aborted, true);
  sessions[0].onstart();
  t.mock.timers.tick(750);
  assert.deepEqual(answers, [{ result: undefined, error: 'start-timeout' }]);
  assert.equal(sessions.length, 1);
});

test('Stop clears a queued follow-up before an asynchronous mic release', () => {
  const { mic, sessions } = micFixture();
  mic.listen({ onStop: () => assert.fail('stale stop'), onEnd: () => assert.fail('stale end') });
  mic.listen({ onEnd: () => assert.fail('Stop must cancel the queued follow-up') });
  mic.abort();
  sessions[0].end();
  assert.equal(sessions.length, 1);
});

test('an unanswered follow-up closes its mic even when the browser does not send an end event', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mic, sessions } = micFixture();
  const ended = [];
  mic.listen({ followUp: true, onEnd: (outcome) => ended.push(outcome) });
  t.mock.timers.tick(12000);
  assert.equal(sessions[0].stopped, true);
  t.mock.timers.tick(1200);
  assert.equal(sessions[0].aborted, true);
  t.mock.timers.tick(750);
  assert.deepEqual(ended, [{ result: undefined, error: 'no-speech' }]);
  sessions[0].end();
  assert.equal(ended.length, 1);
});
