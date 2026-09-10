/**
 * Convert cards to auto-layout — but only where it is genuinely equivalent.
 *
 *   node --experimental-strip-types scripts/autolayout.ts          # report
 *   node --experimental-strip-types scripts/autolayout.ts --write  # apply
 *
 * The rule: infer a spec from how a card's children are already arranged,
 * resolve it, and compare against where they actually sit. Convert only if
 * every child lands within `TOLERANCE` of its current position.
 *
 * That is deliberately strict. Auto-layout is a one-dimensional flow, and
 * plenty of these cards are two-dimensional — a title on the left with icons
 * on the right is a row of two stacks, and forcing it into a single flow
 * would rearrange a design nobody asked to change. Those are left alone and
 * listed, so the decision to restructure them stays a designer's.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundingBox, inferLayout, resolveLayout } from '../src/autolayout.ts';
import type { Doc, Element, LayoutSpec } from '../src/document.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');
/**
 * Max drift, in px, before a conversion is treated as restructuring rather
 * than tidying.
 *
 * The nine documents were hand-placed, so their gaps VARY — a stat tile runs
 * 18 / 10 / 8 between its four rows. A single-gap flow cannot reproduce that,
 * so converting always moves something; normalising the rhythm is the point.
 *
 * The measured drift separates cleanly into two populations: genuine
 * one-dimensional stacks all land under 15px, while the two-dimensional cards
 * (a title beside an icon row, a three-column table) are 32px and up, because
 * flattening them into one flow genuinely destroys the design. 20 sits in the
 * gap between the two.
 */
const TOLERANCE = Number(
  process.argv.find((a) => a.startsWith('--tolerance='))?.split('=')[1] ?? 20,
);

interface Pos { x: number; y: number }

/** Where every descendant sits, keyed by path — the thing we must preserve. */
function positions(el: Element, path = '', out = new Map<string, Pos>()) {
  const e = el as Element & { x?: number; y?: number; cx?: number; cy?: number };
  const x = e.x ?? e.cx;
  const y = e.y ?? e.cy;
  if (typeof x === 'number' && typeof y === 'number') out.set(path, { x, y });
  const kids = (el as { children?: Element[] }).children ?? [];
  kids.forEach((k, i) => positions(k, `${path}.${i}`, out));
  return out;
}

/** Resolve one card in isolation. */
function resolveCard(card: Element): Element {
  const doc: Doc = {
    id: 't', name: 't', layout: 'bare',
    canvas: { width: 0, height: 0 }, elements: [card],
  };
  return resolveLayout(doc).elements[0];
}

let converted = 0;
let skipped = 0;
const skipReasons: string[] = [];

function tryConvert(el: Element, label: string): Element {
  let out = el;

  // Depth first, so a nested container is settled before its parent is judged.
  const kids = (out as { children?: Element[] }).children;
  if (kids?.length) {
    out = {
      ...out,
      children: kids.map((k, i) => tryConvert(k, `${label}>${k.type}[${i}]`)),
    } as Element;
  }

  if (out.type !== 'card' && out.type !== 'subCard') return out;
  if (out.layout) return out;
  const children = (out as { children?: Element[] }).children ?? [];
  if (children.length < 2) return out;

  const spec: LayoutSpec = inferLayout(out);

  /*
   * A drift check alone is not enough. Two children sitting SIDE BY SIDE — a
   * check icon next to its caption — can be close enough that flattening them
   * into a vertical stack scores a small drift, while visibly restructuring
   * the card. Overlap along the flow axis is the direct test for that: in a
   * one-dimensional flow, no two children share a band.
   */
  const horizontal = spec.direction === 'horizontal';
  const boxes = children
    .map(boundingBox)
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map((b) => ({
      a: horizontal ? b.x : b.y,
      len: horizontal ? b.width : b.height,
    }));

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      const overlap = Math.min(p.a + p.len, q.a + q.len) - Math.max(p.a, q.a);
      // In a genuine one-dimensional flow no two children share a band at
      // all, so anything past a rounding pixel means this card is 2-D.
      if (overlap > 1) {
        skipped++;
        skipReasons.push(
          `    · ${label} — ${children.length} children; two children share a ` +
            `${spec.direction === 'horizontal' ? 'column' : 'row'}, so this is two-dimensional`,
        );
        return out;
      }
    }
  }

  const candidate = { ...out, layout: spec } as Element;

  const before = positions(out);
  const after = positions(resolveCard(candidate));

  let worst = 0;
  let worstAt = '';
  for (const [path, p] of before) {
    if (path === '') continue;
    const q = after.get(path);
    if (!q) continue;
    const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    if (d > worst) {
      worst = d;
      worstAt = path;
    }
  }

  if (worst <= TOLERANCE) {
    converted++;
    console.log(
      `    ✓ ${label} → ${spec.direction} gap ${spec.gap} pad ${spec.padding}` +
        `${worst > 2 ? `  (rhythm normalised, max move ${worst.toFixed(1)}px)` : '  (exact)'}`,
    );
    return candidate;
  }

  skipped++;
  skipReasons.push(
    `    · ${label} — ${children.length} children; two-dimensional, ` +
      `a ${spec.direction} flow would move ${worstAt} by ${worst.toFixed(0)}px`,
  );
  return out;
}

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json'))) {
  const doc: Doc = JSON.parse(readFileSync(join(DOCS, file), 'utf8'));
  const before = { converted, skipped };
  skipReasons.length = 0;

  const next: Doc = {
    ...doc,
    elements: doc.elements.map((e, i) => tryConvert(e, `${e.type}[${i}]`)),
  };

  const c = converted - before.converted;
  const s = skipped - before.skipped;
  if (c || s) {
    console.log(`${doc.id}  —  ${c} converted, ${s} left absolute`);
    skipReasons.forEach((r) => console.log(r));
    console.log('');
  }

  if (WRITE) writeFileSync(join(DOCS, file), `${JSON.stringify(next, null, 2)}\n`);
}

console.log(
  `${converted} cards now reflow; ${skipped} are two-dimensional and stay absolute.`,
);
console.log(WRITE ? 'written.' : 'dry run — pass --write to apply.');
