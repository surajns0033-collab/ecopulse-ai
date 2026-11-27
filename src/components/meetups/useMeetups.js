import { useEffect, useState } from 'react';
import { meetupErrorMessage, subscribeMeetups } from '../../services/meetups';

const empty = { events: [], joinedIds: new Set(), loading: true, error: '' };

export function useMeetups(userId) {
  const [state, setState] = useState(empty);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!userId) return;
    return subscribeMeetups(userId,
      data => setState({ ...data, userId, attempt, loading: false, error: '' }),
      error => setState({ ...empty, userId, attempt, loading: false, error: meetupErrorMessage(error) }),
    );
  }, [userId, attempt]);
  return { ...(state.userId === userId && state.attempt === attempt ? state : empty), retry: () => setAttempt(n => n + 1) };
}
