/**
 * Import the team's own icons — assets/custom-icons/ — into a generated TS
 * module, beside MingCute: the icon picker offers them under Custom (or
 * their folder's name), illustrations use them by `custom:<name>`, and the
 * Glass Icon Builder can make glass icons from them.
 *
 * Each icon is drawn as MingCute's are, so the two sets mix: a 24 × 24
 * viewBox, filled shapes only (strokes outlined), and an outline and/or a
 * filled version —
 *
 *   assets/custom-icons/rocket_line.svg      outline
 *   assets/custom-icons/rocket_fill.svg      filled
 *   assets/custom-icons/rocket.svg           one style only — offered as both
 *   assets/custom-icons/Commerce/cart_line.svg   under the Commerce category
 *
 * Colours are dropped: the illustration's own colour paints every icon, so
 * only the shapes are kept, joined into one path per style. A file that
 * can't be drawn that way is reported, with what to fix, and left out.
 *
 *   pnpm icons:custom
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { customIconKey, customShape as shapes } from '../src/customIconShape.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'assets', 'custom-icons');
const OUT = join(ROOT, 'src', 'customIcons.generated.ts');

type Style = 'line' | 'fill';
const icons: Record<string, { c: string; line?: string; fill?: string }> = {};
const problems: string[] = [];

/** Every SVG under the folder, with the folder it sits in (its category). */
function* files(dir: string, category: string): Generator<{ path: string; category: string }> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path, name);
    else if (name.endsWith('.svg')) yield { path, category };
  }
}

for (const { path, category } of files(DIR, 'Custom')) {
  const file = path.split('/').pop()!;
  const m = file.match(/^(.+?)(?:_(line|fill))?\.svg$/);
  if (!m) continue;
  const [, rawName, style] = m;
  const name = customIconKey(rawName);
  const got = shapes(readFileSync(path, 'utf8'));
  if ('problem' in got) {
    problems.push(`${relative(ROOT, path)}: ${got.problem}`);
    continue;
  }
  const entry = (icons[name] ??= { c: category });
  if (entry.c !== category) {
    problems.push(`${relative(ROOT, path)}: another “${name}” is already in ${entry.c} — rename one`);
    continue;
  }
  // One style only: it stands for both.
  for (const s of (style ? [style] : ['line', 'fill']) as Style[]) entry[s] = got.d;
}

const names = Object.keys(icons).sort();
const body = JSON.stringify(Object.fromEntries(names.map((n) => [n, icons[n]])));
writeFileSync(
  OUT,
  `/**
 * GENERATED — do not edit. Run \`pnpm icons:custom\` to regenerate.
 *
 * The team's own icons, from assets/custom-icons/ — ${names.length} ${names.length === 1 ? 'icon' : 'icons'}, shaped
 * as MingCute's are (\`line\` and/or \`fill\` on a 24px grid, one path per
 * style; \`c\` its category). Used as \`custom:<name>\`.
 */

import type { MingCuteIcon } from './mingcute.generated.ts';

export const CUSTOM_ICONS: Record<string, MingCuteIcon> = ${body};
`,
);
console.log(`custom icons: ${names.length}${problems.length ? `, ${problems.length} left out` : ''}`);
for (const p of problems) console.log(`  ✗ ${p}`);
if (problems.length) process.exitCode = 1;
