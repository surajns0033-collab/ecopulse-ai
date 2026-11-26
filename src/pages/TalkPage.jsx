import { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, AudioWaveform, ExternalLink, Square } from 'lucide-react';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { processMessage } from '../agent/agentOrchestrator';
import { emptyTalkContext, resolveTalkTurn } from '../agent/talkContext';
import { shortSpeech, talkStatus, talkWebReference, toolSpeech } from '../agent/talkReply';
import { playBrowserVoice, playNeuralVoice, speechLanguage } from '../services/talkAudio';
import { createTalkMic, isTalkStop } from '../services/talkMic';
import { getVoiceResponse, isAIUnavailable } from '../services/geminiService';

const fallbackLanguage = () => navigator.language?.startsWith('en') ? navigator.language : 'en-IN';
const micLanguage = () => navigator.language || 'en-IN';
const talkAnswer = (text, expectsReply = false) => ({ text, expectsReply });

function externalReference(label, value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? { label, href: url.href } : null;
  } catch { return null; }
}

export default function TalkPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState('idle'); // idle | opening | listening | thinking | speaking
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [deviceVoice, setDeviceVoice] = useState(false);
  const [voiceStopReady, setVoiceStopReady] = useState(false);
  const [reference, setReference] = useState(null);
  const visualRef = useRef(null);
  const audioRef = useRef(null);
  const turnRef = useRef(null);
  const micRef = useRef(null);
  const talkContext = useRef(emptyTalkContext());
  const pending = useRef(null);
  const historyRef = useRef([]);
  const replyLocaleRef = useRef(fallbackLanguage());

  useEffect(() => {
    const mic = createTalkMic(window.SpeechRecognition || window.webkitSpeechRecognition);
    micRef.current = mic;
    window.speechSynthesis?.getVoices();
    return () => {
      mic.abort();
      micRef.current = null;
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
    // Open the command listener as the audio is prepared so a short reply can
    // still be interrupted. A typed turn never activates the mic on its own.
    const mic = micRef.current;
    if (fromMic && mic?.supported) mic.listen({
      language: micLanguage(), playback: answer, onStop: stopTurn,
      onStart: () => setVoiceStopReady(true), onEnd: () => setVoiceStopReady(false),
    });
    const options = {
      signal,
      onLevel: setWaveLevel,
      onStart: () => { if (!signal.aborted) setMode('speaking'); },
    };
    const cloud = await playNeuralVoice(audioRef.current, answer, options);
    if (cloud || signal.aborted) return cloud;
    const local = await playBrowserVoice(answer, speechLanguage(answer, language), {
      ...options, onStart: () => { setDeviceVoice(true); options.onStart(); },
    });
    if (!local && !signal.aborted) setError('Speech couldn’t play. Try again, or use Chat for a written reply.');
    return local;
  }

  function stopTurn() {
    micRef.current?.abort();
    const turn = turnRef.current;
    turnRef.current = null;
    turn?.abort();
    setVoiceStopReady(false);
    setWaveLevel(0);
    setMode('idle');
  }

  async function askAssistant(userText, { confidence, fromMic = false } = {}) {
    const cleaned = String(userText || '').trim();
    if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned) || turnRef.current) return;
    const turnController = new AbortController();
    const { signal } = turnController;
    turnRef.current = turnController;
    setError('');
    setDeviceVoice(false);
    setReference(null);
    setText('');
    setMode('thinking');
    const detectedLanguage = speechLanguage(cleaned, '');
    const language = detectedLanguage || replyLocaleRef.current;
    let timer, continueByVoice;
    try {
      const history = historyRef.current;
      const { text: replyText, expectsReply } = await Promise.race([
        (async () => {
          const turn = await resolveTalkTurn(cleaned, talkContext.current, { confidence, fromMic, language: language.split('-')[0], history, pending: pending.current, signal });
          signal.throwIfAborted();
          if (!(confidence > 0 && confidence < .55)) replyLocaleRef.current = language;
          talkContext.current = turn.context;
          if (turn.kind === 'reply') return talkAnswer(turn.text, turn.expectsReply);
          if (turn.kind === 'map') {
            const { city, lat, lng } = turn.location;
            setReference(externalReference('Open map', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`));
            if (language.startsWith('hi')) return talkAnswer(`${city} मिल गया। नीचे नक्शा खोल सकते हैं।`);
            if (language.startsWith('mr')) return talkAnswer(`${city} सापडलं. खाली नकाशा उघडू शकता.`);
            return talkAnswer(`I found ${city}. You can open the map below.`);
          }
          if (turn.kind === 'tool') {
            const result = await processMessage(turn.message, history, user, turn.location, null, turn.pending, { voiceIntent: turn.intent, signal });
            signal.throwIfAborted();
            if (result.pending) pending.current = { action: { type: result.pending }, intent: turn.intent, location: turn.location };
            else if (turn.pending || pending.current?.intent === turn.intent) pending.current = null;
            const contact = result.speechData?.contact;
            if (contact?.portal) setReference(externalReference(contact.national ? 'Official national portal' : 'Official contact', contact.source || contact.portal));
            else {
              const reading = result.speechData?.weather || result.cards?.find(({ type }) => type === 'aqi')?.data;
              if (reading?.sourceUrl) setReference(externalReference(reading.source, reading.sourceUrl));
            }
            return talkAnswer(toolSpeech(result, turn, language), Boolean(result.pending));
          }

          // Normal conversation has no inferred location or previous tool results.
          const useSearch = turn.kind === 'web';
          const query = turn.location ? `${turn.message}\nSearch this area: ${turn.location.city}` : turn.message;
          const userMessage = { role: 'user', text: query };
          const reply = await getVoiceResponse([...(useSearch ? [] : history), userMessage], { signal, useSearch, language: detectedLanguage });
          signal.throwIfAborted();
          if (!reply || isAIUnavailable(reply.text)) {
            return talkAnswer(talkStatus(useSearch ? 'unverified' : 'unavailable', language));
          }
          if (useSearch) {
            const source = talkWebReference(turn.message, reply.sources);
            if (!source) return talkAnswer(talkStatus('unverified', language));
            setReference(externalReference('Open web source', source.url));
            if (source.linkOnly) return talkAnswer(talkStatus('source', language));
            // Tavily does not use the conversation-language instruction. Expose
            // the source rather than reading an unrelated-language snippet aloud.
            const replyLanguage = speechLanguage(reply.text, '');
            if (replyLanguage && detectedLanguage && replyLanguage.split('-')[0] !== detectedLanguage.split('-')[0]) {
              return talkAnswer(talkStatus('source', language));
            }
          }
          const spoken = shortSpeech(reply.text, language);
          if (!useSearch && spoken) historyRef.current = [...history, userMessage, { role: 'ai', text: spoken }].slice(-8);
          return talkAnswer(spoken, !useSearch && /[?？؟][”’"')]*$/u.test(spoken));
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), 18000); }),
      ]);
      clearTimeout(timer);
      if (!signal.aborted) {
        const spoken = shortSpeech(replyText, language);
        const played = await speak(spoken || talkStatus('unavailable', language), language, signal, fromMic);
        continueByVoice = fromMic && expectsReply && Boolean(spoken) && played;
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
        micRef.current?.abort();
        setVoiceStopReady(false);
        setWaveLevel(0);
        if (continueByVoice && !signal.aborted) startListening({ followUp: true });
        else setMode('idle');
      }
    }
  }

  function startListening({ followUp = false } = {}) {
    if (turnRef.current) return;
    const mic = micRef.current;
    if (!mic?.supported) {
      setError('Voice recognition is not supported in this browser. You can still type below.');
      setMode('idle');
      return;
    }
    setError('');
    unlockAudio();
    setMode('opening');
    mic.listen({
      language: micLanguage(), followUp,
      onStart: () => setMode('listening'),
      onEnd: ({ result, error: micError }) => {
        const transcript = result?.transcript;
        if (!micError && /[\p{L}\p{N}]/u.test(transcript || '') && !isTalkStop(transcript)) {
          void askAssistant(transcript, { confidence: result.confidence, fromMic: true });
          return;
        }
        setMode('idle');
        if (micError === 'not-allowed' || micError === 'service-not-allowed') {
          setError('The browser blocked voice recognition. Check microphone permissions or type below.');
        } else if (micError && micError !== 'no-speech') {
          setError('I couldn’t use the mic just now. Tap to try again or type below.');
        }
      },
    });
  }

  function handleWaveClick() {
    if (mode === 'idle') startListening();
    else if (mode === 'listening') micRef.current?.finishInput();
    else {
      stopTurn();
      if (mode === 'speaking') startListening();
    }
  }

  function clearTalk() {
    stopTurn();
    historyRef.current = [];
    talkContext.current = emptyTalkContext();
    pending.current = null;
    replyLocaleRef.current = fallbackLanguage();
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
    thinking: 'Thinking with context…',
    speaking: 'Speaking…',
  }[mode];
  const visualLabel = { idle: 'Start AI Talk', opening: 'Cancel listening', listening: 'Finish listening', thinking: 'Cancel reply', speaking: 'Interrupt and answer' }[mode];
  const inputDisabled = mode === 'thinking';
  const helpText = {
    idle: 'Ask anything naturally. Detailed text conversations remain available in Chat.',
    opening: statusText,
    listening: 'Speak now, or type below.',
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
            className={`air-visual ${mode}`}
            onClick={handleWaveClick}
            aria-label={visualLabel}
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
          <span className="talk-privacy">{deviceVoice ? (mode === 'speaking' ? 'Using your browser’s voice because the natural voice is unavailable.' : 'The last reply used your browser’s voice.') : 'Speak naturally. EcoPulse doesn’t save microphone recordings.'}</span>
        </section>

        <div className="talk-voice-space" aria-live="polite">
          <span>{helpText}</span>
          {reference && <a className="talk-reference" href={reference.href} target="_blank" rel="noopener noreferrer">{reference.label} <ExternalLink size={13} /></a>}
        </div>

        {error && <div className="talk-error">{error}</div>}
        <form className="talk-text-form" onSubmit={handleSubmit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Or type and continue the same conversation…" disabled={inputDisabled} aria-label="AI Talk message" />
          <button type="submit" disabled={!text.trim() || inputDisabled} aria-label="Send Talk message"><Send size={17} /></button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
}
