import type { Doc, Element } from '../src/document.ts';
import { COLORS } from '../src/colors.ts';
import { TYPE_ROLES, type TypeRole, type TypeWeight } from '../src/primitives/text.ts';
import type { SurfaceName } from '../src/tokens.ts';
import { pickFile } from './pickFile.ts';

/**
 * A FIGMA SVG, AS AN ILLUSTRATION — "New from a Figma SVG…".
 *
 * Takes a frame exported from Figma as SVG and builds a document out of it
 * that the builder can edit, rather than one picture to place. No AI: it
 * reads Figma's own export, whose structure is regular —
 *
 *   - live `<text>` with a `<tspan>` per line, when "Outline text" is off,
 *     becomes TEXT: the nearest step on the type scale, the nearest colour
 *     token, its weight, at its baseline
 *   - a group or shape whose first painted child is a rounded rectangle —
 *     a card, a panel, a pill — becomes a CARD, its surface read from its
 *     fill: blue tint is `glass-default`, white glass `glass-highlighted`,
 *     opaque blue `solid`, an opaque gradient `gradient`, a stroke alone
 *     `outline`
 *   - a shape filled with an image pattern — a screenshot — becomes an IMAGE
 *   - everything else, icons and vector art included, is kept as it was
 *     drawn: consecutive shapes become one embedded SVG in their place, with
 *     every definition they use, so nothing is lost, only not yet editable
 *
 * It runs in the browser: the SVG is laid out off-screen so every shape can
 * be measured exactly where Figma drew it, transforms and all.
 */

export interface FigmaImport {
  doc: Doc;
  /** The theme the frame was drawn for, from its text: light ink is a dark design. */
  theme: 'dark' | 'light';
  /** What a designer should know — outlined text, say. */
  notes: string[];
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'image']);
const SKIP = new Set(['defs', 'mask', 'clipPath', 'foreignObject', 'style', 'title', 'desc', 'metadata', 'filter', 'linearGradient', 'radialGradient', 'pattern', 'symbol']);

const r2 = (n: number) => Math.round(n * 100) / 100;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'figma-import';

/** `#rgb`, `#rrggbb`, `rgb()`, `white`… as 0–255 channels, or null. */
function rgb(c: string | null | undefined): [number, number, number] | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = s.match(/^#([0-9a-f]{6})/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = s.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(/[ ,]+/).map(Number);
    return [r, g, b];
  }
  return null;
}
const lum = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const dist = (a: [number, number, number], b: [number, number, number]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** A text colour as a tone the document can hold — never a hex. */
function toneOf(fill: string | null, dark: boolean): string | undefined {
  const c = rgb(fill);
  if (!c) return undefined;
  const sat = Math.max(...c) - Math.min(...c);
  if (sat < 28) {
    const l = lum(c);
    // The theme's own ink where it is the theme's ink; the fixed inks where not.
    if (l > 0.8) return dark ? undefined : 'text-white';
    if (l < 0.3) return dark ? 'text-black' : undefined;
    return 'muted';
  }
  let best: string | undefined;
  let bestD = Infinity;
  for (const col of COLORS) {
    const v = rgb(dark ? col.dark : col.light);
    if (!v || /rgba\(/.test(dark ? col.dark : col.light)) continue;
    const d = dist(c, v);
    if (d < bestD) {
      bestD = d;
      best = col.key;
    }
  }
  return best;
}

function roleOf(size: number): TypeRole {
  let best: TypeRole = 'body';
  let bestD = Infinity;
  for (const [role, s] of Object.entries(TYPE_ROLES) as [TypeRole, { size: number }][]) {
    const d = Math.abs(s.size - size);
    if (d < bestD) {
      bestD = d;
      best = role;
    }
  }
  return best;
}

function weightOf(w: string | null): TypeWeight | undefined {
  const n = w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w);
  if (!n) return undefined;
  return n >= 650 ? 'bold' : n >= 500 ? 'semibold' : 'regular';
}

/** Every `#id` a node points at: `url(#id)` in any attribute, and `href`. */
function refsOf(el: Element_): string[] {
  const out: string[] = [];
  for (const a of Array.from(el.attributes)) {
    for (const m of a.value.matchAll(/url\(#([^)]+)\)/g)) out.push(m[1]);
    if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#')) out.push(a.value.slice(1));
  }
  const style = el.getAttribute('style') ?? '';
  for (const m of style.matchAll(/url\(#([^)]+)\)/g)) out.push(m[1]);
  return out;
}
type Element_ = globalThis.Element;

export async function convertFigmaSvg(source: string, fileName = 'Figma import'): Promise<FigmaImport> {
  const notes: string[] = [];
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  const error = parsed.getElementsByTagName('parsererror')[0];
  if (root.nodeName !== 'svg' || error) {
    const why = error?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`That file is not an SVG this can read${why ? ` (${why})` : ''}.`);
  }
  // Untrusted input: no scripts, no handlers, no external links.
  root.querySelectorAll('script').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((n) => {
    for (const a of Array.from(n.attributes)) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
  });

  const vb = (root.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
  const width = Number(root.getAttribute('width')) || vb[2] || 560;
  const height = Number(root.getAttribute('height')) || vb[3] || 372;

  // Laid out off-screen, 1 px per unit, so every box is measured in canvas px.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const origin = svg.getBoundingClientRect();
    const sx = width / (origin.width || width);
    const sy = height / (origin.height || height);
    const boxOf = (n: Element_) => {
      const r = n.getBoundingClientRect();
      return { x: (r.left - origin.left) * sx, y: (r.top - origin.top) * sy, width: r.width * sx, height: r.height * sy };
    };
    const byId = (id: string) => svg.querySelector(`[id="${CSS.escape(id)}"]`);

    // What the frame is drawn for: light ink on it means a dark design.
    const inks = Array.from(svg.querySelectorAll('text')).map((t) => rgb(t.getAttribute('fill')));
    const light = inks.filter((c) => c && lum(c) > 0.8).length;
    const darkInk = inks.filter((c) => c && lum(c) < 0.3).length;
    const dark = light > darkInk;
    if (!inks.length) notes.push('No live text came through — export from Figma with “Outline text” turned off to get editable text.');

    const elements: Element[] = [];
    let background: Doc['background'] = 'none';

    /* ---- kept as drawn: runs of shapes become one embedded SVG --------- */
    let run: Element_[] = [];
    const flush = () => {
      if (!run.length) return;
      const nodes = run;
      run = [];
      const boxes = nodes.map(boxOf).filter((b) => b.width > 0 || b.height > 0);
      if (!boxes.length) return;
      const pad = 6;
      const x = Math.min(...boxes.map((b) => b.x)) - pad;
      const y = Math.min(...boxes.map((b) => b.y)) - pad;
      const x2 = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
      const y2 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
      // Every definition the run uses, and every one those use.
      const need = new Set<string>();
      const visit = (n: Element_) => {
        for (const id of refsOf(n)) {
          if (need.has(id)) continue;
          need.add(id);
          const d = byId(id);
          if (d) visit(d);
        }
        Array.from(n.children).forEach(visit);
      };
      nodes.forEach(visit);
      const defs = [...need].map((id) => byId(id)).filter(Boolean).map((d) => (d as Element_).outerHTML).join('');
      const placed = nodes
        .map((n) => {
          // Its ancestors' transforms, so it lands where Figma drew it.
          const parent = n.parentNode as unknown as SVGGraphicsElement | null;
          const inherited = parent && (parent as unknown) !== svg ? parent.getCTM?.() : null;
          const identity = !inherited || (inherited.a === 1 && inherited.b === 0 && inherited.c === 0 && inherited.d === 1 && inherited.e === 0 && inherited.f === 0);
          return identity
            ? n.outerHTML
            : `<g transform="matrix(${[inherited!.a, inherited!.b, inherited!.c, inherited!.d, inherited!.e, inherited!.f].map(r2).join(' ')})">${n.outerHTML}</g>`;
        })
        .join('');
      // Ids namespaced as `importSvg` does, so two imports never share a gradient.
      const body = `<defs>${defs}</defs>${placed}`
        .replace(/\sid="([^"]+)"/g, ' id="__NS__$1"')
        .replace(/url\(#([^)]+)\)/g, 'url(#__NS__$1)')
        .replace(/(xlink:href|href)="#([^"]+)"/g, '$1="#__NS__$2"')
        .replace(/\sxmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, ' xmlns="http://www.w3.org/1999/xhtml"');
      elements.push({
        type: 'svg',
        x: r2(x),
        y: r2(y),
        width: r2(x2 - x),
        height: r2(y2 - y),
        viewBox: [r2(x), r2(y), r2(x2 - x), r2(y2 - y)],
        body,
        fit: 'fill',
        alt: nodes.map((n) => n.getAttribute('id')).filter(Boolean).join(', ') || undefined,
      } as Element);
    };

    /* ---- text ------------------------------------------------------ */
    const largest = Math.max(...Object.values(TYPE_ROLES).map((r) => r.size));
    let capped = 0;
    const text = (t: SVGTextElement) => {
      const attr = (k: string) => t.getAttribute(k) ?? t.closest(`[${k}]`)?.getAttribute(k) ?? null;
      const size = Number(attr('font-size')) || 16;
      const m = t.getCTM();
      const scale = m ? Math.hypot(m.a, m.b) : 1;
      const lines = Array.from(t.querySelectorAll('tspan'));
      const parts = lines.length ? lines : [t];
      for (const p of parts) {
        const content = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!content) continue;
        const px = Number(p.getAttribute('x') ?? t.getAttribute('x') ?? 0);
        const py = Number(p.getAttribute('y') ?? t.getAttribute('y') ?? 0);
        const pt = m ? new DOMPoint(px, py).matrixTransform(m) : { x: px, y: py };
        const anchor = attr('text-anchor');
        if (size * scale > largest * 1.25) capped++;
        elements.push({
          type: 'text',
          x: r2(pt.x),
          y: r2(pt.y),
          role: roleOf(size * scale),
          content,
          weight: weightOf(attr('font-weight')),
          tone: toneOf(attr('fill'), dark),
          anchor: anchor === 'middle' ? 'middle' : anchor === 'end' ? 'end' : undefined,
        } as Element);
      }
    };

    /* ---- cards and images ------------------------------------------ */
    /** An image-pattern fill: the picture it paints, or null. */
    const imageFill = (n: Element_): string | null => {
      const id = (n.getAttribute('fill') ?? '').match(/url\(#([^)]+)\)/)?.[1];
      const pat = id ? byId(id) : null;
      if (!pat || pat.nodeName !== 'pattern') return null;
      const use = pat.querySelector('use');
      const img = use ? byId((use.getAttribute('xlink:href') ?? use.getAttribute('href') ?? '').slice(1)) : pat.querySelector('image');
      return img?.getAttribute('xlink:href') ?? img?.getAttribute('href') ?? null;
    };
    /** A fill as stops of colour and opacity — a solid, or a gradient's. */
    const stopsOf = (n: Element_) => {
      const fill = n.getAttribute('fill');
      const op = Number(n.getAttribute('fill-opacity') ?? 1);
      const id = fill?.match(/url\(#([^)]+)\)/)?.[1];
      const g = id ? byId(id) : null;
      if (g && /Gradient$/.test(g.nodeName)) {
        return Array.from(g.querySelectorAll('stop')).map((s) => ({
          c: rgb(s.getAttribute('stop-color')),
          o: Number(s.getAttribute('stop-opacity') ?? 1) * op,
          grad: g.nodeName,
        }));
      }
      return fill && fill !== 'none' ? [{ c: rgb(fill), o: op, grad: '' }] : [];
    };
    const surfaceOf = (shape: Element_, stroke?: Element_): SurfaceName => {
      const stops = stopsOf(shape);
      if (!stops.length) return stroke ? 'outline' : 'glass-default';
      const avgO = stops.reduce((n, s) => n + s.o, 0) / stops.length;
      const blue = stops.every((s) => s.c && s.c[2] > s.c[0] + 60);
      const white = stops.every((s) => s.c && lum(s.c) > 0.85);
      if (avgO > 0.85 && stops.length > 1 && new Set(stops.map((s) => s.c?.join())).size > 1) return 'gradient';
      if (avgO > 0.85 && blue) return 'solid';
      if (white && avgO >= 0.4) return 'glass-highlighted';
      return 'glass-default';
    };
    /**
     * The stroke Figma draws as a second rectangle over a filled one: no fill
     * of its own (the export's root sets `fill="none"`), a stroke, and the
     * same box, half a stroke inset.
     */
    const isStroke = (n: Element_ | undefined, over?: Element_) => {
      if (!n || n.nodeName !== 'rect') return false;
      const fill = n.getAttribute('fill');
      if ((fill && fill !== 'none') || !n.getAttribute('stroke')) return false;
      if (!over) return true;
      const a = boxOf(n);
      const b = boxOf(over);
      return Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3 && Math.abs(a.width - b.width) < 5 && Math.abs(a.height - b.height) < 5;
    };
    /** A rounded rectangle big enough to be a card. */
    const cardShape = (n: Element_) => {
      if (n.nodeName !== 'rect') return false;
      const b = boxOf(n);
      return b.width >= 40 && b.height >= 20;
    };

    const card = (shape: Element_, stroke?: Element_) => {
      const b = boxOf(shape);
      const rx = Number(shape.getAttribute('rx') ?? 0);
      // The frame's own backdrop: the stage, not a card.
      if (b.width >= width * 0.97 && b.height >= height * 0.97) {
        background = undefined;
        return;
      }
      const href = imageFill(shape);
      if (href) {
        elements.push({ type: 'image', x: r2(b.x), y: r2(b.y), width: r2(b.width), height: r2(b.height), href, fit: 'cover', radius: rx || undefined } as Element);
        return;
      }
      const surface = isStroke(shape) ? 'outline' : surfaceOf(shape, stroke);
      elements.push({ type: 'card', x: r2(b.x), y: r2(b.y), width: r2(b.width), height: r2(b.height), radius: r2(rx), surface } as Element);
    };

    /* ---- the walk -------------------------------------------------- */
    const strokes = new Set<Element_>();
    const walk = (n: Element_) => {
      const tag = n.nodeName;
      if (SKIP.has(tag)) return;
      if (tag === 'text') {
        flush();
        text(n as SVGTextElement);
        return;
      }
      if (tag === 'image') {
        flush();
        const b = boxOf(n);
        elements.push({ type: 'image', x: r2(b.x), y: r2(b.y), width: r2(b.width), height: r2(b.height), href: n.getAttribute('xlink:href') ?? n.getAttribute('href') ?? '', fit: 'cover' } as Element);
        return;
      }
      if (cardShape(n)) {
        flush();
        // Its stroke, drawn next as a rectangle of its own, is part of it.
        const next = n.nextElementSibling ?? undefined;
        if (!isStroke(n) && isStroke(next, n)) strokes.add(next!);
        if (!strokes.has(n)) card(n, strokes.has(next!) ? next : undefined);
        return;
      }
      if (SHAPES.has(tag)) {
        run.push(n);
        return;
      }
      if (tag !== 'g' && tag !== 'svg' && tag !== 'a') return;
      const kids = Array.from(n.children).filter((c) => !SKIP.has(c.nodeName));
      const hasText = !!n.querySelector('text');
      const hasCard = kids.some(cardShape);
      // Masked or clipped art, with nothing editable in it, stays whole.
      if (!hasText && !hasCard && (n.getAttribute('mask') || n.getAttribute('clip-path') || n.getAttribute('filter') || !kids.length)) {
        run.push(n);
        return;
      }
      if (!hasText && !hasCard) {
        run.push(n);
        return;
      }
      // A card: its rounded rectangle, and the stroke Figma draws as a second one.
      const first = kids[0];
      if (first && cardShape(first)) {
        flush();
        const second = isStroke(kids[1], first) ? kids[1] : undefined;
        card(first, second);
        kids.slice(second ? 2 : 1).forEach(walk);
        flush();
        return;
      }
      kids.forEach(walk);
      flush();
    };
    Array.from(svg.children).forEach(walk);
    flush();

    const cards = elements.filter((e) => e.type === 'card').length;
    const texts = elements.filter((e) => e.type === 'text').length;
    const art = elements.filter((e) => e.type === 'svg').length;
    notes.unshift(`${texts} text${texts === 1 ? '' : 's'}, ${cards} card${cards === 1 ? '' : 's'}, ${art} piece${art === 1 ? '' : 's'} of artwork kept as drawn`);
    if (capped) notes.push(`${capped} text${capped === 1 ? ' is' : 's are'} larger than the type scale goes, so set at Display (${largest}px)`);

    const name = (svg.querySelector(':scope > g[id]')?.getAttribute('id') ?? fileName.replace(/\.svg$/i, '')).trim();
    const doc: Doc = {
      id: slug(name),
      name,
      layout: 'bare',
      canvas: { width, height },
      ...(background === 'none' ? { background: 'none' } : {}),
      panels: [],
      panelSurfaces: 2,
      elements,
    };
    return { doc, theme: dark ? 'dark' : 'light', notes };
  } finally {
    host.remove();
  }
}

/** Ask for a Figma SVG and convert it — null when nothing was picked. */
export async function pickFigmaSvg(): Promise<FigmaImport | null> {
  const file = await pickFile('.svg,image/svg+xml');
  if (!file) return null;
  return convertFigmaSvg(await file.text(), file.name);
}
