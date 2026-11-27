import { useEffect, useRef } from 'react';
import Header from '../components/chat/Header';
import MessageBubble from '../components/chat/MessageBubble';
import QuickActions from '../components/chat/QuickActions';
import ChatInput from '../components/chat/ChatInput';
import BottomNav from '../components/BottomNav';
import { useChatSession } from './useChatSession.js';

export default function ChatPage() {
  const { conversation, isTyping, typingStatus, handleAction, handleRefresh, sendMessage } = useChatSession();
  const messagesEndRef = useRef(null);
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth' });
  }, [conversation, isTyping]);

  return (
    <div className="app-shell">
      <Header onRefresh={handleRefresh} />

      <main className="chat-scroll-area" aria-label="Chat" tabIndex={0}>
        <div role="log" aria-label="Chat messages" aria-relevant="additions">
        {conversation.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onAction={handleAction}
          />
        ))}

        {isTyping && (
          <div className="typing-indicator" aria-hidden="true">
            <div className="message-avatar">
              <span style={{ fontSize: 14 }}>🤖</span>
            </div>
            <div>
              <div className="typing-bubble">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
              <div className="status-text">{typingStatus}</div>
            </div>
          </div>
        )}

        </div>
        <div ref={messagesEndRef} />
      </main>
      <div className="chat-visually-hidden" role="status">{isTyping ? typingStatus : ''}</div>

      <QuickActions
        onMessage={(msg) => sendMessage(msg, null)}
        onCommand={(action) => handleAction(action)}
      />
      <ChatInput onSend={sendMessage} disabled={isTyping} />
      <BottomNav />
    </div>
  );
}
