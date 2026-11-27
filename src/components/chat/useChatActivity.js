import { useEffect, useRef, useState } from 'react';

export function useChatActivity() {
  const active = useRef(null);
  const [status, setStatus] = useState('');

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setStatus('');
  }

  async function run(label, task, onSuccess, onError, timeoutMs) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setStatus(label);
    let timer;
    try {
      let result = task(controller.signal);
      if (timeoutMs) {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('Request timed out'));
            controller.abort();
          }, timeoutMs);
        });
        result = Promise.race([result, deadline]);
      }
      const value = await result;
      if (active.current === controller) onSuccess(value);
    } catch (error) {
      if (active.current === controller) onError(error);
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setStatus('');
      }
    }
  }

  return { status, cancel, run };
}
