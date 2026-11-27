import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeAiHandler } from '../server/aiCore.js';

export const handler = makeAiHandler({ GEMINI_API_KEY: 'test-gemini-key', TAVILY_API_KEY: 'test-search-key' });

export const chatHeaders = { 'content-type': 'application/json; charset=utf-8' };
export const shortHistory = [{ role: 'user', text: 'How can I reduce indoor smoke?' }];

export async function runRequest(req, serve = handler, res = new EventEmitter()) {
  const headers = {};
  let result;
  res.setHeader = (name, value) => { headers[name] = value; };
  res.end = (text) => { result = JSON.parse(text); };
  await serve(req, res, () => assert.fail('Chat request was not handled'));
  return { status: res.statusCode, headers, result };
}

export function chat(body, serve = handler, headers = chatHeaders, res) {
  return runRequest({ url: '/api/ai/chat', method: 'POST', body, headers }, serve, res);
}
