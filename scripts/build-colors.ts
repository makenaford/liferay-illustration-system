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

const rows = [...light.values()].map(({ path, value }) => ({
  key: keyOf(path),
  label: labelOf(path),
  group: groupOf(path),
  light: value,
  dark: dark.get(path.join('/'))?.value ?? value,
}));

const keys = new Set<string>();
for (const r of rows) {
  if (keys.has(r.key)) throw new Error(`Two colours map to the key "${r.key}"`);
  keys.add(r.key);
}

const out = `/**
 * GENERATED — do not edit. Run \`npm run colors\` to regenerate.
 *
 * The illustration colour set, from \`tokens/illustration/*.tokens.json\`
 * (Figma variables). ${rows.length} colours per scheme, in the file's own order.
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
