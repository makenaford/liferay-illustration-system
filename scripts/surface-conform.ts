/**
 * SURFACE CONFORMANCE — one rule for which surface a panel gets.
 *
 * The nine illustrations were ported before the surface set existed, so the
 * same visual role ended up drawn three different ways: five illustrations
 * put their top-level panels on `glass1` (the *nested tile* surface, which
 * has no shadow), three put them on `glass3` (the *floating overlay*), and
 * only the genuine overlays were actually overlays.
 *
 * The ladder is depth, not taste:
 *   depth 0, resting on the stage        -> glass2  (the default card)
 *   depth 0, overlapping another panel   -> glass3  (floating overlay)
 *   depth 1+                             -> glass1  (nested tile, no shadow)
 *
 * Surfaces chosen for meaning rather than elevation — `highlighted`,
 * `gradient`, `outline`, `sunken`, `solid` — are left alone; they are saying
 * something the depth rule cannot.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Element } from '../src/document.ts';

const DOCS = join(import.meta.dirname, '..', 'docs');
const ELEVATION = new Set(['glass1', 'glass2', 'glass3']);
const APPLY = !process.argv.includes('--dry');

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

let changed = 0;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(DOCS, file);
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Doc;
  const notes: string[] = [];

  const panels = doc.elements.filter(
    (e): e is Element & Box & { surface?: string } => e.type === 'card' || e.type === 'subCard',
  );

  const visit = (el: Element, depth: number, trail: string) => {
    const any = el as unknown as Element & Box & { surface?: string };
    if ((el.type === 'card' || el.type === 'subCard') && ELEVATION.has(any.surface ?? '')) {
      // Only the panel drawn ON TOP is the overlay. Document order is paint
      // order, so a panel is floating when it covers an *earlier* sibling —
      // the one underneath is still a resting card.
      const index = panels.indexOf(any);
      const floating =
        depth === 0 && index > 0 && panels.slice(0, index).some((p) => overlaps(p, any));
      const want = depth > 0 ? 'glass1' : floating ? 'glass3' : 'glass2';
      if (any.surface !== want) {
        notes.push(`${trail} ${el.type} ${any.surface} -> ${want}`);
        any.surface = want;
      }
    }
    (el as { children?: Element[] }).children?.forEach((c, i) => visit(c, depth + 1, `${trail}.${i}`));
  };
  doc.elements.forEach((el, i) => visit(el, 0, String(i)));

  if (notes.length) {
    changed += notes.length;
    console.log(`${file}  ${notes.length} change${notes.length === 1 ? '' : 's'}`);
    for (const n of notes) console.log(`  ${n}`);
    if (APPLY) writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
}

console.log(`\n${changed} surfaces ${APPLY ? 'rewritten' : 'would change'}`);
