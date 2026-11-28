import assert from 'node:assert/strict';
import { AWAITING_DRAFT_DETAILS } from '../src/agent/chatPlaces.js';

export const NaviMumbai = { city: 'Navi Mumbai, Maharashtra, India', name: 'Navi Mumbai', lat: 19.04, lng: 73.02 };
export const Paris = { city: 'Paris, Île-de-France, France', name: 'Paris', lat: 48.86, lng: 2.35 };
export const draft = { type: AWAITING_DRAFT_DETAILS, location: NaviMumbai, draftIssue: 'burning' };
export const forbidLookup = () => assert.fail('Unexpected place lookup');
