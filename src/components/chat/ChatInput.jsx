// ChatInput — input bar with image upload, text input, and mic button
import { useState, useRef, useEffect } from 'react';
import { Image, Send, Mic, X, MicOff } from 'lucide-react';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState(null); // { base64, mimeType, preview }
  const [isListening, setIsListening] = useState(false);
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
    onSend(msg, imageData);
    setText('');
    setImageData(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const image = new window.Image();
      image.onload = () => {
        const maxDimension = 1280;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        // JPEG dramatically reduces OCR/vision transfer time while preserving
        // enough detail for signs, number plates and environmental evidence.
        const optimizedUrl = canvas.toDataURL('image/jpeg', 0.86);
        const [, base64] = optimizedUrl.split(',');
        setImageData({ base64, mimeType: 'image/jpeg', preview: optimizedUrl });
      };
      image.onerror = () => {
        const [header, base64] = String(dataUrl).split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        setImageData({ base64, mimeType, preview: dataUrl });
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset
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
      } catch (_) {
        setIsListening(false);
      }
    }
  };

  const canSend = (text.trim() || imageData) && !disabled;

  return (
    <div className="chat-input-bar">
      {/* Image upload button */}
      <button
        className="input-icon-btn"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        aria-label="Upload image"
      >
        <Image size={20} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFile}
      />

      {/* Input wrapper */}
      <div className="input-wrapper">
        {/* Image preview chip */}
        {imageData && (
          <div className="image-preview-chip">
            <img src={imageData.preview} alt="Selected" />
            <span>Image attached</span>
            <button onClick={() => setImageData(null)} aria-label="Remove image">
              <X size={12} />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="chat-text-input"
          placeholder="Ask anything about environment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={1}
          aria-label="Message input"
        />
      </div>

      {/* Send or Mic button */}
      {canSend ? (
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      ) : (
        <button
          className={`mic-btn${isListening ? ' listening' : ''}`}
          onClick={toggleMic}
          aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        >
          {isListening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      )}
    </div>
  );
}
