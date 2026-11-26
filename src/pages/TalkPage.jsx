import { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, AudioWaveform, ExternalLink, Square } from 'lucide-react';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { processMessage } from '../agent/agentOrchestrator';
import { awaitingTalkPlace, emptyTalkContext, resolveTalkTurn, unclearTalkInput } from '../agent/talkContext';
import { shortSpeech, talkStatus, talkWebReference, toolSpeech } from '../agent/talkReply';
import { playBrowserVoice, playNeuralVoice } from '../services/talkAudio';
import { createLocalTalkMic } from '../services/talkLocalMic';
import { createTalkMic, isTalkStop } from '../services/talkMic';
import { getVoiceResponse, isAIUnavailable } from '../services/geminiService';
import { canonicalTalkLocale, DEFAULT_TALK_LOCALE, detectTalkLanguage, languageCode, normalizeTalkTranscript, talkInputLanguage, talkMicLocale, talkReplyLocale } from '../services/talkLanguage';
import { createTalkSession, TALK_MESSAGE_LIMIT } from '../services/talkSession';

const talkAnswer = (text, expectsReply = false, locale = '', remember = true) => ({ text, expectsReply, locale, remember });

function micNotice(error, awaitingCity) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone access was blocked. Allow it in your browser settings, or type below.';
  if (error === 'audio-capture') return 'The browser couldn’t access the microphone. Check your mic or type below.';
  if (error === 'local-unavailable') return 'On-device recognition couldn’t load. Check your connection and tap to retry, or type below.';
  if (error === 'decode-timeout') return 'Speech recognition took too long. Try saying a shorter phrase, or type below.';
  if (error === 'decode-failed') return 'On-device recognition couldn’t process that audio. Tap the wave to retry, or type below.';
  if (error === 'network') return 'The browser’s on-device voice recognition stopped. Tap the wave to retry, or type below.';
  if (error === 'language-not-supported') return 'The browser couldn’t recognize speech in this language. You can still type below.';
  if (error && error !== 'no-speech' && error !== 'unrecognized-speech') return 'Voice recognition couldn’t start or stopped unexpectedly. Tap the wave to retry or type below.';
  if (awaitingCity) return 'I didn’t get a city from the mic. Tap the wave and say just the city name, or type it below.';
  return error === 'unrecognized-speech' ? 'I didn’t catch the words clearly. Tap the wave to retry or type below.'
    : 'I didn’t hear a message. Tap the wave and speak when it says Listening, or type below.';
}

function externalReference(label, value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? { label, href: url.href } : null;
  } catch { return null; }
}

export default function TalkPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [deviceVoice, setDeviceVoice] = useState(false);
  const [inputEngine, setInputEngine] = useState('');
  const [voiceStopReady, setVoiceStopReady] = useState(false);
  const [hasInput, setHasInput] = useState(false);
  const [reference, setReference] = useState(null);
  const visualRef = useRef(null);
  const audioRef = useRef(null);
  const turnRef = useRef(null);
  const playbackRef = useRef('');
  const browserMicRef = useRef(null);
  const localMicRef = useRef(null);
  const listeningRef = useRef(null);
  const tryInstalledMic = useRef(false);
  const [session] = useState(() => createTalkSession(user.uid));

  useEffect(() => {
    const browser = createTalkMic(window.SpeechRecognition || window.webkitSpeechRecognition);
    const local = createLocalTalkMic({ getContext: () => audioRef.current });
    browserMicRef.current = browser;
    localMicRef.current = local;
    window.speechSynthesis?.getVoices();
    return () => {
      browser.abort();
      local.dispose();
      browserMicRef.current = localMicRef.current = listeningRef.current = null;
      turnRef.current?.abort();
      turnRef.current = null;
      if (audioRef.current) void audioRef.current.close().catch(() => {});
      audioRef.current = null;
    };
  }, []);

  function unlockAudio() {
    // Resume from a user gesture; the reply arrives asynchronously later.
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const context = audioRef.current;
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch { /* the browser voice can still be used */ }
  }

  function setWaveLevel(level) {
    visualRef.current?.style.setProperty('--speech-level', (.55 + level * .8).toFixed(2));
  }

  async function speak(answer, language, signal, fromMic) {
    // Never route an on-device conversation to an online recognizer just for
    // the spoken Stop command. Use an installed local pack if available.
    const mic = browserMicRef.current;
    function listenForStop() {
      if (!fromMic || !mic?.supported) return;
      const locale = talkMicLocale(navigator.language, language);
      void mic.localAvailable(locale).then((available) => {
        if (!available) return;
        if (signal.aborted || turnRef.current?.signal !== signal) return;
        mic.listen({
          language: locale, localOnly: true, playback: answer, onStop: stopTurn,
          onStart: () => { if (!signal.aborted) setVoiceStopReady(true); }, onEnd: () => setVoiceStopReady(false),
        });
      });
    }
    const options = {
      signal,
      onLevel: setWaveLevel,
      onStart: () => {
        if (signal.aborted) return;
        setMode('speaking');
        listenForStop();
      },
    };
    const cloud = await playNeuralVoice(audioRef.current, answer, options);
    if (cloud || signal.aborted) return cloud;
    return playBrowserVoice(answer, language, {
      ...options, onStart: () => { setDeviceVoice(true); options.onStart(); },
    });
  }

  function cancelReply() {
    const turn = turnRef.current;
    turnRef.current = null;
    turn?.abort();
    playbackRef.current = '';
    setVoiceStopReady(false);
    setWaveLevel(0);
  }

  function stopTurn() {
    browserMicRef.current?.abort();
    localMicRef.current?.abort();
    listeningRef.current = null;
    cancelReply();
    setHasInput(false);
    setMode('idle');
  }

  async function askAssistant(userText, { confidence, uncertain, inputLocale, fromMic = false } = {}) {
    const cleaned = String(userText || '').trim().slice(0, TALK_MESSAGE_LIMIT);
    if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned) || turnRef.current) return;
    const turnController = new AbortController();
    const { signal } = turnController;
    turnRef.current = turnController;
    setError('');
    setDeviceVoice(false);
    setReference(null);
    setText('');
    setMode('thinking');
    const previous = session.current;
    const understood = !unclearTalkInput(confidence);
    const requested = understood
      ? talkInputLanguage(cleaned, previous.questionLocale, awaitingTalkPlace(previous.context)) || canonicalTalkLocale(inputLocale)
      : previous.questionLocale || previous.voiceLocale;
    const language = requested || DEFAULT_TALK_LOCALE;
    const history = previous.history;
    const next = { context: previous.context || emptyTalkContext(), pending: previous.pending };
    let verifiedReference = null;
    let timer, continueByVoice;
    try {
      const answer = await Promise.race([
        (async () => {
          const turn = await resolveTalkTurn(cleaned, next.context, { confidence, uncertain, fromMic, language: languageCode(language), history, pending: next.pending, signal });
          signal.throwIfAborted();
          next.context = turn.context;
          if (turn.silent) return { notice: turn.text };
          if (understood) {
            // A well-heard utterance can guide the next mic session without
            // forcing future reply text into that language. Don't save retries or echo.
            const voiceLocale = fromMic && (detectTalkLanguage(cleaned) || requested);
            session.remember('user', cleaned, voiceLocale ? { voiceLocale } : undefined);
          }
          if (turn.kind === 'reply') return talkAnswer(turn.text, turn.expectsReply);
          if (turn.kind === 'map') {
            const { city, lat, lng } = turn.location;
            verifiedReference = externalReference('Open map', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`);
            if (language.startsWith('hi')) return talkAnswer(`${city} मिल गया। नीचे नक्शा खोल सकते हैं।`);
            if (language.startsWith('mr')) return talkAnswer(`${city} सापडलं. खाली नकाशा उघडू शकता.`);
            return talkAnswer(`I found ${city}. You can open the map below.`);
          }
          if (turn.kind === 'tool') {
            const result = await processMessage(turn.message, history, user, turn.location, null, turn.pending, { voiceIntent: turn.intent, signal });
            signal.throwIfAborted();
            if (result.pending) next.pending = { action: { type: result.pending }, intent: turn.intent, location: turn.location };
            else if (turn.pending || next.pending?.intent === turn.intent) next.pending = null;
            const contact = result.speechData?.contact;
            if (contact?.portal) verifiedReference = externalReference(contact.national ? 'Official national portal' : 'Official contact', contact.source || contact.portal);
            else {
              const reading = result.speechData?.weather || result.cards?.find(({ type }) => type === 'aqi')?.data;
              if (reading?.sourceUrl) verifiedReference = externalReference(reading.source, reading.sourceUrl);
            }
            return talkAnswer(toolSpeech(result, turn, language), Boolean(result.pending));
          }

          // Only a web query uses the verified search area. Search receives no
          // prior conversations, even when assistant turns are available.
          const useSearch = turn.kind === 'web';
          const query = useSearch && turn.location ? `${turn.message}\nSearch this area: ${turn.location.city}` : turn.message;
          const reply = await getVoiceResponse([...(useSearch ? [] : history), { role: 'user', text: query }], { signal, useSearch, language: requested });
          signal.throwIfAborted();
          if (!reply || isAIUnavailable(reply.text)) {
            return talkAnswer(talkStatus(useSearch ? 'unverified' : 'unavailable', language), false, '', false);
          }
          if (useSearch) {
            const source = talkWebReference(turn.message, reply.sources);
            if (!source) return talkAnswer(talkStatus('unverified', language));
            verifiedReference = externalReference('Open web source', source.url);
            if (source.linkOnly) return talkAnswer(talkStatus('source', language));
            // Tavily does not use the conversation-language instruction. Expose
            // the source rather than reading an unrelated-language snippet aloud.
            if (!talkReplyLocale(reply.text, language) || (requested && languageCode(detectTalkLanguage(reply.text)) !== languageCode(requested))) {
              return talkAnswer(talkStatus('source', language));
            }
          }
          const spoken = shortSpeech(reply.text, reply.locale || language);
          return talkAnswer(spoken, false, reply.locale);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), 18000); }),
      ]);
      clearTimeout(timer);
      signal.throwIfAborted();
      if (answer.notice) {
        session.update({ ...next, questionLocale: previous.questionLocale || (awaitingTalkPlace(next.context) ? language : '') });
        setError(answer.notice);
        return;
      }
      setReference(verifiedReference);
      const spoken = shortSpeech(answer.text, answer.locale || language) || talkStatus('unavailable', language);
      const locale = talkReplyLocale(spoken, requested, answer.locale);
      if (!locale) {
        session.update({ ...next, questionLocale: answer.expectsReply ? language : '' });
        setError('I couldn’t get a reply in the right language. Try again, or use Chat for a written reply.');
        return;
      }
      const update = { ...next, questionLocale: answer.expectsReply ? locale : '' };
      if (understood && answer.remember) session.remember('ai', spoken, update);
      else session.update(update);
      // Remember the question before playing it, so tapping the wave can
      // interrupt playback and answer it without losing the original turn.
      playbackRef.current = spoken;
      const played = await speak(spoken, locale, signal, fromMic);
      continueByVoice = fromMic && answer.expectsReply && played;
      if (!played && !signal.aborted) {
        setError(awaitingTalkPlace(next.context) ? 'The voice reply couldn’t play. Tap the wave to say the city, or type it below.'
          : 'The voice reply couldn’t play. Try again, or use Chat for a written reply.');
      }
    } catch (err) {
      if (!signal.aborted) {
        setError(err.message === 'timed out' ? 'That took too long. Please try again.' : 'I couldn’t answer just now. Please try again.');
        turnController.abort();
      }
    } finally {
      clearTimeout(timer);
      if (turnRef.current === turnController) {
        turnRef.current = null;
        const playback = playbackRef.current;
        playbackRef.current = '';
        setVoiceStopReady(false);
        setWaveLevel(0);
        if (continueByVoice && !signal.aborted) startListening({ followUp: true, playback });
        else {
          browserMicRef.current?.abort();
          setMode('idle');
        }
      }
    }
  }

  async function startListening({ followUp = false, playback = '' } = {}) {
    if (turnRef.current || listeningRef.current) return;
    const local = localMicRef.current;
    const browser = browserMicRef.current;
    const canUseLocal = Boolean(local?.supported);
    setError('');
    setHasInput(false);
    unlockAudio();
    let mic = local;
    const listening = listeningRef.current = {};
    setMode('opening');
    const language = talkMicLocale(navigator.language, session.current.questionLocale || session.current.voiceLocale);
    // On a retry or an incompatible browser, an installed local speech pack
    // may work. Never switch to browser recognition that sends audio off-device.
    if (!canUseLocal || (!followUp && tryInstalledMic.current)) {
      const installed = await browser?.localAvailable(language);
      if (listeningRef.current !== listening) return;
      if (installed) mic = browser;
      else if (!canUseLocal) {
        browser?.abort();
        listeningRef.current = null;
        setError('On-device voice recognition isn’t available here. You can still type below.');
        setMode('idle');
        return;
      }
    }
    const useLocal = mic === local;
    tryInstalledMic.current = false;
    listening.mic = mic;
    setInputEngine(useLocal ? 'local' : 'browser');
    if (useLocal) browser?.abort();
    mic.listen({
      language, followUp, playback, localOnly: !useLocal,
      onStart: () => { if (listeningRef.current === listening) setMode('listening'); },
      onInput: () => { if (listeningRef.current === listening) setHasInput(true); },
      onLevel: setWaveLevel,
      onDecode: (ready) => {
        if (listeningRef.current !== listening) return;
        setWaveLevel(0);
        setHasInput(false);
        setMode(ready ? 'transcribing' : 'preparing');
      },
      onEnd: ({ result, error: micError }) => {
        if (listeningRef.current !== listening) return;
        listeningRef.current = null;
        if (useLocal && /^(?:local-unavailable|decode-(?:failed|timeout))$/.test(micError)) tryInstalledMic.current = true;
        setWaveLevel(0);
        setHasInput(false);
        const transcript = normalizeTalkTranscript(result?.transcript);
        if (!micError && isTalkStop(transcript)) { setMode('idle'); return; }
        if (!micError && /[\p{L}\p{N}]/u.test(transcript)) {
          void askAssistant(transcript, { confidence: result.confidence, uncertain: result.uncertain, inputLocale: result.locale, fromMic: true });
          return;
        }
        setMode('idle');
        setError(micNotice(micError, awaitingTalkPlace(session.current.context)));
      },
    });
  }

  function handleWaveClick() {
    if (mode === 'idle') startListening();
    else if (mode === 'listening' && hasInput) listeningRef.current?.mic?.finishInput();
    else if (mode === 'speaking') {
      const playback = playbackRef.current;
      cancelReply();
      startListening({ playback });
    }
  }

  function clearTalk() {
    stopTurn();
    tryInstalledMic.current = false;
    session.clear();
    setText('');
    setError('');
    setDeviceVoice(false);
    setReference(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!text.trim() || mode === 'thinking') return;
    stopTurn();
    unlockAudio();
    void askAssistant(text);
  }

  const statusText = {
    idle: 'Tap to talk',
    opening: 'Opening microphone…',
    listening: 'Listening…',
    preparing: 'Preparing voice recognition…',
    transcribing: 'Recognizing speech…',
    thinking: 'Thinking with context…',
    speaking: 'Speaking…',
  }[mode];
  const visualLabel = { idle: 'Start AI Talk', opening: 'Opening microphone', listening: hasInput ? 'Finish listening' : 'Listening for speech', preparing: 'Preparing voice recognition', transcribing: 'Recognizing speech', thinking: 'Thinking with context', speaking: 'Interrupt and answer' }[mode];
  const waveEnabled = mode === 'idle' || mode === 'speaking' || (mode === 'listening' && hasInput);
  const inputDisabled = mode === 'thinking';
  const candidate = awaitingTalkPlace(session.current.context) && session.current.context.waiting.candidate;
  const helpText = {
    idle: 'Ask anything naturally. Detailed text conversations remain available in Chat.',
    opening: statusText,
    listening: hasInput ? 'Keep speaking, or tap the wave when you’re done.' : 'Speak now, or type below.',
    preparing: 'First use downloads the voice model (about 77 MB). Your mic is off while it loads.',
    transcribing: 'Working on what you said. Your mic is off.',
    thinking: voiceStopReady ? 'Getting your reply ready. You can tap Stop or say “stop speaking”.' : statusText,
    speaking: voiceStopReady ? 'Tap the wave to answer, or say “stop speaking” to stop.' : 'Tap the wave to answer, or tap Stop.',
  }[mode];

  return (
    <div className="app-shell talk-shell">
      <Header />
      <div className="talk-page">
        <div className="talk-topline">
          <div className="talk-tab-title"><AudioWaveform size={17} /> AI Talk</div>
          <div>
            {mode !== 'idle' && <button type="button" className="talk-stop-button" onClick={stopTurn}><Square size={12} aria-hidden="true" /> Stop</button>}
            <button className="talk-icon-button" onClick={clearTalk} aria-label="Clear talk conversation"><RotateCcw size={16} /></button>
          </div>
        </div>

        <section className="talk-visual-section">
          <button
            ref={visualRef}
            className={`air-visual ${mode}${inputEngine === 'local' ? ' local-input' : ''}`}
            onClick={handleWaveClick}
            aria-label={visualLabel}
            aria-disabled={!waveEnabled}
          >
            <span className="air-vortex" />
            <span className="air-wave">
              <i /><i /><i /><i /><i /><i /><i />
            </span>
            <span className="air-particle p1" />
            <span className="air-particle p2" />
            <span className="air-particle p3" />
            <span className="air-particle p4" />
            <span className="air-particle p5" />
            <span className="air-particle p6" />
            <span className="air-ring r1" />
            <span className="air-ring r2" />
          </button>
          <strong>{statusText}</strong>
          <span className="talk-privacy">{deviceVoice && mode === 'speaking' ? 'Using your browser’s voice because the natural voice is unavailable.' : 'Microphone audio stays on this device.'}</span>
        </section>

        <div className="talk-voice-space" aria-live="polite">
          <span>{helpText}</span>
          {reference && <a className="talk-reference" href={reference.href} target="_blank" rel="noopener noreferrer">{reference.label} <ExternalLink size={13} /></a>}
          {candidate && !inputDisabled && <button type="button" className="talk-confirm-city" onClick={() => {
            stopTurn();
            unlockAudio();
            void askAssistant('Yes');
          }}>Use {candidate.city}</button>}
        </div>

        {error && <div className="talk-error" role="status">{error}</div>}
        <form className="talk-text-form" onSubmit={handleSubmit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Or type and continue the same conversation…" maxLength={TALK_MESSAGE_LIMIT} disabled={inputDisabled} aria-label="AI Talk message" />
          <button type="submit" disabled={!text.trim() || inputDisabled} aria-label="Send Talk message"><Send size={17} /></button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
}
