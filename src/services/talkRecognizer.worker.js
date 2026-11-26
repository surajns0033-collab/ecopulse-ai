import { loadTalkRecognizer } from './talkRecognizer.js';

let loading;

// Keep the stall deadline alive while files are arriving. No progress UI.
let lastActivity = -Infinity;
function reportLoadActivity({ status, loaded }) {
  if (status !== 'done' && (status !== 'progress' || !(loaded > 0))) return;
  const now = performance.now();
  if (now - lastActivity < 1000) return;
  lastActivity = now;
  self.postMessage({ type: 'load-activity' });
}

self.onmessage = async ({ data }) => {
  try {
    if (!loading) loading = loadTalkRecognizer('wasm', reportLoadActivity).then((recognize) => {
      self.postMessage({ type: 'ready' });
      return recognize;
    });
    const recognize = await loading;
    if (data.type === 'transcribe') {
      const result = await recognize(data.audio);
      self.postMessage({ type: 'result', id: data.id, result });
    }
  } catch {
    self.postMessage({ type: 'failed' });
  } finally {
    data.audio?.fill(0);
  }
};
