import { softenGlassRim } from './importAsset.ts';

/**
 * FIGMA GLASS, MADE PORTABLE — shared by every import of Figma glass artwork:
 * the glass icon set (scripts/build-glass-icons.ts), the built-in graphics
 * (scripts/build-graphics.ts), and graphics uploaded to the Marketing Assets
 * site. Pure string work, so it runs in Node and in the browser alike.
 *
 * See `portableBackdropBlur` and `normaliseFigmaSvg` for what is fixed.
 */

export interface GlassOptions {
  /**
   * Also treat as glass any group straight after Figma's `foreignObject`
   * blur, whatever its filter is called. The icon set's glass is always a
   * `_dii_` group (drop shadow and two inner shadows); larger graphics carry
   * glass with only inner shadows (`_i_`, `_ii_`), which this catches. Off
   * for the icon set, whose output must not move.
   */
  anyBlurredGroup?: boolean;
}

export interface Processed {
  viewBox: [number, number, number, number];
  body: string;
}

/**
 * Round a number to what a 64px icon can show: two decimals above 10, three
 * above 1, four significant figures below — small values are gradient
 * matrix terms, where two decimals would flatten them to zero.
 */
export function trim(n: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  const a = Math.abs(v);
  const r = a >= 10 ? v.toFixed(2) : a >= 1 ? v.toFixed(3) : v.toPrecision(4);
  return String(Number(r));
}

/**
 * Every glass shape's background blur: Figma's 6. Figma's value is twice the
 * blur radius — its own export writes a background blur of 6 as CSS
 * `blur(3px)` — so 6 is a 3px Gaussian here, the `stdDeviation` CSS and SVG
 * share. The exports carry 4 on most icons and odd values on a few; the
 * glass is meant to be one material, so they are all set to this.
 */
const FIGMA_BG_BLUR = 6;
const GLASS_BACKDROP_BLUR = FIGMA_BG_BLUR / 2;

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
 * BACKGROUND BLUR, made portable.
 *
 * A glass shape's background blur means: inside the shape, whatever is
 * behind it is seen blurred — and ONLY blurred. Figma exports it as a
 * `<foreignObject>` carrying CSS `backdrop-filter`, which only a browser
 * renders; for some glass (notably masked shapes) it exports nothing at all.
 *
 * Both become the same plain-SVG construction, for every glass shape — a
 * group carrying Figma's glass effect (drop shadow and two inner shadows,
 * which it names `_dii_`):
 *
 *   1. everything drawn before the glass is wrapped in a mask that cuts the
 *      glass's outline OUT of it, so the sharp artwork is gone from under the
 *      glass — without this, a blurred copy laid on top lets the sharp
 *      original show through wherever the blur thins, at every edge, and the
 *      glass reads as clear;
 *   2. the same artwork is re-drawn by reference under an feGaussianBlur and
 *      confined to the glass's outline — its mask when it is masked, the
 *      foreignObject's clip when Figma exported one, otherwise its shapes;
 *   3. then the glass itself.
 *
 * Glass after glass composes: a later shape's cut and blur take in the
 * earlier ones. The page behind an icon is not reachable from inside an SVG,
 * so what blurs is the icon's own artwork, which is what sits behind its
 * glass.
 */
export function portableBackdropBlur(svg: string, opts: GlassOptions = {}): string {
  const root = parse(svg);
  const defs: string[] = [];
  const clipFixes: string[] = [];
  let n = 0;

  // Every node by id, for finding a foreignObject's clip path.
  const byId = new Map<string, XNode>();
  const index = (node: XNode) => {
    const id = attr(node, 'id');
    if (id) byId.set(id, node);
    node.children.forEach(index);
  };
  index(root);

  const isPainted = (c: XNode) => !['#text', 'defs', 'clipPath', 'filter', 'foreignObject', 'mask'].includes(c.tag);
  const SHAPES = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'];
  const ensureId = (node: XNode, base: string) => {
    let id = attr(node, 'id');
    if (!id) {
      id = base;
      node.open = node.open.replace(/^<([\w:-]+)/, `<$1 id="${id}"`);
    }
    return id;
  };
  const text = (t: string): XNode => ({ open: '', tag: '#text', children: [], selfClosing: false, text: t });
  const group = (openAttrs: string, children: XNode[]): XNode => ({ open: `<g ${openAttrs}>`, tag: 'g', selfClosing: false, children });

  /** The glass outline as black shapes, for cutting it out of a mask. */
  const blackCopies = (shapes: XNode[]) =>
    shapes
      .map((sh) =>
        serialise(sh)
          .replace(/\s(?:fill|fill-opacity|opacity|style|id)="[^"]*"/g, '')
          .replace(/^<([\w:-]+)/, '<$1 fill="black"'),
      )
      .join('');

  /** The glass's outline: its shape nodes, and how to confine a layer to it. */
  const outlineOf = (glass: XNode, foClip?: string): { shapes: XNode[]; confine: string } | null => {
    if (foClip) {
      const cp = byId.get(foClip);
      if (cp) return { shapes: cp.children.filter((c) => SHAPES.includes(c.tag)), confine: `clip-path="url(#${foClip})"` };
    }
    const kids = glass.children.filter((c) => c.tag !== '#text');
    const mask = kids.find((c) => c.tag === 'mask');
    if (mask && attr(mask, 'id')) {
      return { shapes: mask.children.filter((c) => SHAPES.includes(c.tag)), confine: `mask="url(#${attr(mask, 'id')})"` };
    }
    const shapes = kids.filter((c) => SHAPES.includes(c.tag));
    if (!shapes.length) return null;
    const clipId = `bdclip${n}`;
    const refs = shapes.map((sh, k) => `<use href="#${ensureId(sh, `bdshape${n}-${k}`)}"/>`).join('');
    defs.push(`<clipPath id="${clipId}">${refs}</clipPath>`);
    return { shapes, confine: `clip-path="url(#${clipId})"` };
  };

  const visit = (parent: XNode) => {
    const out: XNode[] = [];
    let pendingClip: string | undefined;
    for (const child of parent.children) {
      if (child.tag === 'foreignObject') {
        // Figma's exported blur: keep only its clip, for the glass that follows.
        const style = child.children.find((c) => c.tag === 'div')?.open ?? '';
        pendingClip = style.match(/clip-path:url\(#([^)]+)\)/)?.[1];
        continue;
      }
      visit(child);
      const isGlass =
        child.tag === 'g' &&
        (/_dii/.test(attr(child, 'filter') ?? '') || (!!opts.anyBlurredGroup && !!pendingClip && !!attr(child, 'filter')));
      if (!isGlass) {
        if (child.tag !== '#text') pendingClip = undefined;
        out.push(child);
        continue;
      }
      const behind = out.filter(isPainted);
      const outline = behind.length ? outlineOf(child, pendingClip) : null;
      if (pendingClip) clipFixes.push(pendingClip);
      pendingClip = undefined;
      if (!outline || !outline.shapes.length) {
        out.push(child);
        continue;
      }
      const k = n++;
      // 1. The glass's outline cut out of what is behind it.
      const inv = `bdcut${k}`;
      defs.push(
        `<mask id="${inv}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="600" height="600">` +
          `<rect x="-200" y="-200" width="600" height="600" fill="white"/>${blackCopies(outline.shapes)}</mask>`,
      );
      // 2. What is behind it, blurred, inside the outline.
      const blur = `bdblur${k}`;
      defs.push(
        `<filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
          `<feGaussianBlur stdDeviation="${GLASS_BACKDROP_BLUR}"/></filter>`,
      );
      const refs = behind.map((b, j) => `<use href="#${ensureId(b, `bdsrc${k}-${j}`)}"/>`).join('');
      const rest = out.splice(0, out.length);
      out.push(
        group(`mask="url(#${inv})"`, rest),
        group(outline.confine, [text(`<g filter="url(#${blur})">${refs}</g>`)]),
        child,
      );
    }
    parent.children = out;
  };
  visit(root);

  let out = serialise(root);
  // A foreignObject's clip was drawn in the foreignObject's own coordinates —
  // Figma offsets it with a translate(-x -y). Used from the SVG's space, that
  // offset goes.
  for (const clip of clipFixes) {
    out = out.replace(new RegExp(`(<clipPath id="${clip}")\\s+transform="[^"]*"`), '$1');
  }
  if (defs.length) {
    out = out.includes('<defs>')
      ? out.replace('<defs>', `<defs>${defs.join('')}`)
      : out.replace(/(<svg[^>]*>)/, `$1<defs>${defs.join('')}</defs>`);
  }
  return out;
}

/**
 * The frame clip, removed where it cuts artwork. Figma exports each icon
 * inside a `clip-path` the size of its frame, and 28 icons draw past it —
 * a coin, a handle, a pin, cut flat. Those have a measured viewBox in
 * `viewboxes.json` that holds the whole artwork; for them the frame clip (a
 * clipPath holding a single frame-sized rect) is dropped. Other icons keep
 * theirs.
 */
export function unclipFrame(svg: string): string {
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

export function normaliseFigmaSvg(
  svg: string,
  ns: string,
  fix?: { viewBox?: [number, number, number, number] },
  opts: GlassOptions = {},
): Processed {
  let s = svg;

  // 1. The background blur, rebuilt portably; then anything left of the hack.
  s = portableBackdropBlur(s, opts);
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

