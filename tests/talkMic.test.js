import test from 'node:test';
import assert from 'node:assert/strict';
import { createTalkMic, isTalkStop } from '../src/services/talkMic.js';

function micFixture() {
  const sessions = [];
  let recording = null;
  class Recognition {
    start() {
      assert.equal(recording, null, 'The previous browser session must release the mic first');
      recording = this;
      sessions.push(this);
      this.onstart();
    }
    say(transcript, isFinal = true) {
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript, confidence: .91 }], { isFinal })] });
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
  for (const text of ['Stop!', 'EcoPulse, stop speaking.', 'Please stop.', 'That’s enough.', 'बस करो।', 'थांबा.']) {
    assert.equal(isTalkStop(text), true, text);
  }
  for (const text of ['How do I stop smoking?', 'Stop using gas', 'Stop by later', 'Yes, that’s right', '']) {
    assert.equal(isTalkStop(text), false, text);
  }
  assert.equal(isTalkStop('stop', 'Don’t stop your prescribed medication.'), false);
  assert.equal(isTalkStop('stop speaking', 'Don’t stop your prescribed medication.'), true);
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
  assert.equal(input.continuous, false);
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
  assert.equal(sessions[0].aborted, true);
  t.mock.timers.tick(750);
  assert.deepEqual(ended, [{ result: undefined, error: undefined }]);
  sessions[0].end();
  assert.equal(ended.length, 1);
});
