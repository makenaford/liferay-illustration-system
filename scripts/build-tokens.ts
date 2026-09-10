/**
 * Generate the colour palette from the design system's Figma token export.
 *
 * This replaces a hand-mirrored copy, which was the standing risk: every hex
 * in `tokens.ts` was transcribed by eye, and nothing would have told us when
 * the design file moved one. Now the raw palette is generated and the semantic
 * layer references it by name, which is the same two-layer split the design
 * system itself uses (`tokens.generated.ts` -> `cssVariables.ts`).
 *
 * Key names are kebab-case and match the design system's own generated names
 * exactly, so a value can be traced across the two repos by grep.
 *
 *   node --experimental-strip-types scripts/build-tokens.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Where the design system lives. Override with `SDS_PATH` — the default is
 * the sibling checkout, which is where it sits on a normal setup.
 */
const DS_ROOT = process.env.SDS_PATH ?? join(ROOT, '..', 'liferay-sites-design-system');
const TOKENS = join(DS_ROOT, 'tokens', 'figma');

interface FigmaValue {
  hex?: string;
  alpha?: number;
}

/** `Brand/Primary/Primary` -> `brand-primary-primary`. */
const kebab = (parts: string[]) =>
  parts
    .join('-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `{Brand.Primary.Primary}` -> `brand-primary-primary`. */
const deref = (ref: string) => kebab(ref.replace(/[{}]/g, '').split('.'));

function collect(file: string, out: Map<string, string>, aliases: Map<string, string>) {
  const json = JSON.parse(readFileSync(join(TOKENS, file), 'utf8')) as unknown;

  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;

    if ('$value' in rec) {
      const key = kebab(path);
      const value = rec.$value;

      if (typeof value === 'string') {
        // Either an alias, or a raw literal (radius/spacing are numbers-as-strings).
        if (value.startsWith('{')) aliases.set(key, deref(value));
        else out.set(key, value);
        return;
      }
      if (typeof value === 'number') {
        out.set(key, String(value));
        return;
      }
      const v = value as FigmaValue;
      if (v?.hex) {
        const alpha = v.alpha ?? 1;
        out.set(
          key,
          alpha >= 0.999
            ? v.hex.toLowerCase()
            : rgba(v.hex, Math.round(alpha * 1000) / 1000),
        );
      }
      return;
    }

    for (const [k, child] of Object.entries(rec)) {
      if (k.startsWith('$')) continue;
      walk(child, [...path, k]);
    }
  };

  walk(json, []);
}

function rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Resolve alias chains once every literal is known. */
function resolve(out: Map<string, string>, aliases: Map<string, string>) {
  for (const [key, target] of aliases) {
    let cursor = target;
    const seen = new Set<string>([key]);
    while (!out.has(cursor)) {
      const next = aliases.get(cursor);
      if (!next || seen.has(next)) break;
      seen.add(cursor);
      cursor = next;
    }
    const value = out.get(cursor);
    if (value) out.set(key, value);
    else console.warn(`  ! unresolved alias: ${key} -> ${target}`);
  }
}

function build(scheme: 'light' | 'dark') {
  const out = new Map<string, string>();
  const aliases = new Map<string, string>();
  for (const f of [
    `color.${scheme}.tokens.json`,
    `color.action.${scheme}.tokens.json`,
    `color.gradient-card.${scheme}.tokens.json`,
  ]) {
    collect(f, out, aliases);
  }
  resolve(out, aliases);
  return out;
}

const light = build('light');
const dark = build('dark');

/** Keys present in one scheme but not the other would break the typing. */
const onlyLight = [...light.keys()].filter((k) => !dark.has(k));
const onlyDark = [...dark.keys()].filter((k) => !light.has(k));
if (onlyLight.length || onlyDark.length) {
  console.warn(`  ! asymmetric keys — light-only: ${onlyLight}, dark-only: ${onlyDark}`);
}

const fmt = (m: Map<string, string>) =>
  [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n');

const out = `/**
 * GENERATED — do not edit. Run \`npm run tokens\` to regenerate.
 *
 * The raw colour palette, from liferay-sites-design-system's Figma token
 * export (\`tokens/figma/color.*.tokens.json\`). Aliases are resolved and
 * sub-1 alphas become \`rgba()\`, matching how the design system's own
 * \`tokens.generated.ts\` publishes them.
 *
 * This is the RAW layer: every value the design file defines, named as the
 * design file names it. The semantic layer — what a stage, a card edge or a
 * chart series is *made of* — lives in \`tokens.ts\` and references these keys.
 * Nothing here should be used directly by a primitive.
 *
 * ${light.size} tokens per scheme.
 */

export const paletteLight = {
${fmt(light)}
} as const;

export const paletteDark: Record<keyof typeof paletteLight, string> = {
${fmt(dark)}
};

export type PaletteKey = keyof typeof paletteLight;
`;

writeFileSync(join(ROOT, 'src', 'palette.generated.ts'), out);
console.log(`wrote src/palette.generated.ts`);
console.log(`  ${light.size} tokens per scheme, ${(out.length / 1024).toFixed(1)} KB`);
