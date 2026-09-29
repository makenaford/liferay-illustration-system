/**
 * Generate the illustration colour set from its Figma variable export.
 *
 * These are the colours a designer picks from — text, lines, icons — and
 * the ones the semantic statuses follow. They are the illustration system's
 * own variables (`tokens/illustration/{Light,Dark}.tokens.json`, exported
 * from Figma's Variables panel), kept apart from the Sites design-system
 * palette in `palette.generated.ts`, which still builds the surfaces.
 *
 *   node --experimental-strip-types scripts/build-colors.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'tokens', 'illustration');

interface Leaf {
  $type: string;
  $value: { hex?: string; alpha?: number } | string;
}

function leaves(node: Record<string, unknown>, path: string[] = []): [string[], Leaf][] {
  if ('$value' in node) return [[path, node as unknown as Leaf]];
  return Object.entries(node)
    .filter(([k, v]) => !k.startsWith('$') && v && typeof v === 'object')
    .flatMap(([k, v]) => leaves(v as Record<string, unknown>, [...path, k]));
}

const kebab = (s: string) =>
  s.toLowerCase().replace(/%/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * `Base Colors/Primary` -> `base-primary`, `Text/Secondary Text` ->
 * `text-secondary`, `Text/Text` -> `text`, `White 20%` -> `white-20`.
 * Prefixed so no name collides with a semantic tone (`primary` already
 * means the primary TEXT colour).
 */
function keyOf(path: string[]): string {
  const [group, ...rest] = path;
  if (!rest.length) return kebab(group);
  if (group === 'Base Colors') return `base-${kebab(rest.join(' '))}`;
  if (group === 'Text') {
    const name = kebab(rest.join(' ').replace(/\btext\b/i, '').trim());
    return name ? `text-${name}` : 'text';
  }
  return kebab(path.join(' '));
}

const groupOf = (path: string[]) => (path.length > 1 ? path[0] : 'Other');
const labelOf = (path: string[]) => path[path.length - 1];

function css(v: { hex?: string; alpha?: number }): string {
  const hex = (v.hex ?? '#000000').toUpperCase();
  const a = v.alpha ?? 1;
  if (a >= 0.999) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 1000) / 1000})`;
}

function read(file: string) {
  const json = JSON.parse(readFileSync(join(SRC, file), 'utf8')) as Record<string, unknown>;
  return new Map(
    leaves(json)
      .filter(([, l]) => l.$type === 'color' && typeof l.$value === 'object')
      .map(([p, l]) => [p.join('/'), { path: p, value: css(l.$value as { hex?: string; alpha?: number }) }]),
  );
}

const light = read('Light.tokens.json');
const dark = read('Dark.tokens.json');

/*
 * THE BASE COLOURS, PER SCHEME — from the `Secondary` palette in the
 * Marketing UI Assets Repo (Figma 84:83246), each hue in nine steps from L4
 * to D4. The Figma variables give each base colour one value for both
 * schemes, its Default step; drawn as a line, text or a chart series it is
 * pale-on-pale in light and heavy on dark. So each scheme takes its own step
 * of the same hue:
 *
 *   dark   L2 — two steps lighter, so it reads on the dark stage
 *   light  D1 — one step darker, so it holds on the pale one
 *
 * One exception: light Green is #16A700, the success green the design chose
 * (Green D1, #66BF26, is paler). It is 2.3:1 on the light page — below 4.5:1
 * for text and 3:1 for bars and dots.
 *
 * Lime's labels in the file sit one step off its swatches (the swatch in the
 * Default column is labelled L1); these follow the columns, as every other
 * hue does, so its Default stays #0FFF0F. The 10% `-light` tints are left as
 * the file has them. Overriding here rather than in the export keeps it
 * through the next export from Figma.
 */
const SECONDARY: Record<string, { L2: string; D1: string }> = {
  'base-primary': { L2: '#70A1FF', D1: '#004AD6' },
  'base-cyan': { L2: '#94DAFF', D1: '#00A4FA' },
  'base-indigo': { L2: '#7785FF', D1: '#0017DB' },
  'base-purple': { L2: '#AF78FF', D1: '#5B00E0' },
  'base-pink': { L2: '#FF73C3', D1: '#DB007D' },
  'base-red': { L2: '#FF9494', D1: '#FA0000' },
  'base-orange': { L2: '#FFB46E', D1: '#D66700' },
  'base-yellow': { L2: '#FFD76E', D1: '#D69B00' },
  'base-green': { L2: '#B8EA95', D1: '#66BF26' },
  'base-teal': { L2: '#A2E7CC', D1: '#31BF88' },
  'base-lime': { L2: '#75FF75', D1: '#00DA00' },
  'base-aqua': { L2: '#7AFFFD', D1: '#00DEDA' },
};
const LIGHT_OVERRIDES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SECONDARY).map(([k, v]) => [k, v.D1])),
  'base-green': '#16A700',
};
const DARK_OVERRIDES: Record<string, string> = Object.fromEntries(Object.entries(SECONDARY).map(([k, v]) => [k, v.L2]));

const rows = [...light.values()].map(({ path, value }) => ({
  key: keyOf(path),
  label: labelOf(path),
  group: groupOf(path),
  light: LIGHT_OVERRIDES[keyOf(path)] ?? value,
  dark: DARK_OVERRIDES[keyOf(path)] ?? dark.get(path.join('/'))?.value ?? value,
}));
for (const key of Object.keys(SECONDARY)) {
  if (!rows.some((r) => r.key === key)) throw new Error(`SECONDARY names "${key}", which the export no longer has`);
}

const keys = new Set<string>();
for (const r of rows) {
  if (keys.has(r.key)) throw new Error(`Two colours map to the key "${r.key}"`);
  keys.add(r.key);
}

const out = `/**
 * GENERATED — do not edit. Run \`pnpm run colors\` to regenerate.
 *
 * The illustration colour set, from \`tokens/illustration/*.tokens.json\`
 * (Figma variables). ${rows.length} colours per scheme, in the file's own order —
 * with the light-scheme overrides in scripts/build-colors.ts, for contrast.
 */

export interface IllustrationColor {
  key: string;
  /** The variable's own name in Figma. */
  label: string;
  /** Its Figma group: Base Colors, Text, or Other. */
  group: string;
  light: string;
  dark: string;
}

export const COLORS: IllustrationColor[] = ${JSON.stringify(rows, null, 2)};

export const colorsLight: Record<string, string> = Object.fromEntries(COLORS.map((c) => [c.key, c.light]));
export const colorsDark: Record<string, string> = Object.fromEntries(COLORS.map((c) => [c.key, c.dark]));
`;
writeFileSync(join(ROOT, 'src', 'colors.generated.ts'), out);
console.log(`colors: ${rows.length} per scheme -> src/colors.generated.ts`);
