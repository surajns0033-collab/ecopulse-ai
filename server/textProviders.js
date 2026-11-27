import { state, realKey, fetchJson, geminiErrorText, isWebUrl, compatibleReply } from './providerHttp.js';

export async function callTavilySearch(payload, env) {
  const key = realKey(env.TAVILY_API_KEY)
  if (!key) throw new Error('No Tavily search key configured')
  const query = payload.messages[0].text

  const { ok, status, json, raw } = await fetchJson(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      signal: payload.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: 5,
        include_answer: 'basic',
        include_raw_content: false,
      }),
    },
  )
  if (!ok) throw new Error(`Tavily ${status}: ${geminiErrorText(json, raw)}`)

  const results = (json?.results || []).filter((result) => isWebUrl(result?.url))
  const sources = results
    .map((result) => ({ title: result.title || 'Web source', url: result.url }))
    .slice(0, 5)
  const answer = String(json?.answer || '').trim()
  const text = answer || results.slice(0, 4).map((result) => (
    `**${result.title || 'Source'}**\n${String(result.content || '').slice(0, 500)}`
  )).join('\n\n')
  if (!text) throw new Error('Tavily returned no answer or search results')
  return { text, sources, provider: 'tavily-search' }
}

const llm7 = {
  name: 'llm7:gpt-oss-20b', model: 'gpt-oss:20b', url: 'https://api.llm7.io/v1/chat/completions',
  cooldown: 'llm7DisabledUntil', minTokens: 1000, maxTokens: 2400, defaultTokens: 600, retrySeconds: 30,
};
const pollinations = {
  name: 'pollinations', model: 'openai', url: 'https://text.pollinations.ai/openai',
  cooldown: 'pollinationsDisabledUntil', minTokens: 64, maxTokens: 1200, defaultTokens: 500, retrySeconds: 15,
};

async function requestText(payload, provider) {
  if (payload.images.length) throw new Error('Text provider cannot read photos');
  if (Date.now() < state[provider.cooldown]) throw new Error('Text provider cooling down');
  const messages = [
    ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
    ...payload.messages.map(({ role, text }) => ({ role: role === 'ai' ? 'assistant' : role, content: text })),
  ];
  const { ok, status, json, raw } = await fetchJson(provider.url, {
    method: 'POST', signal: payload.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, messages, temperature: payload.temperature,
      max_tokens: Math.min(Math.max(payload.maxTokens || provider.defaultTokens, provider.minTokens), provider.maxTokens) }),
  });
  if (!ok) {
    const detail = geminiErrorText(json, raw);
    if ([402, 403, 429].includes(status)) {
      const retry = detail.match(/retry (?:after|in) (\d+)\s*(?:s|seconds?)/i);
      state[provider.cooldown] = Date.now() + Math.max(Number(retry?.[1] || provider.retrySeconds), 15) * 1000;
    }
    throw new Error(`${provider.name} ${status}: ${detail}`);
  }
  return compatibleReply(json, provider.name);
}

export const callLlm7 = payload => requestText(payload, llm7);
export const callPollinations = payload => requestText(payload, pollinations);
