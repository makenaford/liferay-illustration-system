/**
 * Import the design system's glass icons into a generated TS module.
 *
 * The icons live in `liferay-sites-design-system/assets/glass-icons/` (dark)
 * and `assets/glass-icons-light/` (light) as 64px Figma-exported SVGs. Four
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
 *      used: renders in browsers, ignored by every SVG rasteriser. Stripped —
 *      the `<g filter>` underneath still draws the shape and its shadows, so
 *      the loss is a 3px blur behind a 30%-opacity rect.
 *   3. VIEWBOX. Every icon carries its own bleed (`-2 -8 74 74`, `-9 -2 76 76`
 *      …), so the viewBox is recorded and the renderer maps it onto whatever
 *      size the document asks for.
 *   4. LIGHT COVERAGE. Only 34 of the 165 icons have a light variant. Missing
 *      ones fall back to the dark art and are reported, rather than silently
 *      shipping dark artwork into a light illustration.
 *
 *   node --experimental-strip-types scripts/build-glass-icons.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Where the design system lives. Override with `SDS_PATH` — the default is
 * the sibling checkout, which is where it sits on a normal setup.
 */
const DS_ROOT = process.env.SDS_PATH ?? join(ROOT, '..', 'liferay-sites-design-system');
const DS = join(DS_ROOT, 'assets');

/**
 * The working set. Keyed by what the illustration means, not by the file path,
 * so a document says `dxp` rather than `Product/DXP`.
 */
const MANIFEST: { key: string; path: string }[] = [
  { key: 'composable', path: 'General/Composable' },
  { key: 'security', path: 'Platform/Premium Security' },
  { key: 'compliance', path: 'Security/Security & Compliance' },
  { key: 'dashboard', path: 'Business/Dashboard' },
  { key: 'analytics', path: 'Performance/Analytics' },
  { key: 'personalization', path: 'General/Personalization' },
  { key: 'database', path: 'Data/Database' },
  { key: 'pim', path: 'Commerce/PIM' },
  { key: 'dxp', path: 'Product/DXP' },
  { key: 'commerce', path: 'Product Modules/Commerce' },
  { key: 'integration', path: 'Industries/Integration' },
  { key: 'mail', path: 'General/Mail' },
  { key: 'performance', path: 'General/Performance' },
  { key: 'search', path: 'Content/Search' },
  { key: 'ai', path: 'General/ai' },
  { key: 'dam', path: 'Data/DAM' },
  { key: 'sites', path: 'Content/Sites' },
  { key: 'campaigns', path: 'Product Modules/Content Marketing Platform' },
  // Dark only — no light variant exists yet.
  { key: 'costly', path: 'Business/Costly' },
];

interface Processed {
  viewBox: [number, number, number, number];
  body: string;
}

function normalise(svg: string, ns: string): Processed {
  let s = svg;

  // 1. Drop the non-portable background-blur hack, and the clipPath it uses.
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/g, '');
  s = s.replace(/<clipPath id="bgblur[^"]*"[\s\S]*?<\/clipPath>/g, '');

  const vbMatch = s.match(/viewBox="([^"]+)"/);
  const viewBox = (vbMatch ? vbMatch[1].trim().split(/\s+/).map(Number) : [0, 0, 64, 64]) as
    [number, number, number, number];

  // 2. Keep only the inner markup.
  s = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  // 3. Namespace every id, and every reference to one. Collect first so a
  //    reference is never rewritten before its definition is known.
  const ids = [...new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  ids.forEach((id, i) => {
    const next = `__NS__${ns}${i}`;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(\\sid=")${esc}(")`, 'g'), `$1${next}$2`);
    s = s.replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${next})`);
    s = s.replace(new RegExp(`((?:xlink:)?href=")#${esc}(")`, 'g'), `$1#${next}$2`);
  });

  // `shape-rendering="crispEdges"` is a Figma export artifact that makes
  // scaled-down artwork look chewed; the icons are always scaled here.
  s = s.replace(/\s*shape-rendering="crispEdges"/g, '');

  return { viewBox, body: s.replace(/\n\s*\n/g, '\n').trim() };
}

const entries: string[] = [];
const missingLight: string[] = [];
let bytes = 0;

for (const { key, path } of MANIFEST) {
  const darkFile = join(DS, 'glass-icons', `${path}.svg`);
  const lightFile = join(DS, 'glass-icons-light', `${path}.svg`);
  if (!existsSync(darkFile)) throw new Error(`Missing icon: ${path}`);

  const dark = normalise(readFileSync(darkFile, 'utf8'), `${key}-d-`);
  const hasLight = existsSync(lightFile);
  if (!hasLight) missingLight.push(path);
  const light = normalise(
    readFileSync(hasLight ? lightFile : darkFile, 'utf8'),
    `${key}-l-`,
  );

  bytes += dark.body.length + light.body.length;

  entries.push(
    `  ${JSON.stringify(key)}: {\n` +
      `    source: ${JSON.stringify(path)},\n` +
      `    lightIsFallback: ${!hasLight},\n` +
      `    dark: { viewBox: ${JSON.stringify(dark.viewBox)}, body: ${JSON.stringify(dark.body)} },\n` +
      `    light: { viewBox: ${JSON.stringify(light.viewBox)}, body: ${JSON.stringify(light.body)} },\n` +
      `  },`,
  );
}

const out = `/**
 * GENERATED — do not edit. Run \`npm run icons\` to regenerate.
 *
 * The design system's glass icons, imported from
 * liferay-sites-design-system/assets/glass-icons{,-light}/ and normalised for
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
  /** Path in the design system, for traceability. */
  source: string;
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
