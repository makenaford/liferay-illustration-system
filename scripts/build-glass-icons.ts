/**
 * Import the glass icon set into a generated TS module.
 *
 * The icons live in `assets/glass-icons/`, named `<Category> - <Name> -
 * <Light|Dark>.svg` — 64px Figma exports, every icon in both themes. Four
 * things have to be fixed before they can be inlined into an illustration:
 *
 *   1. IDS. Figma names them `paint0_linear_65_14547` — unique within a file,
 *      and guaranteed to collide once several icons are inlined into one
 *      document. Every id is rewritten to `__NS__<key>-<theme>-<n>`, where the
 *      `__NS__` token is substituted at render time with a per-instance
 *      namespace. Baking a fixed prefix in here would be almost enough — but
 *      the same icon used by two documents shown on one page (a comparison
 *      view, a feature grid) would still collide, which is the bug this
 *      project has already been bitten by once.
 *   2. `foreignObject` + `backdrop-filter`. The same hack the illustrations
 *      used: renders in browsers, ignored by every SVG rasteriser. Rebuilt
 *      as a blurred, clipped copy of what sits behind each glass shape —
 *      see `portableBackdropBlur`.
 *   2b. THE FRAME CLIP. 28 icons draw past their frame and the export cuts
 *      them flat; those drop the clip and take a measured viewBox — see
 *      `unclipFrame` and assets/glass-icons/viewboxes.json.
 *   3. VIEWBOX. Every icon carries its own bleed (`-2 -8 74 74`, `-9 -2 76 76`
 *      …), so the viewBox is recorded and the renderer maps it onto whatever
 *      size the document asks for.
 *   4. SIZE. The whole set is bundled into the builder, so numbers are
 *      rounded to what a 64px icon can show (see `trim`) and whitespace is
 *      collapsed. A missing light file falls back to the dark art and is
 *      reported, rather than silently shipping dark artwork into a light
 *      illustration.
 *
 * Keys are the icon's name, slugged (`global-services`), or category and
 * name where two categories share a name. The icons illustrations already
 * used keep their original short keys (`LEGACY`), so no document changes.
 *
 *   node --experimental-strip-types scripts/build-glass-icons.ts
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseFigmaSvg as normalise } from '../src/figmaGlass.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'assets', 'glass-icons');

/** The keys documents already reference, by the file they now come from. */
const LEGACY: Record<string, string> = {
  'General - Composable': 'composable',
  'Platform - Premium Security': 'security',
  'Security - Security & Compliance': 'compliance',
  'Business - Dashboard': 'dashboard',
  'Performance - Analytics': 'analytics',
  'General - Personalization': 'personalization',
  'Data - Database': 'database',
  'Commerce - PIM': 'pim',
  'Product Modules - DXP': 'dxp',
  'Product Modules - Commerce': 'commerce',
  'Industries - Integration': 'integration',
  'General - Mail': 'mail',
  'General - Performance': 'performance',
  'Content - Search': 'search',
  'General - ai': 'ai',
  'Data - DAM': 'dam',
  'Content - Sites': 'sites',
  'Product Modules - Content Marketing Platform': 'campaigns',
  'Business - Costly': 'costly',
};

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every icon in the folder: `{ base: "Category - Name", category, name }`. */
const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const bases = [...new Set(files.map((f) => f.replace(/ - (Light|Dark)\.svg$/, '')))].sort();
const parsed = bases.map((base) => {
  const i = base.indexOf(' - ');
  return { base, category: base.slice(0, i), name: base.slice(i + 3) };
});
const nameCount = new Map<string, number>();
for (const p of parsed) nameCount.set(slug(p.name), (nameCount.get(slug(p.name)) ?? 0) + 1);
const legacyKeys = new Set(Object.values(LEGACY));

const MANIFEST = parsed.map((p) => {
  let key = LEGACY[p.base];
  if (!key) {
    key = slug(p.name);
    // Shared names, and names that would take a legacy key, carry their category.
    if ((nameCount.get(key) ?? 0) > 1 || legacyKeys.has(key)) key = slug(`${p.category} ${p.name}`);
  }
  return { key, ...p };
});

/** Measured viewBoxes for the icons the frame clipped. See `unclipFrame`. */
const VIEWBOXES = JSON.parse(readFileSync(join(DIR, 'viewboxes.json'), 'utf8')) as Record<
  string,
  { dark?: [number, number, number, number]; light?: [number, number, number, number] }
>;

const entries: string[] = [];
const missingLight: string[] = [];
let bytes = 0;

for (const { key, base, category, name } of MANIFEST) {
  const darkFile = join(DIR, `${base} - Dark.svg`);
  const lightFile = join(DIR, `${base} - Light.svg`);
  const hasDark = existsSync(darkFile);
  const hasLight = existsSync(lightFile);
  if (!hasDark && !hasLight) continue;
  if (!hasLight) missingLight.push(base);

  const vb = VIEWBOXES[base];
  const dark = normalise(readFileSync(hasDark ? darkFile : lightFile, 'utf8'), `${key}-d-`, { viewBox: vb?.dark });
  const light = normalise(readFileSync(hasLight ? lightFile : darkFile, 'utf8'), `${key}-l-`, { viewBox: vb?.light });
  bytes += dark.body.length + light.body.length;

  entries.push(
    `  ${JSON.stringify(key)}: {\n` +
      `    source: ${JSON.stringify(base)},\n` +
      `    category: ${JSON.stringify(category)},\n` +
      `    label: ${JSON.stringify(name)},\n` +
      `    lightIsFallback: ${!hasLight},\n` +
      `    dark: { viewBox: ${JSON.stringify(dark.viewBox)}, body: ${JSON.stringify(dark.body)} },\n` +
      `    light: { viewBox: ${JSON.stringify(light.viewBox)}, body: ${JSON.stringify(light.body)} },\n` +
      `  },`,
  );
}

const out = `/**
 * GENERATED — do not edit. Run \`npm run icons\` to regenerate.
 *
 * The glass icon set, imported from assets/glass-icons/ and normalised for
 * inlining. See scripts/build-glass-icons.ts for what "normalised" means.
 *
 * Every id in \`body\` is prefixed with the literal token \`__NS__\`, which the
 * renderer replaces with a per-instance namespace. Inline this markup without
 * doing that substitution and two copies of the same icon on one page will
 * fight over their gradient ids.
 *
 * ${MANIFEST.length} icons. ${missingLight.length} have no light variant and fall back to
 * the dark artwork — flagged per-entry as \`lightIsFallback\`.
 */

export interface GlassIconArt {
  /** The source viewBox, which carries each icon's own bleed. */
  viewBox: [number, number, number, number];
  /** SVG markup whose ids carry the \`__NS__\` placeholder. */
  body: string;
}

export interface GlassIcon {
  /** Source file name, without the theme suffix, for traceability. */
  source: string;
  /** The set's own grouping — Business, Commerce, Security … */
  category: string;
  /** The icon's name as the set gives it. */
  label: string;
  /** True when \`light\` is really the dark artwork. */
  lightIsFallback: boolean;
  dark: GlassIconArt;
  light: GlassIconArt;
}

export const GLASS_ICONS: Record<string, GlassIcon> = {
${entries.join('\n')}
};

export type GlassIconKey = keyof typeof GLASS_ICONS;

/** Keys whose light rendering is really dark artwork. */
export const GLASS_ICONS_MISSING_LIGHT: string[] = ${JSON.stringify(missingLight)};
`;

const dest = join(ROOT, 'src', 'glassIcons.generated.ts');
writeFileSync(dest, out);

console.log(`wrote src/glassIcons.generated.ts`);
console.log(`  ${MANIFEST.length} icons, ${(bytes / 1024).toFixed(0)} KB of markup`);
console.log(`  ${(out.length / 1024).toFixed(0)} KB module`);
if (missingLight.length) {
  console.log(`  no light variant (falls back to dark): ${missingLight.join(', ')}`);
}
