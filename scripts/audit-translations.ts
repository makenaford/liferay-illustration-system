/**
 * Audit every illustration as it downloads translated — that nothing spills
 * out of its card, panel or the canvas, and no text runs into its neighbour.
 *
 * A translation is refitted on the way out (src/fit.ts): elements grow to
 * their copy, what is beside them moves along, and the drawing is scaled to
 * the canvas if it has to be. This checks that refit on real translations,
 * so a change to the layout code, or a new illustration, cannot quietly
 * bring back text running out of its box.
 *
 * The translations are fixtures in scripts/translations/<lang>.json — the
 * machine translations of every string, kept so this runs anywhere, CI
 * included, without the translation service. A string missing from them
 * (a new illustration's copy) is audited in English and listed, so the
 * fixtures can be brought up to date.
 *
 * Only the containment rules run: the grid and alignment rules are about
 * how an original is drawn, and a translation is refitted at whatever
 * fractional sizes its copy needs.
 *
 *   node --experimental-strip-types scripts/audit-translations.ts
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Doc } from '../src/document.ts';
import { collectStrings, translateDoc } from '../src/translate.ts';

const ROOT = join(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const RULES = ['overflow', 'card-padding', 'canvas-inset', 'text-collision'];

const docs = readdirSync(DOCS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(DOCS, f), 'utf8')) as Doc] as const);

let failed = false;
for (const lang of ['ja', 'es']) {
  const table = JSON.parse(readFileSync(join(import.meta.dirname, 'translations', `${lang}.json`), 'utf8')) as Record<string, string>;
  const missing = [...new Set(docs.flatMap(([, d]) => collectStrings(d)))].filter((s) => !table[s]);
  const dir = mkdtempSync(join(tmpdir(), `audit-${lang}-`));
  for (const [f, d] of docs) writeFileSync(join(dir, f), JSON.stringify(translateDoc(d, table)));
  console.log(`\n${lang}: ${docs.length} illustrations${missing.length ? ` — ${missing.length} strings not in the fixtures, audited in English: ${missing.slice(0, 5).map((s) => JSON.stringify(s)).join(', ')}${missing.length > 5 ? ', …' : ''}` : ''}`);
  const run = spawnSync(process.execPath, ['--experimental-strip-types', join(import.meta.dirname, 'audit.ts')], {
    env: { ...process.env, AUDIT_DOCS: dir, AUDIT_RULES: RULES.join(',') },
    stdio: 'inherit',
  });
  rmSync(dir, { recursive: true, force: true });
  if (run.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
