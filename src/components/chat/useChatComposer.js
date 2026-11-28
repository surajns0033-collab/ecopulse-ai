import { useState, useRef, useEffect } from 'react';

export function useChatComposer(onSend, disabled) {

  const [text, setText] = useState('');
  const [imageData, setImageData] = useState(null); // { base64, mimeType, preview }
  const [isListening, setIsListening] = useState(false);
  const [imageError, setImageError] = useState('');
  const photoRequest = useRef(0);
  useEffect(() => () => { photoRequest.current++; }, []);
  const fileRef = useRef(null);
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

  // Welcome/quick-action buttons can open the same image picker while keeping
  // the normal text box available. The custom event fires within the user's
  // button click, so browsers treat it as an intentional file-picker action.
  useEffect(() => {
    const openPicker = () => {
      if (!disabled) fileRef.current?.click();
    };
    window.addEventListener('ecopulse:open-image-picker', openPicker);
    return () => window.removeEventListener('ecopulse:open-image-picker', openPicker);
  }, [disabled]);

  const handleSend = () => {
    if (disabled) return;
    const msg = text.trim();
    if (!msg && !imageData) return;
    photoRequest.current++;
    setImageError('');
    onSend(msg, imageData);
    setText('');
    setImageData(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const request = ++photoRequest.current;
    setImageError('');
    setImageData(null);
    try {
      const { prepareComposerPhoto } = await import('../../services/composerPhoto.js');
      const prepared = await prepareComposerPhoto(file);
      if (request === photoRequest.current) setImageData(prepared);
    } catch (error) {
      if (request === photoRequest.current) setImageError(error.message || 'Could not prepare this photo.');
    }
  }

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

  const canSend = (text.trim() || imageData) && !disabled;

  return { text, setText, imageError, imageData, setImageData, isListening, fileRef, textareaRef, handleSend, handleKeyDown, handleImageFile, toggleMic, canSend };
}
