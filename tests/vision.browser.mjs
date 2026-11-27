import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { openBrowser } from './browserSupport.mjs';

const limit = 500_000; // Vite's default JavaScript warning threshold, in bytes.
const assets = new URL('../dist/assets/', import.meta.url);

// Opset-13 CLIP test graph. Cast and average each row of token IDs, subtract
// the mean from itself and transpose to [1, labels]. All classes must tie.
// This exercises the shipped WASM runtime without downloading trained weights.
const uniformModel = Buffer.from(
  'CAgSDUVjb1B1bHNlIHRlc3Q6ugIKIQoJaW5wdXRfaWRzEgNpZHMiBENhc3QqCQoCdG8YAaABAgo1CgNpZHMSBG1lYW' +
  '4iClJlZHVjZU1lYW4qCwoEYXhlc0ABoAEHKg8KCGtlZXBkaW1zGAGgAQIKGAoEbWVhbgoEbWVhbhIFemVyb3MiA1N1' +
  'YgozCgV6ZXJvcxIQbG9naXRzX3Blcl9pbWFnZSIJVHJhbnNwb3NlKg0KBHBlcm1AAUAAoAEHEhR1bmlmb3JtX2NsaX' +
  'BfZml4dHVyZVonCglpbnB1dF9pZHMSGgoYCAcSFAoIEgZsYWJlbHMKCBIGdG9rZW5zWiYKDHBpeGVsX3ZhbHVlcxIW' +
  'ChQIARIQCgIIAQoCCAMKAggICgIICGIoChBsb2dpdHNfcGVyX2ltYWdlEhQKEggBEg4KAggBCggSBmxhYmVsc0ICEA' +
  '0=', 'base64');

const modelFiles = {
  'config.json': { model_type: 'clip', architectures: ['CLIPModel'] },
  'preprocessor_config.json': {
    image_processor_type: 'CLIPFeatureExtractor', do_resize: true, size: { shortest_edge: 8 },
    do_center_crop: true, crop_size: { height: 8, width: 8 }, do_normalize: false,
  },
  'tokenizer_config.json': { tokenizer_class: 'CLIPTokenizer', model_max_length: 77, pad_token: '[PAD]', unk_token: '[UNK]' },
  'tokenizer.json': {
    version: '1.0', added_tokens: [], normalizer: null, pre_tokenizer: { type: 'Whitespace' },
    post_processor: null, decoder: null, truncation: null, padding: null,
    model: { type: 'WordLevel', vocab: { '[UNK]': 0, '[PAD]': 1 }, unk_token: '[UNK]' },
  },
};

test('all production JavaScript chunks fit the default Vite budget', async t => {
  const scripts = (await readdir(assets)).filter(name => /\.m?js$/.test(name));
  assert.ok(scripts.length > 0);
  const sizes = await Promise.all(scripts.map(async name => ({ name, bytes: (await stat(new URL(name, assets))).size })));
  const largest = sizes.sort((a, b) => b.bytes - a.bytes)[0];
  t.diagnostic(`Largest JS asset: ${largest.name} (${largest.bytes} bytes)`);
  assert.ok(largest.bytes <= limit, JSON.stringify(largest));
});

test('Guest Chat starts within budget and executes local CLIP only on photo fallback', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  const loaded = new Set();
  const diagnostics = [];
  const page = await context.newPage();
  page.on('request', request => loaded.add(request.url()));
  page.on('pageerror', error => diagnostics.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text().slice(0, 500));
  });
  await context.route('**/api/ai/chat', route => route.fulfill({ status: 503, json: { error: 'Photo provider offline' } }));
  await context.route('https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/**', route => {
    const path = new URL(route.request().url()).pathname.split('/resolve/main/')[1];
    if (path === 'onnx/model_quantized.onnx') return route.fulfill({ contentType: 'application/octet-stream', body: uniformModel });
    if (Object.hasOwn(modelFiles, path)) return route.fulfill({ json: modelFiles[path] });
    return route.fulfill({ status: 404, body: '' });
  });

  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await page.getByRole('textbox', { name: 'Message input' }).waitFor();
  const startup = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => new URL(entry.name).origin === location.origin && /\.m?js$/.test(new URL(entry.name).pathname))
    .reduce((bytes, entry) => bytes + entry.decodedBodySize, 0));
  t.diagnostic(`Guest Chat startup JavaScript: ${startup} bytes`);
  assert.ok(startup > 0 && startup <= limit, `Guest Chat requested ${startup} bytes of JavaScript`);
  assert.equal([...loaded].some(url => /onDeviceVision-|onnx-runtime-|\.wasm$|huggingface\.co/.test(url)), false);

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Send message' }).click();
  const log = page.getByRole('log', { name: 'Chat messages' });
  await log.getByText(/couldn't identify a specific environmental problem confidently|can't analyze the photo automatically right now/i).first().waitFor({ timeout: 50000 });
  assert.match(await log.innerText(), /couldn't identify a specific environmental problem confidently/i, diagnostics.join('\n'));
  assert.ok([...loaded].some(url => url.endsWith('/onnx/model_quantized.onnx')));
  assert.ok([...loaded].some(url => url.startsWith(origin + '/assets/') && url.endsWith('.wasm')));
  assert.equal([...loaded].some(url => url.includes('cdn.jsdelivr.net')), false);
});
