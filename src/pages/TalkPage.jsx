import { useEffect, useRef, useState } from 'react';
import { MicOff, Send, Volume2, VolumeX, RotateCcw, Wind, Sparkles, AudioWaveform } from 'lucide-react';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { processMessage } from '../agent/agentOrchestrator';
import { DEFAULT_LOCATION } from '../services/environmentalData';

function cardSpeech(cards = [], existingText = '') {
  if (/\bAQI\b/i.test(existingText)) return '';
  const aqi = cards.find((card) => card.type === 'aqi')?.data;
  if (aqi?.aqi != null) return ` Current AQI is ${aqi.aqi}. PM 2.5 is ${aqi.pm25 ?? 'unavailable'} micrograms per cubic metre.`;
  const weather = cards.find((card) => card.type === 'weather')?.data;
  if (weather?.temp != null) return ` Current temperature is ${weather.temp} degrees Celsius.`;
  return '';
}

export default function TalkPage() {
  const { user } = useAuth();
  const { location, setLocation } = useApp();
  const [mode, setMode] = useState('idle'); // idle | listening | thinking | speaking
  const [interim, setInterim] = useState('');
  const [messages, setMessages] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const pendingActionRef = useRef(null);
  const speechLanguageRef = useRef(
    typeof navigator !== 'undefined' && /^(?:hi|mr|en)-/i.test(navigator.language)
      ? navigator.language
      : 'en-IN'
  );
  const messagesRef = useRef([]);
  const endRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interim]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
  }, []);

  function speak(answer) {
    if (!voiceEnabled || !window.speechSynthesis || !answer) {
      setMode('idle');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer.replace(/[*#_`]/g, ''));
    utterance.lang = /[\u0900-\u097F]/.test(answer) ? speechLanguageRef.current : 'en-IN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setMode('speaking');
    utterance.onend = () => setMode('idle');
    utterance.onerror = () => setMode('idle');
    window.speechSynthesis.speak(utterance);
  }

  async function askAssistant(userText) {
    const cleaned = String(userText || '').trim();
    if (!cleaned || mode === 'thinking') return;
    setError('');
    window.speechSynthesis?.cancel();
    const userMessage = { role: 'user', text: cleaned };
    const next = [...messagesRef.current, userMessage];
    setMessages(next);
    setInterim('');
    setText('');
    setMode('thinking');
    try {
      const history = messagesRef.current.map((message) => ({ role: message.role, text: message.text }));
      const response = await Promise.race([
        processMessage(cleaned, history, user, location || DEFAULT_LOCATION, null, pendingActionRef.current),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Talk request timed out')), 45000)),
      ]);
      if (response.resolvedLocation) setLocation(response.resolvedLocation);
      if (response.pending) {
        pendingActionRef.current = { type: response.pending, city: (location || DEFAULT_LOCATION).city };
      } else if (['success', 'preview', 'info', 'unavailable'].includes(response.status)) {
        pendingActionRef.current = null;
      }
      const responseText = response.text || 'I’m listening.';
      const answer = `${responseText}${cardSpeech(response.cards, responseText)}`.trim();
      const aiMessage = { role: 'ai', text: answer };
      setMessages((current) => [...current, aiMessage]);
      speak(answer);
    } catch (err) {
      setMode('idle');
      setError(err?.message === 'Talk request timed out' ? 'That took too long. Please try again.' : 'I could not answer that just now. Please try once more.');
    }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice recognition is not supported in this browser. You can still type below.');
      return;
    }
    setError('');
    window.speechSynthesis?.cancel();
    let finalText = '';
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = speechLanguageRef.current;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setMode('listening');
    recognition.onresult = (event) => {
      let liveText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += transcript;
        else liveText += transcript;
      }
      setInterim(finalText || liveText);
    };
    recognition.onerror = (event) => {
      setMode('idle');
      setError(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings or type below.' : 'I could not hear that clearly. Please try again.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (finalText.trim()) {
        if (/[\u0900-\u097F]/.test(finalText)) {
          speechLanguageRef.current = /\b(?:आहे|नाही|मला|तुम्ही|काय|आणि)\b/.test(finalText) ? 'mr-IN' : 'hi-IN';
        } else {
          speechLanguageRef.current = 'en-IN';
        }
        askAssistant(finalText);
      }
      else setMode('idle');
    };
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
  }

  function clearTalk() {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    setMessages([]);
    pendingActionRef.current = null;
    setInterim('');
    setError('');
    setMode('idle');
  }

  function handleSubmit(event) {
    event.preventDefault();
    askAssistant(text);
  }

  const statusText = {
    idle: 'Tap to talk',
    listening: 'Listening…',
    thinking: 'Thinking with context…',
    speaking: 'Speaking…',
  }[mode];

  return (
    <div className="app-shell talk-shell">
      <Header />
      <div className="talk-page">
        <div className="talk-topline">
          <div className="talk-tab-title"><AudioWaveform size={17} /> AI Talk</div>
          <div>
            <button className="talk-icon-button" onClick={() => { setVoiceEnabled((current) => !current); window.speechSynthesis?.cancel(); }} aria-label={voiceEnabled ? 'Mute AI voice' : 'Enable AI voice'}>
              {voiceEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button className="talk-icon-button" onClick={clearTalk} aria-label="Clear talk conversation"><RotateCcw size={16} /></button>
          </div>
        </div>

        <section className="talk-orb-section">
          <button
            className={`air-visual ${mode}`}
            onClick={mode === 'listening' ? stopListening : mode === 'idle' ? startListening : undefined}
            disabled={mode === 'thinking' || mode === 'speaking'}
            aria-label={mode === 'listening' ? 'Stop listening' : 'Start AI Talk'}
          >
            <span className="air-dot-field" />
            <span className="air-flow one" />
            <span className="air-flow two" />
            <span className="air-flow three" />
            <span className="air-particle p1" />
            <span className="air-particle p2" />
            <span className="air-particle p3" />
            <span className="air-particle p4" />
            <span className="air-particle p5" />
            <span className="air-particle p6" />
            <span className="air-visual-core">{mode === 'listening' ? <MicOff size={30} /> : mode === 'thinking' ? <Sparkles size={30} /> : <Wind size={32} />}</span>
            <span className="air-ring r1" />
            <span className="air-ring r2" />
          </button>
          <strong>{statusText}</strong>
          <span className="talk-privacy">Speak naturally. EcoPulse follows the language in your words and does not save audio recordings.</span>
          {interim && <div className="talk-interim">“{interim}”</div>}
        </section>

        <div className="talk-transcript" aria-live="polite">
          {messages.length === 0 ? (
            <div className="talk-empty">Ask anything—daily life, planning, smog precautions, AQI, complaints, or a general question.</div>
          ) : messages.map((message, index) => (
            <div className={`talk-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && <div className="talk-error">{error}</div>}
        <form className="talk-text-form" onSubmit={handleSubmit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Or type and continue the same conversation…" disabled={mode === 'thinking'} aria-label="AI Talk message" />
          <button type="submit" disabled={!text.trim() || mode === 'thinking'} aria-label="Send Talk message"><Send size={17} /></button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
}
