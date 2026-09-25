/**
 * Import the built-in graphics into a generated TS module.
 *
 * Graphics are larger glass artwork than the icon set — a rocket, a scene —
 * placed in an illustration at whatever size it needs. They live in
 * `assets/graphics/`, named `<Name> - <Light|Dark>.svg` (Figma exports, one
 * per theme), and go through the same fixes as the glass icons: portable
 * background blur, namespaced ids, softened rims. See src/figmaGlass.ts.
 *
 * The team adds more through the Marketing Assets site; these are the ones
 * every copy of the builder has.
 *
 *   node --experimental-strip-types scripts/build-graphics.ts
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'assets', 'graphics');

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bases = [
  ...new Set(
    readdirSync(DIR)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace(/ - (Light|Dark)\.svg$/, '')),
  ),
].sort();

const entries: string[] = [];
for (const base of bases) {
  const key = slug(base);
  const darkFile = join(DIR, `${base} - Dark.svg`);
  const lightFile = join(DIR, `${base} - Light.svg`);
  const hasDark = existsSync(darkFile);
  const hasLight = existsSync(lightFile);
  const opts = { anyBlurredGroup: true };
  const dark = normaliseFigmaSvg(readFileSync(hasDark ? darkFile : lightFile, 'utf8'), `g-${key}-d-`, undefined, opts);
  const light = normaliseFigmaSvg(readFileSync(hasLight ? lightFile : darkFile, 'utf8'), `g-${key}-l-`, undefined, opts);
  entries.push(
    `  ${JSON.stringify(key)}: {\n` +
      `    label: ${JSON.stringify(base)},\n` +
      `    dark: { viewBox: ${JSON.stringify(dark.viewBox)}, body: ${JSON.stringify(dark.body)} },\n` +
      `    light: { viewBox: ${JSON.stringify(light.viewBox)}, body: ${JSON.stringify(light.body)} },\n` +
      `  },`,
  );
}

const out = `/**
 * GENERATED — do not edit. Run \`npm run graphics\` to regenerate.
 *
 * The built-in graphics, from assets/graphics/. Every id in \`body\` carries
 * the \`__NS__\` placeholder the renderer swaps for a per-instance namespace.
 * ${bases.length} graphic${bases.length === 1 ? '' : 's'}.
 */

export interface GraphicArt {
  viewBox: [number, number, number, number];
  body: string;
}

export interface Graphic {
  label: string;
  dark: GraphicArt;
  light: GraphicArt;
}

export const GRAPHICS: Record<string, Graphic> = {
${entries.join('\n')}
};
`;
writeFileSync(join(ROOT, 'src', 'graphics.generated.ts'), out);
console.log(`graphics: ${bases.length} -> src/graphics.generated.ts (${(out.length / 1024).toFixed(1)} KB)`);
