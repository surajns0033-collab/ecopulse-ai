const STOP_COMMAND = /^(?:(?:hey )?eco ?pulse )?(?:please )?(?:stop(?: (?:speaking|talking|now|it))?|that s enough|bas(?: karo)?|ruko|band karo|thamb(?:a)?|स्टॉप(?: (?:स्पीकिंग|टॉकिंग))?|बस(?: करो)?|रुको|(?:बोलना )?बंद करो|(?:बोलणं )?थांब(?:ा|वा)?)(?: please)?$/u;
const EARLY_STOP = /^(?:(?:(?:hey )?eco ?pulse )?(?:please )?stop (?:speaking|talking)|(?:hey )?eco ?pulse (?:please )?stop|स्टॉप (?:स्पीकिंग|टॉकिंग)|बोलना बंद करो|बोलणं थांबवा)(?: please)?$/u;
const PAUSE_MS = 1000;
const FINAL_RESULT_MS = 1200;
const OPEN_MS = 8000;

function spokenWords(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export function isTalkStop(text, playback = '', interim = false) {
  const command = spokenWords(text);
  // Ignore commands that could be the mic picking up the current reply itself.
  return (interim ? EARLY_STOP : STOP_COMMAND).test(command) && !` ${spokenWords(playback)} `.includes(` ${command} `);
}

export function isTalkEcho(text, playback) {
  const heard = spokenWords(text);
  const said = spokenWords(playback);
  if (!heard || !said) return false;
  // A fragment of the reply may be a valid answer, e.g. repeating a city name.
  return heard === said || (said.split(' ').length >= 4 && ` ${heard} `.includes(` ${said} `));
}

function collectInput(parts) {
  if (!parts.size) return undefined;
  const segments = [...parts].sort(([a], [b]) => a - b).map(([, segment]) => segment);
  const scores = segments.map(({ confidence }) => confidence).filter((value) => value > 0 && value <= 1);
  return { transcript: segments.map(({ transcript }) => transcript).join(' '), confidence: scores.length ? Math.min(...scores) : 0 };
}

// Reuse a running command listener after playback when possible. Otherwise
// wait for the old recognition to end before starting a new one.
export function createTalkMic(Recognition) {
  let active, queued;
  let singleInput = false;

  function finish(session) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    clearTimeout(session.pauseTimer);
    clearTimeout(session.releaseTimer);
    if (!session.cancelled) {
      const result = collectInput(session.parts);
      let error = session.error;
      if (result && (error === 'no-speech' || (error === 'aborted' && session.finishing))) error = undefined;
      if (!session.monitor && !result && (!error || error === 'no-speech')) {
        // Some engines open continuous recognition but never finalize it.
        // Use one utterance on the next attempt, without opening the mic again here.
        if (session.hasInput || (!session.ignoredEcho && (session.heardSpeech || (!error && !session.finishing)))) singleInput = true;
        error = session.heardSpeech ? 'unrecognized-speech' : 'no-speech';
      }
      session.options.onEnd({ result, error });
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

  function armListening(session) {
    clearTimeout(session.timer);
    session.timer = session.monitor ? setTimeout(() => close(session), 30000)
      : setTimeout(() => stopInput(session), session.options.followUp ? 12000 : 20000);
  }

  function pauseToFinish(session) {
    clearTimeout(session.pauseTimer);
    session.pauseTimer = setTimeout(() => stopInput(session), PAUSE_MS);
  }

  function startQueued() {
    if (active || !queued) return;
    const options = queued;
    queued = null;
    let recognition;
    try { recognition = new Recognition(); }
    catch { options.onEnd({ error: 'start-failed' }); return; }

    const session = { options, recognition, monitor: Boolean(options.onStop), parts: new Map(), firstInputIndex: 0, playingInterim: new Map() };
    active = session;
    const isCurrent = () => active === session && !session.closing;
    recognition.lang = options.language;
    recognition.interimResults = true;
    recognition.continuous = session.monitor || !singleInput;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (!isCurrent()) return;
      session.started = true;
      armListening(session);
      session.options.onStart?.();
    };
    recognition.onspeechstart = () => {
      if (!isCurrent() || session.monitor || session.finishing) return;
      clearTimeout(session.pauseTimer);
      session.speechEnded = false;
      session.playingInterim.clear();
      session.heardSpeech = true;
    };
    recognition.onspeechend = () => {
      if (!isCurrent() || session.monitor || session.finishing) return;
      session.speechEnded = true;
      pauseToFinish(session);
    };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      const { onStop, playback } = session.options;
      let interim = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const entry = event.results[index];
        const result = entry?.[0];
        const transcript = result?.transcript?.trim();
        if (!transcript) continue;
        if (session.monitor) {
          // During playback, only the local stop command is actionable. Never
          // turn echo into a new question. A clear phrase can cut in before
          // the recognizer finishes, but a bare "stop" must be a final result.
          if (entry.isFinal) {
            session.firstInputIndex = Math.max(session.firstInputIndex, index + 1);
            session.playingInterim.delete(index);
          } else session.playingInterim.set(index, spokenWords(transcript));
          if (isTalkStop(transcript, playback, !entry.isFinal)) { onStop(); return; }
          continue;
        }
        if (index < session.firstInputIndex) continue;
        const partial = session.playingInterim.get(index);
        const words = spokenWords(transcript);
        if (entry.isFinal) session.playingInterim.delete(index);
        if (isTalkEcho(transcript, playback) || (partial && (words === partial || words.startsWith(`${partial} `)))) {
          session.ignoredEcho = true;
          continue;
        }
        session.heardSpeech = true;
        if (!session.hasInput) {
          session.hasInput = true;
          session.options.onInput?.();
        }
        if (entry.isFinal) session.parts.set(index, { transcript, confidence: result.confidence });
        else interim = true;
      }
      if (session.monitor || session.finishing) return;
      if (session.speechEnded || (!interim && session.parts.size)) pauseToFinish(session);
      else clearTimeout(session.pauseTimer);
    };
    recognition.onerror = ({ error }) => {
      if (!isCurrent()) return;
      session.error = error;
      close(session);
    };
    recognition.onend = () => finish(session);
    session.timer = setTimeout(() => { session.error = 'start-timeout'; close(session); }, OPEN_MS);
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
      if (!options.onStop && options.playback && !singleInput && active?.monitor && !active.closing &&
          active.options.playback === options.playback && active.options.language === options.language) {
        active.monitor = false;
        active.options = options;
        if (active.started) {
          armListening(active);
          options.onStart?.();
        }
        return;
      }
      queued = options;
      if (active) cancelActive();
      else startQueued();
    },
    finishInput() {
      // A tap to answer a prompt must not shut off a just-opened mic.
      if (active?.hasInput) stopInput(active);
    },
    abort() {
      queued = null;
      cancelActive();
    },
  };
}
