import { BACK, FRONT, type GlassIconSpec, type GlyphBounds, type Layer, type LayerPath } from './glassIconMaker.ts';

/**
 * GLASS REBUILD — an existing glass icon, taken apart into the builder's two
 * layers, so it can be drawn again by the builder (src/glassIconMaker.ts)
 * in the house layout, gradient and glass.
 *
 * A glass icon from the set is Figma's export: the frosted shape(s) inside a
 * group carrying Figma's glass (marked `data-figma-bg-blur-radius`, its
 * filter named `_dii`, `_ii` and the like), and the shape(s) behind painted
 * with a linear gradient — filled or stroked, directly or as a gradient rect
 * cut to shape by a mask. Each layer's shapes keep their own paths; they are
 * measured in the icon's frame and fitted, as a whole, onto the builder's
 * 24px grid the way a MingCute glyph sits on it (INK). What doesn't take
 * apart cleanly is flagged, not guessed.
 *
 * Runs in the browser: the browser's own SVG engine measures the shapes,
 * transforms and all.
 */

/** How much of the 24px grid a layer's ink fills, as a MingCute glyph's does. */
const INK = 20;

export type Flag =
  | 'no glass shape'
  | 'no gradient shape'
  | 'several glass shapes'
  | 'several gradient shapes'
  | 'masked shapes'
  | 'not a path'
  | 'stroked shapes'
  | 'back sized differently'
  | 'back placed differently';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rebuilt {
  /** What to hand the builder; undefined when a layer is missing. */
  spec?: GlassIconSpec;
  flags: Flag[];
  /** Where each layer's ink was in the original, in its 64px frame. */
  original: { front?: Box; back?: Box };
  /** Where the builder puts it. */
  rebuilt: { front?: Box; back?: Box };
  /**
   * How the layout changed. `sizeRatio`: the back's size over the front's,
   * in the original and as rebuilt (the builder's is about 0.7). `offset`:
   * how far, in frame px, the back's place relative to the front moved.
   */
  layout?: { sizeRatio: { was: number; now: number }; offset: number };
  counts: { front: number; back: number };
}

/** Past these, the rebuilt layout is flagged as different from the original. */
export const LIMITS = { sizeRatio: 0.15, offset: 6 };

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A shape as path data, in its own coordinates. */
function pathData(el: SVGGraphicsElement): string | null {
  const n = (a: string) => Number(el.getAttribute(a) ?? 0);
  switch (el.tagName) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      let rx = el.hasAttribute('rx') ? n('rx') : n('ry');
      let ry = el.hasAttribute('ry') ? n('ry') : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n('cx'), n('cy')];
      const rx = el.tagName === 'circle' ? n('r') : n('rx');
      const ry = el.tagName === 'circle' ? n('r') : n('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const pts = (el.getAttribute('points') ?? '').trim();
      return pts ? `M${pts}${el.tagName === 'polygon' ? 'Z' : ''}` : null;
    }
  }
  return null;
}

const matrixOf = (m: DOMMatrix) =>
  m.isIdentity ? undefined : `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;

/**
 * The element's transform up to the icon's root, as a matrix. Masks and
 * clip paths are drawn in the space of what uses them, so a shape inside
 * one takes the transform of the element that points at it.
 */
function toRoot(el: Element, root: SVGSVGElement, via?: Element): DOMMatrix {
  let m = new DOMMatrix();
  let node: Element | null = el;
  const chain: Element[] = [];
  while (node && node !== root) {
    chain.unshift(node);
    if (node.tagName === 'mask' || node.tagName === 'clipPath') {
      node = via ?? null;
      via = undefined;
      continue;
    }
    node = node.parentElement;
  }
  for (const n of chain) {
    const t = (n as SVGGraphicsElement).transform?.baseVal?.consolidate?.();
    if (t && n.tagName !== 'mask' && n.tagName !== 'clipPath') m = m.multiply(t.matrix);
  }
  return m;
}

interface Piece {
  d: string;
  m: DOMMatrix;
  paint?: LayerPath['paint'];
}

/** How a shape is drawn: its fill rule, or its stroke. */
function paintOf(el: Element): LayerPath['paint'] {
  const a = (n: string) => el.getAttribute(n) ?? undefined;
  const stroke = a('stroke');
  if (stroke && stroke !== 'none' && (!a('fill') || a('fill') === 'none')) {
    return {
      stroke: { width: Number(a('stroke-width') ?? 1), linecap: a('stroke-linecap'), linejoin: a('stroke-linejoin') },
    };
  }
  const rule = a('fill-rule');
  return rule === 'evenodd' ? { fillRule: 'evenodd' } : undefined;
}

/** Where the pieces' ink lies in the frame. */
function measure(pieces: Piece[], host: SVGSVGElement): Box | undefined {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pieces) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', p.d);
    host.appendChild(path);
    const g = path.getBBox();
    path.remove();
    // A stroke reaches half its width past the path.
    const w = (p.paint?.stroke?.width ?? 0) / 2;
    const b = { x: g.x - w, y: g.y - w, width: g.width + 2 * w, height: g.height + 2 * w };
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ]) {
      const q = new DOMPoint(x, y).matrixTransform(p.m);
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}

/** Fit a layer's ink, centred, onto the grid as a glyph's would sit. */
function fit(pieces: Piece[], box: Box): { layer: Layer; bounds: GlyphBounds } {
  const scale = INK / Math.max(box.width, box.height);
  const tx = 12 - (box.x + box.width / 2) * scale;
  const ty = 12 - (box.y + box.height / 2) * scale;
  return {
    layer: {
      paths: pieces.map((p) => ({ d: p.d, transform: matrixOf(p.m), ...(p.paint ? { paint: p.paint } : {}) })),
      toGrid: { scale, tx, ty },
    },
    bounds: { x: box.x * scale + tx, y: box.y * scale + ty, width: box.width * scale, height: box.height * scale },
  };
}

/** Where a layer fitted onto the grid lands in the frame. */
const inFrame = (place: typeof FRONT, b: GlyphBounds): Box => {
  const k = place.size / 24;
  return { x: place.x + b.x * k, y: place.y + b.y * k, width: b.width * k, height: b.height * k };
};
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Take an existing glass icon's SVG apart into the builder's two layers. */
export function rebuild(svg: string): Rebuilt {
  const flags = new Set<Flag>();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const source = doc.documentElement;
  // Measured in the page, where the browser lays SVG out.
  const host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  host.appendChild(document.importNode(source, true));
  document.body.appendChild(host);
  const root = host.firstElementChild as SVGSVGElement;
  try {
    const byId = (id: string) => root.querySelector(`[id="${CSS.escape(id)}"]`);
    const ref = (v: string | null) => v?.match(/url\(#([^)]+)\)/)?.[1];
    const inDefs = (el: Element) => !!el.closest('defs, mask, clipPath, pattern, symbol');

    /** A shape, or — for a gradient rect cut by a mask — the mask's shapes. */
    const piecesOf = (el: Element): Piece[] => {
      const masked = el.closest('[mask]');
      const mask = masked && masked !== root ? byId(ref(masked.getAttribute('mask')) ?? '') : null;
      if (mask && el.tagName === 'rect') {
        flags.add('masked shapes');
        return [...mask.querySelectorAll<SVGGraphicsElement>(SHAPES)].flatMap((s) => {
          const d = pathData(s);
          return d ? [{ d, m: toRoot(s, root, masked ?? undefined), paint: paintOf(s) }] : [];
        });
      }
      const d = pathData(el as SVGGraphicsElement);
      if (!d) return [];
      if (el.tagName !== 'path') flags.add('not a path');
      const paint = paintOf(el);
      if (paint?.stroke) flags.add('stroked shapes');
      return [{ d, m: toRoot(el, root), paint }];
    };

    // Figma marks every glass group with its background blur; older exports
    // are known by their glass filter's name (`_dii`, `_ii`…).
    const glassGroups = [...root.querySelectorAll('g[filter]')].filter(
      (g) => g.hasAttribute('data-figma-bg-blur-radius') || /_d?i+_/.test(g.getAttribute('filter') ?? ''),
    );
    const topGlass = glassGroups.filter((g) => !glassGroups.some((o) => o !== g && o.contains(g)));
    const frontEls = topGlass.flatMap((g) => [...g.querySelectorAll(SHAPES)].filter((el) => !inDefs(el)));
    const gradient = (el: Element) =>
      /url\(#[^)]*linear/i.test(el.getAttribute('fill') ?? '') || /url\(#[^)]*linear/i.test(el.getAttribute('stroke') ?? '');
    const backEls = [...root.querySelectorAll(SHAPES)].filter(
      (el) => !inDefs(el) && !topGlass.some((g) => g.contains(el)) && gradient(el),
    );
    const front = frontEls.flatMap(piecesOf);
    const back = backEls.flatMap(piecesOf);
    if (!front.length) flags.add('no glass shape');
    if (!back.length) flags.add('no gradient shape');
    if (topGlass.length > 1 || frontEls.length > 1) flags.add('several glass shapes');
    if (backEls.length > 1) flags.add('several gradient shapes');

    const original = { front: measure(front, host), back: measure(back, host) };
    const result: Rebuilt = {
      flags: [],
      original,
      rebuilt: {},
      counts: { front: front.length, back: back.length },
    };
    if (original.front && original.back) {
      const f = fit(front, original.front);
      const b = fit(back, original.back);
      result.spec = { front: f.layer, back: b.layer, frontBounds: f.bounds, backBounds: b.bounds };
      result.rebuilt = { front: inFrame(FRONT, f.bounds), back: inFrame(BACK, b.bounds) };
      // The back's size against the front's, and its place relative to it.
      const side = (b: Box) => Math.max(b.width, b.height);
      const was = { f: centre(original.front), b: centre(original.back) };
      const now = { f: centre(result.rebuilt.front!), b: centre(result.rebuilt.back!) };
      result.layout = {
        sizeRatio: {
          was: side(original.back) / side(original.front),
          now: side(result.rebuilt.back!) / side(result.rebuilt.front!),
        },
        offset: Math.hypot(was.b.x - was.f.x - (now.b.x - now.f.x), was.b.y - was.f.y - (now.b.y - now.f.y)),
      };
      if (Math.abs(result.layout.sizeRatio.was - result.layout.sizeRatio.now) > LIMITS.sizeRatio) {
        flags.add('back sized differently');
      }
      if (result.layout.offset > LIMITS.offset) flags.add('back placed differently');
    }
    result.flags = [...flags];
    return result;
  } finally {
    host.remove();
  }
}
