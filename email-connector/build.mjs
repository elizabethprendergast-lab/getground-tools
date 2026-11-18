// Builds dist/_worker.js for the GetGround Email connector by inlining the shared builder
// logic + guidelines from the email-builder plugin, so both always follow the same rules.
// Run: node email-connector/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../plugins/email-builder/skills/email-builder');
const read = (p) => fs.readFileSync(path.join(SKILL, p), 'utf8');

let lib = read('scripts/lib.mjs')
  .replace(/^export \{[^}]*\};?\s*$/m, '')
  .replace(/^export const /gm, 'const ');
const plugin = JSON.parse(fs.readFileSync(path.resolve(SKILL, '../../.claude-plugin/plugin.json'), 'utf8'));

const insights = read('scripts/insights.mjs').replace(/^export (async )?function /gm, (m, a) => `${a || ''}function `);
let src = fs.readFileSync(path.join(HERE, 'src/worker.js'), 'utf8')
  .replace('/*__LIB__*/', () => lib)
  .replace('/*__INSIGHTS__*/', () => insights.replace(/^const (API|PORTAL_ID) = .*$/gm, (m, n) => n === 'API' ? '' : m))
  .replace('/*__DISCLAIMERS__*/null', () => read('disclaimers.json').trim())
  .replace("/*__GUIDELINES__*/''", () => JSON.stringify(read('GUIDELINES.md')))
  .replace("/*__COMPONENTS__*/''", () => JSON.stringify(read('components.html')))
  .replace("/*__VERSION__*/'dev'", () => JSON.stringify(plugin.version));

fs.mkdirSync(path.join(HERE, 'dist'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'dist/_worker.js'), src);
fs.writeFileSync(path.join(HERE, 'dist/index.html'), '<!doctype html><title>GetGround Email</title><p>GetGround Email connector.</p>');
fs.cpSync(path.join(HERE, 'assets'), path.join(HERE, 'dist/assets'), { recursive: true });
console.log(`Built dist/_worker.js (${(src.length / 1024).toFixed(0)} KB, v${plugin.version})`);
