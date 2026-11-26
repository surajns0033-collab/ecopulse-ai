import { loadTalkRecognizer } from './talkRecognizer.js';

let loading;

self.onmessage = async ({ data }) => {
  try {
    if (!loading) loading = loadTalkRecognizer().then((recognize) => {
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
