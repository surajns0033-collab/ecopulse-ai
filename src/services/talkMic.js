const STOP_COMMAND = /^(?:(?:hey )?eco ?pulse )?(?:please )?(?:stop(?: (?:speaking|talking|now|it))?|that s enough|bas(?: karo)?|ruko|band karo|thamb(?:a)?|स्टॉप|बस(?: करो)?|रुको|बंद करो|थांब(?:ा|वा)?)(?: please)?$/u;
const EARLY_STOP = /^(?:(?:(?:hey )?eco ?pulse )?(?:please )?stop (?:speaking|talking)|(?:hey )?eco ?pulse (?:please )?stop)(?: please)?$/u;

function spokenWords(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export function isTalkStop(text, playback = '', interim = false) {
  const command = spokenWords(text);
  // Ignore commands that could be the mic picking up the current reply itself.
  return (interim ? EARLY_STOP : STOP_COMMAND).test(command) && !` ${spokenWords(playback)} `.includes(` ${command} `);
}

// Browser recognition can take a moment to release the mic after abort(). Wait
// for that session to end before switching from command-only to dictation.
export function createTalkMic(Recognition) {
  let active, queued;

  function finish(session) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    clearTimeout(session.releaseTimer);
    if (!session.cancelled) session.options.onEnd({ result: session.result, error: session.error });
    startQueued();
  }

  function close(session) {
    if (session.closing) return;
    session.closing = true;
    clearTimeout(session.timer);
    // Some implementations don't fire an end event after a start error.
    session.releaseTimer = setTimeout(() => finish(session), 750);
    try { session.recognition.abort(); } catch { finish(session); }
  }

  function startQueued() {
    if (active || !queued) return;
    const options = queued;
    queued = null;
    let recognition;
    try { recognition = new Recognition(); }
    catch { options.onEnd({ error: 'start-failed' }); return; }

    const monitor = Boolean(options.onStop);
    const session = { options, recognition, monitor };
    active = session;
    const isCurrent = () => active === session && !session.closing;
    recognition.lang = options.language;
    recognition.interimResults = monitor;
    recognition.continuous = monitor;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (isCurrent()) options.onStart?.(); };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const entry = event.results[index];
        const result = entry[0];
        if (monitor) {
          // During playback, only the local stop command is actionable. Never
          // turn echo into a new question. A clear phrase can cut in before
          // the recognizer finishes, but a bare "stop" must be a final result.
          if (isTalkStop(result?.transcript, options.playback, !entry.isFinal)) { options.onStop(); return; }
        } else if (entry.isFinal && result?.transcript?.trim()) session.result = result;
      }
    };
    recognition.onerror = ({ error }) => {
      if (!isCurrent()) return;
      session.error = error;
      close(session);
    };
    recognition.onend = () => finish(session);
    session.timer = setTimeout(() => close(session), monitor ? 30000 : options.followUp ? 12000 : 20000);
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
      if (!active || active.monitor || active.closing || active.finishing) return;
      active.finishing = true;
      try { active.recognition.stop(); } catch { close(active); }
    },
    abort() {
      queued = null;
      cancelActive();
    },
  };
}
