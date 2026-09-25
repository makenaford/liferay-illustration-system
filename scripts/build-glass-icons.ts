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
import { softenGlassRim } from '../src/importAsset.ts';

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

/**
 * Round a number to what a 64px icon can show: two decimals above 10, three
 * above 1, four significant figures below — small values are gradient
 * matrix terms, where two decimals would flatten them to zero.
 */
function trim(n: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  const a = Math.abs(v);
  const r = a >= 10 ? v.toFixed(2) : a >= 1 ? v.toFixed(3) : v.toPrecision(4);
  return String(Number(r));
}

interface Processed {
  viewBox: [number, number, number, number];
  body: string;
}

/* ---- a minimal SVG tree, for the two fixes that need structure ---------- */

interface XNode {
  /** Raw opening tag, e.g. `<g filter="url(#f)">`; empty for text. */
  open: string;
  tag: string;
  children: XNode[];
  selfClosing: boolean;
  text?: string;
}

/** Parse Figma's well-formed export: tags, attributes, no CDATA. */
function parse(src: string): XNode {
  const root: XNode = { open: '', tag: '#root', children: [], selfClosing: false };
  const stack = [root];
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    const t = m[0];
    const top = stack[stack.length - 1];
    if (t.startsWith('<!--')) continue;
    if (t.startsWith('</')) {
      stack.pop();
      continue;
    }
    if (!t.startsWith('<')) {
      top.children.push({ open: '', tag: '#text', children: [], selfClosing: false, text: t });
      continue;
    }
    const tag = t.match(/^<([a-zA-Z][\w:-]*)/)![1];
    const node: XNode = { open: t, tag, children: [], selfClosing: t.endsWith('/>') };
    top.children.push(node);
    if (!node.selfClosing) stack.push(node);
  }
  return root;
}

function serialise(n: XNode): string {
  if (n.tag === '#text') return n.text ?? '';
  if (n.tag === '#root') return n.children.map(serialise).join('');
  if (n.selfClosing) return n.open;
  return `${n.open}${n.children.map(serialise).join('')}</${n.tag}>`;
}

const attr = (n: XNode, name: string) => n.open.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/**
 * BACKGROUND BLUR, made portable. Figma exports a glass shape's backdrop
 * blur as a `<foreignObject>` whose HTML child carries
 * `backdrop-filter: blur(Npx)` clipped to the shape — browser-only, so it
 * was being stripped and the frosted white shapes lost their frost.
 *
 * What a backdrop blur shows is whatever was drawn before it, blurred, inside
 * the shape. So each `<foreignObject>` becomes exactly that: the siblings
 * painted before it, re-drawn by reference under a `feGaussianBlur` of the
 * same radius, clipped to the same shape. The blur covers the icon's own artwork, which
 * is what sits behind its glass; the page behind an icon is not reachable
 * from inside an SVG, and is not what the effect is doing here anyway.
 */
function portableBackdropBlur(svg: string): string {
  const root = parse(svg);
  const defs: string[] = [];
  const clipFixes: string[] = [];
  let n = 0;

  const painted = (c: XNode) =>
    !['#text', 'defs', 'clipPath', 'filter', 'foreignObject', 'mask'].includes(c.tag) && !c.open.includes('data-bd');

  /** Re-draw `behind` by reference, blurred, under `wrapAttr` (a clip or mask). */
  const blurred = (behind: XNode[], wrapAttr: string, radius: number, region: string): XNode => {
    const id = `bdblur${n++}`;
    defs.push(
      `<filter id="${id}" ${region} color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${radius}"/></filter>`,
    );
    const uses = behind
      .map((b) => {
        let bid = attr(b, 'id');
        if (!bid) {
          bid = `bdsrc${n}-${behind.indexOf(b)}`;
          b.open = b.open.replace(/^<([\w:-]+)/, `<$1 id="${bid}"`);
        }
        return `<use href="#${bid}"/>`;
      })
      .join('');
    return {
      open: `<g ${wrapAttr} data-bd="">`,
      tag: 'g',
      selfClosing: false,
      children: [{ open: '', tag: '#text', children: [], selfClosing: false, text: `<g filter="url(#${id})">${uses}</g>` }],
    };
  };

  /**
   * A glass shape Figma did not export a blur for. Figma drops the
   * foreignObject for some glass — notably masked shapes — so the shape is
   * frosted in the design file and clear in the export. A glass shape is a
   * group carrying the glass effect (drop shadow plus two inner shadows,
   * which Figma names `_dii_`); without a blur in front of it, one is made
   * from its own outline: its mask when it is masked, otherwise a clip built
   * from references to its shapes. Radius: Figma's recorded bg-blur radius
   * halved (CSS blur is a radius, Figma's a diameter), or the 3px the
   * exported blurs use.
   */
  const synthesise = (parent: XNode, glass: XNode, at: number): XNode[] => {
    const behind = parent.children.slice(0, at).filter(painted);
    if (!behind.length) return [];
    const radius = Number(attr(glass, 'data-figma-bg-blur-radius') ?? 6) / 2;
    const region = 'x="-50%" y="-50%" width="200%" height="200%"';
    const kids = glass.children.filter((c) => c.tag !== '#text');
    const mask = kids.find((c) => c.tag === 'mask');
    if (mask && attr(mask, 'id')) return [blurred(behind, `mask="url(#${attr(mask, 'id')})"`, radius, region)];
    const shapes = kids.filter((c) => ['path', 'rect', 'circle', 'ellipse', 'polygon'].includes(c.tag));
    if (!shapes.length) return [];
    const clipId = `bdclip${n}`;
    const refs = shapes
      .map((sh, k) => {
        let sid = attr(sh, 'id');
        if (!sid) {
          sid = `bdshape${n}-${k}`;
          sh.open = sh.open.replace(/^<([\w:-]+)/, `<$1 id="${sid}"`);
        }
        return `<use href="#${sid}"/>`;
      })
      .join('');
    defs.push(`<clipPath id="${clipId}">${refs}</clipPath>`);
    return [blurred(behind, `clip-path="url(#${clipId})"`, radius, region)];
  };

  const visit = (parent: XNode) => {
    let covered = false;
    parent.children = parent.children.flatMap((child, i) => {
      if (child.tag !== 'foreignObject') {
        visit(child);
        const isGlass = child.tag === 'g' && /_dii/.test(attr(child, 'filter') ?? '');
        const out = isGlass && !covered ? [...synthesise(parent, child, i), child] : [child];
        if (child.tag !== '#text') covered = false;
        return out;
      }
      covered = true;
      const style = child.children.find((c) => c.tag === 'div')?.open ?? '';
      const blur = Number(style.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
      const clip = style.match(/clip-path:url\(#([^)]+)\)/)?.[1];
      const behind = parent.children
        .slice(0, i)
        .filter((c) => !['#text', 'defs', 'clipPath', 'filter', 'foreignObject', 'mask'].includes(c.tag))
        .filter((c) => !c.open.includes('data-bd'));
      if (!blur || !clip || !behind.length) return [];

      const id = `bdblur${n++}`;
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => attr(child, k) ?? '0');
      defs.push(
        `<filter id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
      );
      clipFixes.push(clip);
      // References, not copies: each shape behind the glass gets an id (if it
      // has none) and is re-drawn with <use>, so the blur costs a few bytes.
      const copies = behind
        .map((b) => {
          let bid = attr(b, 'id');
          if (!bid) {
            bid = `bdsrc${n}-${behind.indexOf(b)}`;
            b.open = b.open.replace(/^<([\w:-]+)/, `<$1 id="${bid}"`);
          }
          return `<use href="#${bid}"/>`;
        })
        .join('');
      return [
        {
          open: `<g clip-path="url(#${clip})" data-bd="">`,
          tag: 'g',
          selfClosing: false,
          children: [{ open: '', tag: '#text', children: [], selfClosing: false, text: `<g filter="url(#${id})">${copies}</g>` }],
        },
      ];
    });
  };
  visit(root);

  let out = serialise(root);
  // The clip was drawn in the foreignObject's own coordinates — Figma offsets
  // it with a translate(-x -y). Used from the SVG's space, that offset goes.
  for (const clip of clipFixes) {
    out = out.replace(new RegExp(`(<clipPath id="${clip}")\\s+transform="[^"]*"`), '$1');
  }
  if (defs.length) {
    out = out.includes('<defs>')
      ? out.replace('<defs>', `<defs>${defs.join('')}`)
      : out.replace(/(<svg[^>]*>)/, `$1<defs>${defs.join('')}</defs>`);
  }
  return out.replace(/\sdata-bd=""/g, '');
}

/**
 * The frame clip, removed where it cuts artwork. Figma exports each icon
 * inside a `clip-path` the size of its frame, and 28 icons draw past it —
 * a coin, a handle, a pin, cut flat. Those have a measured viewBox in
 * `viewboxes.json` that holds the whole artwork; for them the frame clip (a
 * clipPath holding a single frame-sized rect) is dropped. Other icons keep
 * theirs.
 */
function unclipFrame(svg: string): string {
  const frames = [...svg.matchAll(/<clipPath id="([^"]+)"[^>]*>\s*<rect([^>]*)\/>\s*<\/clipPath>/g)]
    .filter((m) => {
      const w = Number(m[2].match(/width="([\d.]+)"/)?.[1] ?? 0);
      const h = Number(m[2].match(/height="([\d.]+)"/)?.[1] ?? 0);
      return w >= 56 && h >= 56;
    })
    .map((m) => m[1]);
  let s = svg;
  for (const id of frames) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`\\sclip-path="url\\(#${esc}\\)"`, 'g'), '');
    s = s.replace(new RegExp(`<clipPath id="${esc}"[^>]*>[\\s\\S]*?<\\/clipPath>`), '');
  }
  return s;
}

/** Measured viewBoxes for the icons the frame clipped. See `unclipFrame`. */
const VIEWBOXES = JSON.parse(readFileSync(join(DIR, 'viewboxes.json'), 'utf8')) as Record<
  string,
  { dark?: [number, number, number, number]; light?: [number, number, number, number] }
>;

function normalise(svg: string, ns: string, fix?: { viewBox?: [number, number, number, number] }): Processed {
  let s = svg;

  // 1. The background blur, rebuilt portably; then anything left of the hack.
  s = portableBackdropBlur(s);
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/g, '');
  if (fix?.viewBox) s = unclipFrame(s);

  const vbMatch = s.match(/viewBox="([^"]+)"/);
  const viewBox = fix?.viewBox ??
    ((vbMatch ? vbMatch[1].trim().split(/\s+/).map(Number) : [0, 0, 64, 64]) as [number, number, number, number]);

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

  // The glass edge, softened — see `softenGlassRim`. Without it every frosted
  // shape arrives with an opaque white outline, because the backdrop blur that
  // was meant to sit behind it cannot survive export.
  s = softenGlassRim(s);

  // Size: long decimals rounded, whitespace between tags dropped.
  s = s.replace(/-?\d*\.\d{4,}(?:e-?\d+)?/g, trim);
  s = s.replace(/>\s+</g, '><');

  return { viewBox, body: s.trim() };
}

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
