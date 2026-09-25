/**
 * Import the MingCute icon set (https://www.mingcute.com, Apache 2.0) into a
 * generated TS module — the icons the builder's icon picker offers.
 *
 * Every MingCute icon comes in two styles on a 24px grid: `line` (outline)
 * and `fill` (filled), both drawn as filled paths. Each file also carries a
 * transparent frame path for icon fonts, dropped here, and a few colour or
 * gradient fills, dropped too: the illustration's own colour tokens paint
 * every icon, so only the shapes are kept, joined into one path per style.
 *
 *   node --experimental-strip-types scripts/build-mingcute.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'node_modules', 'mingcute_icon', 'svg');
const version = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'mingcute_icon', 'package.json'), 'utf8')).version;

/** The painted paths of one file, as a single path. */
function shapes(svg: string): string {
  return [...svg.matchAll(/<path\b([^>]*)\/?>/g)]
    .map((m) => m[1])
    .filter((a) => /\sfill="(#|url\()/.test(a))
    .map((a) => a.match(/\sd="([^"]+)"/)?.[1] ?? '')
    .filter(Boolean)
    .join(' ');
}

const icons: Record<string, { c: string; line?: string; fill?: string }> = {};
for (const category of readdirSync(SRC).sort()) {
  for (const file of readdirSync(join(SRC, category)).sort()) {
    const m = file.match(/^(.+)_(line|fill)\.svg$/);
    if (!m) continue;
    const [, name, style] = m;
    const d = shapes(readFileSync(join(SRC, category, file), 'utf8'));
    if (!d) continue;
    const entry = (icons[name] ??= { c: category });
    entry[style as 'line' | 'fill'] = d;
  }
}

const names = Object.keys(icons).sort();
const body = JSON.stringify(Object.fromEntries(names.map((n) => [n, icons[n]])));
const out = `/**
 * GENERATED — do not edit. Run \`npm run mingcute\` to regenerate.
 *
 * MingCute ${version} (https://www.mingcute.com), Apache License 2.0 —
 * ${names.length} icons, each \`line\` (outline) and/or \`fill\` on a 24px grid, as
 * one path per style. \`c\` is MingCute's own category.
 */

export interface MingCuteIcon {
  c: string;
  line?: string;
  fill?: string;
}

export const MINGCUTE_VERSION = ${JSON.stringify(version)};

export const MINGCUTE: Record<string, MingCuteIcon> = ${body};
`;
writeFileSync(join(ROOT, 'src', 'mingcute.generated.ts'), out);
const both = names.filter((n) => icons[n].line && icons[n].fill).length;
console.log(`mingcute ${version}: ${names.length} icons (${both} in both styles), ${(out.length / 1024).toFixed(0)} KB`);
