import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const patterns = ['{src,server,api,tests}/**/*.{js,jsx,ts,tsx,mjs,css}', '*.{js,mjs}'];
const files = globSync(patterns, { cwd: root }).sort();
if (!files.length) throw new Error('No source modules found');
const sizes = files.map(file => {
  const source = readFileSync(new URL('../' + file.replaceAll('\\', '/'), import.meta.url), 'utf8');
  return { file, lines: source.replace(/\r?\n$/, '').split(/\r?\n/).length };
}).sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
const violations = sizes.filter(({ lines }) => lines >= 150);
console.log(`${files.length} modules checked. Largest: ${sizes[0].file}, ${sizes[0].lines} physical lines.`);
for (const { file, lines } of violations) console.error(`${file}: ${lines} lines (limit 149)`);
if (violations.length) process.exitCode = 1;
