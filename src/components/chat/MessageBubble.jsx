// MessageBubble — renders a single chat message matching reference screenshot
import { Bot } from 'lucide-react';
import { format } from 'date-fns';
import InlineCards from './InlineCards';

export default function MessageBubble({ message, onAction }) {
  const { role, text, cards, actions, timestamp } = message;
  const isAI = role === 'ai' || role === 'assistant';

  const timeStr = timestamp
    ? (() => { try { return format(new Date(timestamp), 'h:mm a'); } catch { return ''; } })()
    : '';

  return (
    <div className={`message-row ${isAI ? 'ai' : 'user'}`}>
      {isAI && (
        <div className="message-avatar" aria-hidden>
          <Bot size={18} color="white" />
        </div>
      )}

      <div className="message-content">
        {text && (
          <div className={isAI ? 'chat-bubble-ai' : 'chat-bubble-user'}>
            <MarkdownText text={text} />
            {!isAI && timeStr && (
              <div className="message-time" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                <span>{timeStr}</span>
                <span className="tick" style={{ color: '#fff' }}>✓✓</span>
              </div>
            )}
          </div>
        )}

        {/* Inline cards */}
        {isAI && cards && cards.length > 0 && (
          <InlineCards cards={cards} onAction={onAction} />
        )}

        {/* Action buttons */}
        {isAI && actions && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {actions.map((action, i) => (
              <button
                key={i}
                className={action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 12, padding: '7px 14px' }}
                onClick={() => onAction && onAction(action.action, action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {isAI && timeStr && !text && <div className="message-time">{timeStr}</div>}
      </div>
    </div>
  );
}

// Simple bold/newline renderer
function MarkdownText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  return (
    <div>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ marginBottom: i < lines.length - 1 && line === '' ? 6 : 0 }}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
              }
              return <span key={j}>{renderLinkedText(part, `${i}-${j}`)}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderLinkedText(text, keyPrefix) {
  return String(text).split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      const cleanUrl = part.replace(/[.,;!?]+$/, '');
      const trailing = part.slice(cleanUrl.length);
      return (
        <span key={`${keyPrefix}-${index}`}>
          <a href={cleanUrl} target="_blank" rel="noopener noreferrer">{cleanUrl}</a>
          {trailing}
        </span>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}
