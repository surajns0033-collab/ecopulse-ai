import assert from 'node:assert/strict';
import { cp, glob, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function invoke(handler, url, method, body) {
  let result;
  const res = { setHeader() {}, end(text) { result = JSON.parse(text); } };
  await handler({ url, method, body, headers: { 'content-type': 'application/json' } }, res);
  return { status: res.statusCode, result };
}

test('the JavaScript-only serverless package starts both public API entry points', async t => {
  const output = await mkdtemp(join(tmpdir(), 'ecopulse-functions-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(join(root, 'node_modules'), join(output, 'node_modules'), 'junction');
  for await (const file of glob(['api/ai/*.js', 'server/*.js', 'src/services/diagnostics.js'], { cwd: root })) {
    const destination = join(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, file), destination);
  }
  const load = async name => (await import(pathToFileURL(join(output, 'api/ai', name + '.js')))).default;
  const health = await load('health');
  const chat = await load('chat');
  assert.deepEqual(await invoke(health, '/api/ai/health', 'GET'), { status: 200, result: { status: 'ok' } });
  t.mock.method(globalThis, 'fetch', assert.fail);
  assert.equal((await invoke(chat, '/api/ai/chat', 'POST', { messages: [] })).status, 400);
});
