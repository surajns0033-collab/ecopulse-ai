import { useState, useRef, useEffect } from 'react';
import { useComposerPhoto } from './useComposerPhoto.js';

export function useChatComposer(onSend, disabled) {

  const [text, setText] = useState('');
  const photo = useComposerPhoto(disabled);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, [text]);

  // Setup SpeechRecognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-IN';

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      setText(transcript);
    };

    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);

    recognitionRef.current = rec;
    return () => rec.abort();
  }, []);

  const handleSend = () => {
    if (disabled || photo.preparing) return;
    const msg = text.trim();
    if (!msg && !photo.imageData) return;
    onSend(msg, photo.imageData);
    setText('');
    photo.clearPhoto();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    if (isListening) {
      rec.stop();
      setIsListening(false);
    } else {
      try {
        rec.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const hasDraft = Boolean(text.trim() || photo.imageData || photo.preparing);
  return { text, setText, photo, isListening, textareaRef, handleSend, handleKeyDown, toggleMic,
    hasDraft, canSend: hasDraft && !disabled && !photo.preparing };
}
