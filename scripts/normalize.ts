/**
 * Normalise the documents: snap geometry to the grid, and pull each card's
 * children onto a common left edge.
 *
 *   node --experimental-strip-types scripts/normalize.ts          # report
 *   node --experimental-strip-types scripts/normalize.ts --write  # apply
 *
 * Two passes, deliberately conservative:
 *
 *   1. SNAP every coordinate and size to the 2px base unit. The nine
 *      documents were authored by reading coordinates off Figma exports, so
 *      they carry values like `98.577` and `128.667` that no one chose.
 *   2. ALIGN each card's children to a common left inset — but only children
 *      already within a small tolerance of the modal inset, so a deliberate
 *      indent stays indented.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, nearestSpace } from '../src/tokens.ts';
import type { Doc, Element } from '../src/document.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');
const STEP = LAYOUT.grid;
/** How far a child may sit from the modal inset and still be pulled onto it. */
const TOLERANCE = 3;

const snap = (n: number) => Math.round(n / STEP) * STEP;

let moved = 0;
let aligned = 0;
let biggest = 0;

function snapValue(n: number): number {
  const s = snap(n);
  const d = Math.abs(s - n);
  if (d > 0.001) {
    moved++;
    biggest = Math.max(biggest, d);
  }
  return s;
}

function snapElement(el: Element): Element {
  const out = { ...el } as Record<string, unknown>;
  for (const k of ['x', 'y', 'cx', 'cy', 'width', 'height', 'size', 'r', 'radius', 'gapX', 'gapY']) {
    if (typeof out[k] === 'number') out[k] = snapValue(out[k] as number);
  }
  if (el.type === 'connector') {
    out.from = el.from.map(snapValue);
    out.to = el.to.map(snapValue);
  }
  if (Array.isArray(out.children)) {
    out.children = (out.children as Element[]).map(snapElement);
  }
  return out as unknown as Element;
}

/** The left edge a child presents, or null if it has none. */
function leftOf(el: Element): number | null {
  if (el.type === 'avatar' || el.type === 'connector') return null;
  // A centred or right-anchored string isn't aligned by its x.
  if ((el.type === 'text' || el.type === 'stat') && (el as { anchor?: string }).anchor) return null;
  const x = (el as { x?: number }).x;
  return typeof x === 'number' ? x : null;
}

function alignCard(card: Element, report: string[]): Element {
  const kids = (card as { children?: Element[] }).children;
  if (!kids?.length) return card;

  const cardX = (card as { x?: number }).x;
  if (typeof cardX !== 'number') return card;

  const lefts = kids.map(leftOf).filter((v): v is number => v !== null);
  if (lefts.length < 2) return card;

  // The modal left edge — the one the most children already share.
  const counts = new Map<number, number>();
  for (const l of lefts) counts.set(l, (counts.get(l) ?? 0) + 1);
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const inset = modal - cardX;

  let touched = 0;
  const children = kids.map((kid) => {
    const l = leftOf(kid);
    if (l === null || l === modal) return kid;
    if (Math.abs(l - modal) > TOLERANCE) return kid;
    touched++;
    aligned++;
    return { ...kid, x: modal } as Element;
  });

  if (touched) {
    const near = nearestSpace(inset);
    report.push(
      `    inset ${inset}px${near !== inset ? ` (nearest scale step ${near})` : ' ✓ on scale'}` +
        ` — pulled ${touched} child${touched === 1 ? '' : 'ren'} onto it`,
    );
  }
  return { ...card, children } as Element;
}

function walkCards(el: Element, report: string[]): Element {
  let out = el;
  if (el.type === 'card' || el.type === 'subCard') out = alignCard(el, report);
  const kids = (out as { children?: Element[] }).children;
  if (kids) {
    out = { ...out, children: kids.map((k) => walkCards(k, report)) } as Element;
  }
  return out;
}

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json'))) {
  const before = { moved, aligned };
  const doc: Doc = JSON.parse(readFileSync(join(DOCS, file), 'utf8'));
  const report: string[] = [];

  let next: Doc = { ...doc, elements: doc.elements.map(snapElement) };
  if (next.panels) {
    next = {
      ...next,
      panels: next.panels.map((p) => ({
        ...p,
        x: snapValue(p.x),
        y: snapValue(p.y),
        width: snapValue(p.width),
        height: snapValue(p.height),
      })),
    };
  }
  next = { ...next, elements: next.elements.map((e) => walkCards(e, report)) };

  const dm = moved - before.moved;
  const da = aligned - before.aligned;
  console.log(`${doc.id.padEnd(24)} snapped ${String(dm).padStart(3)}  aligned ${String(da).padStart(3)}`);
  report.forEach((r) => console.log(r));

  if (WRITE) writeFileSync(join(DOCS, file), `${JSON.stringify(next, null, 2)}\n`);
}

console.log(
  `\n${moved} values snapped to the ${STEP}px grid (largest move ${biggest.toFixed(2)}px), ` +
    `${aligned} children pulled onto a common edge.`,
);
console.log(WRITE ? 'written.' : 'dry run — pass --write to apply.');
