import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { chatMessage, createWelcomeMessage, dispatchChatAction } from '../components/chat/chatActions.js';
import { RECORD_ACTIONS, recordError } from '../components/chat/chatRecords.js';
import { useChatActivity } from '../components/chat/useChatActivity.js';

function typingLabel(text, photo, choices) {
  if (photo) return 'Analyzing photo… The on-device fallback may download a vision model.';
  if (choices) return 'Explaining your selected plan...';
  if (/^use my location$/i.test(text)) return 'Verifying your device location...';
  if (/aqi|air|pollution/i.test(text)) return 'Checking air quality...';
  if (/event|meetup/i.test(text)) return 'Finding events...';
  if (/report|complaint/i.test(text)) return 'Preparing report...';
  if (/map|route|location/i.test(text)) return 'Loading Google Maps...';
  return 'Thinking...';
}

export function useChatSession() {
  const navigate = useNavigate();
  const { user, communityName, communityNameConfirmed } = useAuth();
  const app = useApp();
  const { conversation, addMessage, chosenLocation, location, pendingAction } = app;
  const { status, run, cancel } = useChatActivity();

  useEffect(() => {
    if (!conversation.length) addMessage(createWelcomeMessage(user));
  }, [conversation.length, user, addMessage]);

  const reply = data => addMessage(chatMessage('ai', data));

  function sendMessage(text, imageData, { photoLocation, planChoices } = {}) {
    if (!text && !imageData) return;
    const task = async signal => {
      addMessage(chatMessage('user', { text: text || '📸 [Image attached]' }));
      const history = planChoices ? [] : conversation.map(({ role, text }) => ({ role, text }));
      const { processMessage } = await import('../agent/agentOrchestrator');
      signal.throwIfAborted();
      return processMessage(text, history, user, location, imageData, pendingAction, { chosenLocation, photoLocation, planChoices, signal });
    };
    const receive = response => {
      if (response.resolvedLocation) app.setLocation(response.resolvedLocation);
      if (response.chosenLocation) app.setChosenLocation(response.chosenLocation);
      if (!planChoices) app.setPendingAction(response.pending ? {
        type: response.pending, location: response.resolvedLocation || location, ...response.pendingData,
      } : null);
      reply(response);
    };
    return run(typingLabel(text, imageData, planChoices), task, receive, error => {
      reply({ text: error?.message === 'Request timed out' ? 'That took longer than expected. Please try again.' : 'Something went wrong on my side. Please try again.' });
    }, imageData ? 180000 : 45000);
  }

  function save(action, data) {
    if (!user || !data) return;
    const operation = RECORD_ACTIONS[action];
    return run(operation.status, () => operation.save(user, data, communityNameConfirmed ? communityName : null), reply, error => reply(recordError(action, error, user, data)));
  }

  function handleRefresh() {
    cancel();
    app.clearConversation();
    app.setPendingAction(null);
    app.setLocation(chosenLocation);
  }

  const handleAction = (action, data) => dispatchChatAction(action, data, { send: sendMessage, reply, navigate, save });
  return { conversation, handleAction, handleRefresh, sendMessage, typingStatus: status, isTyping: Boolean(status) };
}
