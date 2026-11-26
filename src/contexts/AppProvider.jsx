import { useState } from 'react';
import { AppContext } from './AppContext';

export function AppProvider({ children }) {
  const [location, setLocation] = useState(null); // { lat, lng, city }
  const [chosenLocation, setChosenLocation] = useState(null); // user's explicit local city for Chat
  const [conversation, setConversation] = useState([]);
  const [pendingAction, setPendingAction] = useState(null); // current agent action being confirmed

  const addMessage = (msg) => {
    setConversation((prev) => {
      if (msg.id && prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, { ...msg, id: msg.id || Date.now() + Math.random() }];
    });
  };

  const updateLastMessage = (updater) => {
    setConversation((prev) => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = updater(updated[updated.length - 1]);
      }
      return updated;
    });
  };

  const clearConversation = () => setConversation([]);

  return (
    <AppContext.Provider value={{
      location,
      setLocation,
      chosenLocation,
      setChosenLocation,
      conversation,
      setConversation,
      addMessage,
      updateLastMessage,
      clearConversation,
      pendingAction,
      setPendingAction,
    }}>
      {children}
    </AppContext.Provider>
  );
}
