import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export async function openBrowser(t) {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  t.after(async () => {
    try { await browser?.close(); } finally { await server.close(); }
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  return { context, origin };
}

export async function auditAccessibility(page, label) {
  await page.addScriptTag({ path: axeScript });
  const findings = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: {
      type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
    } });
    return result.violations.map(rule => ({ rule: rule.id, nodes: rule.nodes.map(node => ({
      selector: node.target, issue: node.failureSummary,
    })) }));
  });
  assert.deepEqual(findings, [], label + ': ' + JSON.stringify(findings));
}
