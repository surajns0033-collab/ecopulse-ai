import { canonicalTalkLocale } from './talkLanguage.js';

const KEY = 'echopulse_talk_session_v1';
export const TALK_HISTORY_LIMIT = 12;
export const TALK_MESSAGE_LIMIT = 1600;

const empty = () => ({ history: [], context: null, pending: null, questionLocale: '', voiceLocale: '' });
let revision = 0;

function browserStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

function cleanMessage(role, text) {
  if ((role !== 'user' && role !== 'ai') || typeof text !== 'string') return null;
  const value = text.trim().slice(0, TALK_MESSAGE_LIMIT);
  return value ? { role, text: value } : null;
}

export function clearTalkSession(storage = browserStorage()) {
  revision += 1;
  try { storage?.removeItem(KEY); } catch { /* storage can be disabled */ }
}

// Per-account, per-tab continuity. Never store audio, contact/account fields,
// or entire tool results here. Only bounded text and the small Talk state.
export function createTalkSession(owner, storage = browserStorage()) {
  let sessionRevision = revision;
  let value = empty();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    if (owner && saved?.owner === owner && Array.isArray(saved.history)) {
      value = {
        history: saved.history.slice(-TALK_HISTORY_LIMIT).map((m) => cleanMessage(m?.role, m?.text)).filter(Boolean),
        context: saved.context?.waiting !== undefined && saved.context?.chosenLocation !== undefined ? saved.context : null,
        pending: typeof saved.pending?.intent === 'string' ? saved.pending : null,
        questionLocale: canonicalTalkLocale(saved.questionLocale),
        voiceLocale: canonicalTalkLocale(saved.voiceLocale),
      };
    }
  } catch { /* malformed or unavailable storage starts a fresh thread */ }

  function save(patch, message) {
    // A pending reply must not recreate private storage after sign-out.
    if (sessionRevision !== revision) return;
    value = { ...value, ...patch };
    if (message) value.history = [...value.history, message].slice(-TALK_HISTORY_LIMIT);
    try { if (owner) storage?.setItem(KEY, JSON.stringify({ owner, ...value })); } catch { /* keep the in-memory thread */ }
  }

  return {
    get current() { return sessionRevision === revision ? value : empty(); },
    update: (patch) => save(patch),
    remember: (role, text, patch) => save(patch, cleanMessage(role, text)),
    clear() {
      value = empty();
      clearTalkSession(storage);
      sessionRevision = revision;
    },
  };
}
