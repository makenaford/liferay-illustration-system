/**
 * CONFORMANCE AUDIT — reports where the shipped illustrations diverge from
 * the system rather than fixing anything.
 *
 * Ships as a script rather than a test because most findings are judgement
 * calls: a 6px gap is off-scale but might be deliberate. The point is to make
 * the divergence visible instead of letting it accumulate silently.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Element } from '../src/document.ts';
import { LAYOUT, SPACE, dark as tokens } from '../src/tokens.ts';
import { resolveLayout } from '../src/autolayout.ts';

const DOCS = join(import.meta.dirname, '..', 'docs');
const SURFACES = Object.keys(tokens.surfaces);
const GRID = LAYOUT.grid;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Finding {
  doc: string;
  path: string;
  rule: string;
  detail: string;
}

const findings: Finding[] = [];
const add = (doc: string, path: string, rule: string, detail: string) =>
  findings.push({ doc, path, rule, detail });

/** Walk the resolved tree so auto-layout coordinates are the real ones. */
function walk(doc: Doc, el: Element, path: string, parent: Element | null, inFlow = false) {
  const any = el as unknown as Record<string, unknown>;
  const name = doc.name;

  if (el.type === 'card' || el.type === 'subCard') {
    if (!any.surface) {
      add(name, path, 'surface-implicit', `${el.type} relies on a default, not a named surface`);
    } else if (!SURFACES.includes(String(any.surface))) {
      add(name, path, 'surface-unknown', `surface "${any.surface}" is not in the set`);
    }
    if (any.variant) {
      add(name, path, 'surface-legacy', `legacy variant "${any.variant}" — use surface`);
    }
  }

  // Only AUTHORED coordinates. Auto-layout derives positions and hug sizes
  // from font metrics, which are fractional by nature — snapping those would
  // mean rounding the type, not the layout.
  {
    // A child of an auto-layout container does not own its x/y.
    const keys = inFlow ? (['width', 'height'] as const) : (['x', 'y', 'width', 'height'] as const);
    for (const k of keys) {
      const v = any[k];
      if (typeof v === 'number' && Math.abs(v % GRID) > 1e-6) {
        add(name, path, 'off-grid', `${k}=${round(v)} is not a multiple of ${GRID}`);
      }
    }
  }

  const layout = any.layout as { gap?: number; padding?: number | number[] } | undefined;
  if (layout) {
    if (layout.gap !== undefined && layout.gap !== 0 && !(SPACE as readonly number[]).includes(layout.gap)) {
      add(name, path, 'gap-off-scale', `gap ${layout.gap} is not on the spacing scale`);
    }
    const pads = layout.padding === undefined ? [] : [layout.padding].flat();
    for (const p of pads) {
      if (p !== 0 && !(SPACE as readonly number[]).includes(p)) {
        add(name, path, 'padding-off-scale', `padding ${p} is not on the spacing scale`);
      }
    }
  }

  const flows = !!any.layout;
  (any.children as Element[] | undefined)?.forEach((c, i) =>
    walk(doc, c, `${path}.${i}`, el, flows),
  );
}

/**
 * Sibling alignment. Absolute-positioned panels have no container enforcing
 * a grid, so edges that should line up drift by a pixel or two — invisible
 * one card at a time, obvious across a row.
 */
function alignment(doc: Doc, siblings: Element[], where: string) {
  // Only panels. A heading's right edge has no business lining up with a
  // card's, and comparing them buries the findings that matter.
  const PANEL = new Set(['card', 'subCard', 'group']);
  const boxes = siblings
    .map((el, i) => ({ el, i, ...(el as unknown as Box) }))
    .filter(
      (b) =>
        PANEL.has(b.el.type) &&
        typeof b.width === 'number' &&
        typeof b.height === 'number' &&
        b.width > 40 &&
        b.height > 24,
    );
  if (boxes.length < 2) return;

  const share = (a: typeof boxes[0], b: typeof boxes[0], axis: 'x' | 'y') => {
    const [s1, e1] = axis === 'y' ? [a.y, a.y + a.height] : [a.x, a.x + a.width];
    const [s2, e2] = axis === 'y' ? [b.y, b.y + b.height] : [b.x, b.x + b.width];
    const over = Math.min(e1, e2) - Math.max(s1, s2);
    return over / Math.min(e1 - s1, e2 - s2);
  };

  // A row: panels sharing most of their vertical extent.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const centredEarly =
        Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < 0.5 ||
        Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 0.5;
      if (centredEarly || (share(a, b, 'x') > 0.05 && share(a, b, 'y') > 0.05)) continue;

      if (share(a, b, 'y') > 0.5) {
        const dTop = Math.abs(a.y - b.y);
        const dBottom = Math.abs(a.y + a.height - (b.y + b.height));
        if (dTop > 0.5 && dTop < 24 && !deliberate(dTop)) {
          add(doc.name, `${where}[${a.i},${b.i}]`, 'row-top-misaligned', `tops differ by ${round(dTop)}px`);
        }
        if (dBottom > 0.5 && dBottom < 24 && !deliberate(dBottom)) {
          add(doc.name, `${where}[${a.i},${b.i}]`, 'row-bottom-misaligned', `bottoms differ by ${round(dBottom)}px`);
        }
      }
      // A pair can be deliberately CENTRE-aligned, or one can be an overlay
      // sitting on top of the other. Neither is drift.
      const centred =
        Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < 0.5 ||
        Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 0.5;
      const stacked = share(a, b, 'x') > 0.05 && share(a, b, 'y') > 0.05;
      if (centred || stacked) continue;

      if (share(a, b, 'x') > 0.5) {
        const dLeft = Math.abs(a.x - b.x);
        const dRight = Math.abs(a.x + a.width - (b.x + b.width));
        if (dLeft > 0.5 && dLeft < 24 && !deliberate(dLeft)) {
          add(doc.name, `${where}[${a.i},${b.i}]`, 'col-left-misaligned', `left edges differ by ${round(dLeft)}px`);
        }
        if (dRight > 0.5 && dRight < 24 && !deliberate(dRight)) {
          add(doc.name, `${where}[${a.i},${b.i}]`, 'col-right-misaligned', `right edges differ by ${round(dRight)}px`);
        }
      }
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Is this edge difference drift, or a deliberate stagger?
 *
 * Drift is a value nobody typed — 2px, 8.7px, 12px. A deliberate offset is a
 * step off the spacing scale, and a large one: the overlay cards in this set
 * are all offset by exactly 20. Anything under a step of 16 is treated as
 * drift even when it happens to land on the scale, because that is the range
 * where a mistake is invisible.
 */
const deliberate = (d: number) => d >= 16 && (SPACE as readonly number[]).includes(d);

function alignmentWalk(doc: Doc, el: Element, path: string) {
  const kids = (el as { children?: Element[] }).children;
  const p = el as unknown as Record<string, number>;
  for (const [i, c] of (kids ?? []).entries()) {
    const b = c as unknown as Record<string, number>;
    if (typeof p.width !== 'number' || typeof b.width !== 'number') continue;
    const out = Math.max(
      p.x - b.x,
      b.x + b.width - (p.x + p.width),
      p.y - b.y,
      b.y + b.height - (p.y + p.height),
    );
    if (out > 0.5) {
      add(doc.name, `${path}.${i}`, 'overflow', `${c.type} extends ${round(out)}px outside its ${el.type}`);
    }
  }
  if (kids?.length) {
    // Auto-layout containers already enforce their own alignment.
    if (!(el as { layout?: unknown }).layout) alignment(doc, kids, path);
    kids.forEach((c, i) => alignmentWalk(doc, c, `${path}.${i}`));
  }
}

const files = readdirSync(DOCS).filter((f) => f.endsWith('.json')).sort();
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(DOCS, f), 'utf8')) as Doc;
  raw.elements.forEach((el, i) => walk(raw, el, String(i), null));
  const resolved = resolveLayout(raw);
  alignment(resolved, resolved.elements, 'stage');
  resolved.elements.forEach((el, i) => alignmentWalk(resolved, el, String(i)));
}

const byRule = new Map<string, Finding[]>();
for (const f of findings) {
  const list = byRule.get(f.rule) ?? [];
  list.push(f);
  byRule.set(f.rule, list);
}

console.log(`${findings.length} findings across ${files.length} illustrations\n`);
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${rule.toUpperCase()}  (${list.length})`);
  const perDoc = new Map<string, Finding[]>();
  for (const f of list) perDoc.set(f.doc, [...(perDoc.get(f.doc) ?? []), f]);
  for (const [doc, fs] of perDoc) {
    console.log(`  ${doc}  ×${fs.length}`);
    for (const f of fs.slice(0, 4)) console.log(`    ${f.path.padEnd(12)} ${f.detail}`);
    if (fs.length > 4) console.log(`    … ${fs.length - 4} more`);
  }
  console.log();
}
