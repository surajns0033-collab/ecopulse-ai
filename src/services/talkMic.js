const STOP_COMMAND = /^(?:(?:hey )?eco ?pulse )?(?:please )?(?:stop(?: (?:speaking|talking|now|it))?|that s enough|bas(?: karo)?|ruko|band karo|thamb(?:a)?|स्टॉप(?: (?:स्पीकिंग|टॉकिंग))?|बस(?: करो)?|रुको|(?:बोलना )?बंद करो|(?:बोलणं )?थांब(?:ा|वा)?)(?: please)?$/u;
const EARLY_STOP = /^(?:(?:(?:hey )?eco ?pulse )?(?:please )?stop (?:speaking|talking)|(?:hey )?eco ?pulse (?:please )?stop|स्टॉप (?:स्पीकिंग|टॉकिंग)|बोलना बंद करो|बोलणं थांबवा)(?: please)?$/u;
const PAUSE_MS = 1000;
const FINAL_RESULT_MS = 1200;

function spokenWords(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export function isTalkStop(text, playback = '', interim = false) {
  const command = spokenWords(text);
  // Ignore commands that could be the mic picking up the current reply itself.
  return (interim ? EARLY_STOP : STOP_COMMAND).test(command) && !` ${spokenWords(playback)} `.includes(` ${command} `);
}

function collectInput(parts) {
  if (!parts.size) return undefined;
  const segments = [...parts].sort(([a], [b]) => a - b).map(([, segment]) => segment);
  const scores = segments.map(({ confidence }) => confidence).filter((value) => value > 0 && value <= 1);
  return { transcript: segments.map(({ transcript }) => transcript).join(' '), confidence: scores.length ? Math.min(...scores) : 0 };
}

// Browser recognition can take a moment to release the mic after abort(). Wait
// for that session to end before switching from command-only to dictation.
export function createTalkMic(Recognition) {
  let active, queued;

  function finish(session) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    clearTimeout(session.pauseTimer);
    clearTimeout(session.releaseTimer);
    if (!session.cancelled) {
      const result = collectInput(session.parts);
      session.options.onEnd({ result, error: result && session.error === 'no-speech' ? undefined : session.error });
    }
    startQueued();
  }

  function close(session) {
    if (session.closing) return;
    session.closing = true;
    clearTimeout(session.timer);
    clearTimeout(session.pauseTimer);
    // Some implementations don't fire an end event after a start error.
    session.releaseTimer = setTimeout(() => finish(session), 750);
    try { session.recognition.abort(); } catch { finish(session); }
  }

  function stopInput(session) {
    if (session.monitor || session.closing || session.finishing) return;
    session.finishing = true;
    clearTimeout(session.timer);
    clearTimeout(session.pauseTimer);
    // stop(), unlike abort(), lets the browser return its last decoded words.
    session.timer = setTimeout(() => close(session), FINAL_RESULT_MS);
    try { session.recognition.stop(); } catch { close(session); }
  }

  function startQueued() {
    if (active || !queued) return;
    const options = queued;
    queued = null;
    let recognition;
    try { recognition = new Recognition(); }
    catch { options.onEnd({ error: 'start-failed' }); return; }

    const monitor = Boolean(options.onStop);
    const session = { options, recognition, monitor, parts: new Map() };
    active = session;
    const isCurrent = () => active === session && !session.closing;
    recognition.lang = options.language;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (isCurrent()) options.onStart?.(); };
    recognition.onspeechstart = () => { if (isCurrent() && !monitor) clearTimeout(session.pauseTimer); };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      let interim = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const entry = event.results[index];
        const result = entry[0];
        if (monitor) {
          // During playback, only the local stop command is actionable. Never
          // turn echo into a new question. A clear phrase can cut in before
          // the recognizer finishes, but a bare "stop" must be a final result.
          if (isTalkStop(result?.transcript, options.playback, !entry.isFinal)) { options.onStop(); return; }
        } else if (!entry.isFinal) {
          interim = true;
        } else if (result?.transcript?.trim()) {
          session.parts.set(index, { transcript: result.transcript.trim(), confidence: result.confidence });
        }
      }
      if (monitor || session.finishing) return;
      clearTimeout(session.pauseTimer);
      if (!interim && session.parts.size) session.pauseTimer = setTimeout(() => stopInput(session), PAUSE_MS);
    };
    recognition.onerror = ({ error }) => {
      if (!isCurrent()) return;
      session.error = error;
      close(session);
    };
    recognition.onend = () => finish(session);
    session.timer = monitor ? setTimeout(() => close(session), 30000)
      : setTimeout(() => stopInput(session), options.followUp ? 12000 : 20000);
    try { recognition.start(); }
    catch { session.error = 'start-failed'; finish(session); }
  }

  function cancelActive() {
    if (!active) return;
    active.cancelled = true;
    close(active);
  }

  return {
    supported: Boolean(Recognition),
    listen(options) {
      queued = options;
      if (active) cancelActive();
      else startQueued();
    },
    finishInput() {
      if (active) stopInput(active);
    },
    abort() {
      queued = null;
      cancelActive();
    },
  };
}
