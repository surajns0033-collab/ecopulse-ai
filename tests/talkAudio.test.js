import test from 'node:test';
import assert from 'node:assert/strict';
import { playBrowserVoice } from '../src/services/talkAudio.js';

function voiceFixture(t, voiceList = []) {
  const utterances = [];
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voiceList,
    speak: (utterance) => utterances.push(utterance),
    cancel() { this.cancelled = true; },
  });
  globalThis.window = { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } };
  t.after(() => { delete globalThis.window; });
  const controller = new AbortController();
  return { synth, utterances, controller, options: { signal: controller.signal, onStart() {}, onLevel() {} } };
}

test('after blocked autoplay a tap speaks the same reply synchronously', async (t) => {
  const { options, utterances } = voiceFixture(t, [{ lang: 'en-US', name: 'English' }]);
  const automatic = playBrowserVoice('Mumbai is sunny.', 'en-IN', options);
  utterances[0].onerror({ error: 'not-allowed' });
  assert.equal(await automatic, 'blocked');
  const byTap = playBrowserVoice('Mumbai is sunny.', 'en-IN', { ...options, fromGesture: true });
  assert.equal(utterances[1].text, utterances[0].text, 'speak is called before the tap handler yields');
  utterances[1].onstart();
  utterances[1].onend();
  assert.equal(await byTap, 'played');
});

test('automatic playback uses voices published after the initial empty list', async (t) => {
  const voices = [];
  const { synth, options, utterances } = voiceFixture(t, voices);
  const playback = playBrowserVoice('नमस्ते।', 'hi-IN', options);
  assert.equal(utterances.length, 0);
  voices.push({ lang: 'hi_IN', name: 'Hindi' });
  synth.dispatchEvent(new Event('voiceschanged'));
  assert.equal(utterances[0].voice.name, 'Hindi');
  utterances[0].onstart();
  utterances[0].onend();
  assert.equal(await playback, 'played');
});

test('a listed voice can fail; retry only a compatible voice and never repeat partially played speech', async (t) => {
  const { options, utterances } = voiceFixture(t, [
    { lang: 'en-US', name: 'US' }, { lang: 'en-IN', name: 'India' }, { lang: 'hi-IN', name: 'Default', default: true },
  ]);
  const playback = playBrowserVoice('Mumbai is sunny.', 'en-IN', options);
  assert.equal(utterances[0].voice.name, 'India');
  utterances[0].onerror({ error: 'voice-unavailable' });
  assert.equal(utterances[1].voice.name, 'US');
  utterances[1].onstart();
  utterances[1].onerror({ error: 'audio-hardware' });
  assert.equal(await playback, 'incomplete');
  assert.equal(utterances.length, 2);
});

test('Stop cancels speech and prevents late voices from triggering it again', async (t) => {
  const { synth, controller, options, utterances } = voiceFixture(t);
  const playback = playBrowserVoice('Mumbai is sunny.', 'en-IN', { ...options, fromGesture: true });
  assert.equal(utterances[0].lang, 'en-IN');
  controller.abort();
  assert.equal(await playback, 'cancelled');
  assert.equal(synth.cancelled, true);
  synth.dispatchEvent(new Event('voiceschanged'));
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].onstart, null);
});
