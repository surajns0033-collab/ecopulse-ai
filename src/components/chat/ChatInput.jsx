import { Image, Send, Mic, X, MicOff } from 'lucide-react';
import { useChatComposer } from './useChatComposer.js';

export default function ChatInput({ onSend, disabled }) {

  const { text, setText, photo, isListening, textareaRef, handleSend, handleKeyDown, toggleMic,
    hasDraft, canSend } = useChatComposer(onSend, disabled);
  const { imageError, imageData, clearPhoto, fileRef, handleImageFile, preparing } = photo;

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
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        style={{ display: 'none' }}
        onChange={handleImageFile}
      />

      {/* Input wrapper */}
      <div className="input-wrapper">
        {preparing && <span role="status">Preparing photo…</span>}
        {imageError && <span role="alert" className="photo-input-error">{imageError}</span>}
        {imageData && (
          <div className="image-preview-chip">
            <img src={imageData.preview} alt="Selected" />
            <span>Image attached</span>
            <button onClick={clearPhoto} aria-label="Remove image">
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
      {hasDraft ? (
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
