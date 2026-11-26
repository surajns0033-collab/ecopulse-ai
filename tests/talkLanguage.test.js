import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTalkLanguage, normalizeTalkTranscript, talkInputLanguage, talkMicLocale, talkReplyLocale } from '../src/services/talkLanguage.js';
import { playBrowserVoice } from '../src/services/talkAudio.js';

test('the current words override a prior question and regional place names do not set the language', () => {
  assert.equal(talkInputLanguage('What is the weather in पुणे?', 'mr-IN', true), 'en-IN');
  assert.equal(talkInputLanguage('Good morning!', 'hi-IN'), 'en-IN');
  assert.equal(talkInputLanguage('मुंबई में मौसम कैसा है?', 'mr-IN'), 'hi-IN');
  assert.equal(talkInputLanguage('Pune madhye havaman kasa aahe?', 'en-IN'), 'mr-IN');
  assert.equal(talkInputLanguage('Mumbai mein kya weather hai today?', 'en-IN'), 'hi-IN');
  assert.equal(talkInputLanguage('Bonjour', 'mr-IN'), '');
  assert.equal(talkInputLanguage('Yes.', 'mr-IN', true), 'mr-IN');
  assert.equal(talkInputLanguage('Yes, that’s right.', 'mr-IN', true), 'en-IN');
  assert.equal(talkInputLanguage('Pune', 'mr-IN', true), 'mr-IN');
  assert.equal(talkInputLanguage('Pune'), '');
});

test('common phonetically spelled English recovers without translating actual local speech', () => {
  assert.equal(normalizeTalkTranscript('हाउ आर यू?'), 'how are you?');
  assert.equal(detectTalkLanguage(normalizeTalkTranscript('व्हॉट इज द वेदर इन पुणे?')), 'en-IN');
  assert.equal(detectTalkLanguage(normalizeTalkTranscript('ए क्यू आई नियर मी')), 'en-IN');
  assert.equal(normalizeTalkTranscript('मला एअर क्वालिटी सांगा'), 'मला एअर क्वालिटी सांगा');
  assert.equal(normalizeTalkTranscript('एअर क्वालिटी'), 'एअर क्वालिटी');
  assert.equal(talkMicLocale('mr-IN'), 'mr-IN');
  assert.equal(talkMicLocale('mr-IN', 'en-IN'), 'en-IN');
  assert.equal(talkMicLocale('en-GB', 'en-IN'), 'en-GB');
});

test('Romanized Marathi grammar can switch the reply language without a confident acoustic locale', () => {
  assert.equal(talkInputLanguage('Khana saathi baksya mhanun.', 'hi-IN'), 'mr-IN');
  assert.equal(talkInputLanguage('Khanya saati baksya manun.', 'en-IN'), 'mr-IN');
  assert.equal(talkInputLanguage('What can I bring for Sathi and Manun?', 'mr-IN'), 'en-IN');
});

test('reject an unrelated language instead of speaking it with a different voice', () => {
  assert.equal(talkReplyLocale('मला नीट ऐकू आलं नाही.', 'en-IN', 'en-IN'), '');
  assert.equal(talkReplyLocale('Good morning! How are you?', 'hi-IN', 'hi-IN'), '');
  assert.equal(talkReplyLocale('Okay.', 'hi-IN', 'en-US'), '');
  assert.equal(talkReplyLocale('Okay.', 'hi-IN', 'hi-IN'), '');
  assert.equal(talkReplyLocale('Good morning! How are you?', 'en-IN', 'en-US'), 'en-IN');
  assert.equal(talkReplyLocale('Bien sûr, je peux vous aider.', '', 'fr-FR'), 'fr-FR');
});

test('browser fallback chooses a voice for the reply, never an unrelated installed default', async (t) => {
  const synth = {
    getVoices: () => [{ lang: 'mr-IN', default: true, name: 'Default' }, { lang: 'en-US', name: 'English' }],
    speak(utterance) {
      assert.equal(utterance.text, 'Good morning!');
      assert.equal(utterance.voice?.lang, 'en-US');
      assert.equal(utterance.lang, 'en-US');
      utterance.onstart();
      utterance.onend();
    },
  };
  globalThis.window = { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } };
  t.after(() => { delete globalThis.window; });
  const options = { signal: new AbortController().signal, onStart() {}, onLevel() {} };
  assert.equal(await playBrowserVoice('Good morning!', 'en-IN', options), 'played');
  assert.equal(await playBrowserVoice('नमस्ते।', 'hi-IN', options), 'no-voice');
});
