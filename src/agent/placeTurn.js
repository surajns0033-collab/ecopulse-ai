import { correctedCity, placeName, PLACE_FOLLOWUP } from './placeNames.js';
import { getDevicePlace, lookupPlace } from '../services/placeLookup.js';

const CANCEL_LOOKUP = /^(?:cancel|never mind|forget it)[.!?]*$/i;
const YES = /^(?:(?:yes|yeah|yep)(?: (?:please|correct|use it|that(?:['’]s| is) (?:right|correct|the one)))?|correct|that(?:['’]s| is) (?:right|correct)|haan|han|(?:हाँ|हां)(?: (?:सही है|यही शहर है))?|(?:हो|होय)(?: बरोबर)?|बरोबर(?: आहे)?)$/iu;
const NO = /^(?:(?:no|nope)(?: not that one)?|not that one|nahi|नहीं|नाही)$/iu;

const copy = {
  city: 'Which city should I check?', region: 'Which city and state or country should I use?',
  confirm: (city) => `Did you mean ${city}?`, set: (city) => `Okay, I’ll use ${city} when you ask for local information.`,
  unclear: 'I didn’t catch that clearly. Could you say it again?',
  noDevice: 'I couldn’t verify your device location. Which city should I check?',
  notFound: (place) => `I couldn’t verify ${place}. Could you say the city and its state or country?`,
};

function ask(text, context) {
  return { kind: 'reply', text, context, expectsReply: true };
}

function selected(turn, location, context, pinLocation) {
  const next = {
    location: turn.map && !pinLocation ? context.location : location,
    chosenLocation: pinLocation ? location : context.chosenLocation,
    waiting: null,
  };
  if (turn.kind === 'city') return { kind: 'reply', text: copy.set(location.city), context: next, selected: location };
  return { ...turn, location, context: next };
}

function defer(text, context, turn, pinLocation, candidate = null) {
  return ask(text, { ...context, waiting: { turn, candidate, pinLocation } });
}

async function deviceTurn(turn, context, locateDevice, signal) {
  const resumed = context.waiting?.turn || { ...turn, kind: 'city', needsPlace: true };
  const location = await locateDevice({ signal });
  return location ? selected(resumed, location, context, true) : defer(copy.noDevice, context, resumed, true);
}

function waitingAnswer(input, turn, context) {
  const { waiting } = context;
  const answer = input.replace(/[.!?।]+$/u, '').replace(/[,\s]+/gu, ' ').trim();
  if (YES.test(answer) && waiting.candidate) return { turn: waiting.turn, location: waiting.candidate };
  if (NO.test(answer) || YES.test(answer)) return { reply: ask(copy.region, { ...context, waiting: { ...waiting, candidate: null } }) };
  if (turn.kind !== 'city' && turn.kind !== 'general') return null;
  const followUp = input.match(PLACE_FOLLOWUP);
  const place = correctedCity(input) || turn.place || placeName(followUp?.[1] || input.replace(/^city:\s*/i, ''));
  return place ? { turn: { ...waiting.turn, place } } : null;
}

async function verifyRequestedPlace(turn, context, pin, lookup, signal) {
  const hit = await lookup(turn.place, { signal, map: Boolean(turn.map) });
  if (hit.location) return { location: hit.location };
  if (hit.candidate) return { reply: defer(copy.confirm(hit.candidate.city), context, turn, pin, hit.candidate) };
  const text = hit.ambiguous ? copy.region : copy.notFound(turn.place);
  return { reply: { ...defer(text, context, turn, pin), ambiguous: Boolean(hit.ambiguous) } };
}

function previousLocation(turn, context) {
  if (turn.kind === 'city') return null;
  return turn.relative ? context.chosenLocation : (context.location || context.chosenLocation);
}

async function locateTurn(turn, context, options, confirmed, pin) {
  if (!turn.needsPlace) return { ...turn, context: { ...context, waiting: null } };
  const pinOnReply = Boolean(pin || (turn.relative && !turn.place));
  let location = confirmed;
  if (!location && turn.place) {
    const found = await verifyRequestedPlace(turn, context, pinOnReply, options.lookup, options.signal);
    if (found.reply) return found.reply;
    location = found.location;
  }
  location ||= previousLocation(turn, context);
  return location ? selected(turn, location, context, pin) : defer(copy.city, context, turn, pinOnReply);
}

export async function resolvePlaceTurn(text, context, route, { signal, lookup = lookupPlace, locateDevice = getDevicePlace } = {}) {
  if (!/[\p{L}\p{N}]/u.test(text)) return ask(copy.unclear, context);
  const input = text.trim();
  const { waiting } = context;
  if (waiting && CANCEL_LOOKUP.test(input)) return { kind: 'general', message: input, context: { ...context, waiting: null } };
  const turn = { ...route, message: input };
  if (turn.kind === 'device') return deviceTurn(turn, context, locateDevice, signal);
  const answer = waiting ? waitingAnswer(input, turn, context) : null;
  if (answer?.reply) return answer.reply;
  const resumed = answer?.turn || turn;
  const pin = Boolean(turn.kind === 'city' || turn.pinLocation || resumed.kind === 'city' || (answer && waiting.pinLocation));
  return locateTurn(resumed, context, { lookup, signal }, answer?.location, pin);
}
