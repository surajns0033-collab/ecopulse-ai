import { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, AudioWaveform } from 'lucide-react';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { processMessage } from '../agent/agentOrchestrator';
import { DEFAULT_LOCATION } from '../services/environmentalData';
import { getVoiceResponse, isAIUnavailable } from '../services/geminiService';

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
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [speechPulse, setSpeechPulse] = useState(false);
  const recognitionRef = useRef(null);
  const pendingActionRef = useRef(null);
  const voiceListRef = useRef([]);
  const speechLanguageRef = useRef(
    typeof navigator !== 'undefined' && /^(?:hi|mr|en)-/i.test(navigator.language)
      ? navigator.language
      : 'en-IN'
  );
  const messagesRef = useRef([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length) voiceListRef.current = available;
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  function cleanSpeech(textValue) {
    return String(textValue || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*#_`•]/g, ' ')
      .replace(/\p{Extended_Pictographic}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function shortFallback(textValue) {
    const clean = cleanSpeech(textValue);
    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
    return sentences.slice(0, 2).join(' ').trim();
  }

  function spokenReply(rawAnswer, response) {
    const clean = cleanSpeech(rawAnswer);
    const sentenceCount = (clean.match(/[.!?]+/g) || []).length;
    if (clean.length <= 260 && sentenceCount <= 2 && !/\bDirect impact:/i.test(rawAnswer)) return clean;
    if (response?.pending === 'SMOG_PLAN_AWAITING_PROFILE') {
      return 'Tell me your usual commute, daily routine, cooking setup, air cleaning, and whether children, older adults, or anyone with heart or lung sensitivity is at home.';
    }
    const aqi = response?.cards?.find((card) => card.type === 'aqi')?.data;
    if (aqi?.aqi != null) {
      const priority = clean.match(/Top priority:?\s*([^.!?]+[.!?]?)/i)?.[1];
      return `Your current AQI is ${aqi.aqi}. ${priority ? `Your top priority is ${priority}` : shortFallback(clean)}`;
    }
    return shortFallback(clean);
  }

  function speak(answer) {
    if (!window.speechSynthesis || !answer) {
      setMode('idle');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer.replace(/[*#_`]/g, ''));
    utterance.lang = /[\u0900-\u097F]/.test(answer) ? speechLanguageRef.current : 'en-IN';
    const voices = voiceListRef.current.length ? voiceListRef.current : window.speechSynthesis.getVoices();
    const languageRoot = utterance.lang.slice(0, 2).toLowerCase();
    const scored = voices
      .filter((voice) => voice.lang.toLowerCase().startsWith(languageRoot))
      .map((voice) => {
        let score = 0;
        const name = voice.name.toLowerCase();
        if (voice.lang.toLowerCase() === utterance.lang.toLowerCase()) score += 30;
        if (/natural|neural/.test(name)) score += 120;
        if (/google/.test(name)) score += 85;
        if (/google uk english female/.test(name)) score += 35;
        if (/google हिन्दी/.test(voice.name)) score += 35;
        if (/female|zira|heera|kalpana/.test(name)) score += 8;
        if (/microsoft david/.test(name)) score -= 30;
        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);
    const preferred = scored[0]?.voice;
    if (preferred) utterance.voice = preferred;
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    utterance.onstart = () => setMode('speaking');
    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.charLength > 0) {
        setSpeechPulse((current) => !current);
      }
    };
    utterance.onend = () => { setSpeechPulse(false); setMode('idle'); };
    utterance.onerror = () => { setSpeechPulse(false); setMode('idle'); };
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
    setText('');
    setMode('thinking');
    try {
      const history = messagesRef.current.map((message) => ({ role: message.role, text: message.text }));
      const needsTools = Boolean(pendingActionRef.current) || /\b(aqi|air quality|weather|smog|pollution|pm2\.5|pm10|map|location|complaint|report|authority|garbage|dumping|burning|sewage|naala|tree cutting|parking|latest|search the web)\b/i.test(cleaned);
      let response;
      if (needsTools) {
        response = await Promise.race([
          processMessage(cleaned, history, user, location || DEFAULT_LOCATION, null, pendingActionRef.current),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Talk request timed out')), 40000)),
        ]);
      } else {
        const voiceText = await Promise.race([
          getVoiceResponse([...history, userMessage], { timeoutMs: 18000, maxTokens: 500 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Talk request timed out')), 25000)),
        ]);
        response = isAIUnavailable(voiceText)
          ? await processMessage(cleaned, history, user, location || DEFAULT_LOCATION, null, pendingActionRef.current)
          : { text: voiceText, cards: [], status: 'success' };
      }
      if (response.resolvedLocation) setLocation(response.resolvedLocation);
      if (response.pending) {
        pendingActionRef.current = { type: response.pending, city: (location || DEFAULT_LOCATION).city };
      } else if (['success', 'preview', 'info', 'unavailable'].includes(response.status)) {
        pendingActionRef.current = null;
      }
      const responseText = response.text || 'I’m listening.';
      const factualAnswer = `${responseText}${cardSpeech(response.cards, responseText)}`.trim();
      const answer = spokenReply(factualAnswer, response);
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
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += transcript;
      }
      // Deliberately no transcript is rendered in voice mode.
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
    setSpeechPulse(false);
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
            <button className="talk-icon-button" onClick={clearTalk} aria-label="Clear talk conversation"><RotateCcw size={16} /></button>
          </div>
        </div>

        <section className="talk-visual-section">
          <button
            className={`air-visual ${mode}${speechPulse ? ' pulse' : ''}`}
            onClick={mode === 'listening' ? stopListening : mode === 'idle' ? startListening : undefined}
            disabled={mode === 'thinking' || mode === 'speaking'}
            aria-label={mode === 'listening' ? 'Stop listening' : 'Start AI Talk'}
          >
            <span className="air-vortex" />
            <span className={`air-wave${speechPulse ? ' pulse' : ''}`}>
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
          <span className="talk-privacy">Speak naturally. EcoPulse follows the language in your words and does not save audio recordings.</span>
        </section>

        <div className="talk-voice-space" aria-live="polite">
          <span>{mode === 'idle' ? 'Ask anything naturally. Detailed text conversations remain available in Chat.' : statusText}</span>
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
