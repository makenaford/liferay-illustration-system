/**
 * Assign a surface to every card, by what the card DOES.
 *
 *   node --experimental-strip-types scripts/surface-pass.ts          # report
 *   node --experimental-strip-types scripts/surface-pass.ts --write
 *
 * The set is an elevation ladder, so the assignment is structural rather than
 * per-card taste:
 *
 *   hero panel                    -> glass2   the default card
 *   tile sitting on a panel       -> glass1   inset, not floating
 *   card nested inside a card     -> glass1   same reason, one level down
 *   card overlapping its siblings -> glass3   it is floating over them
 *   stroke-only card              -> outline  structure without weight
 *   recessed well                 -> sunken
 *
 * Anything already carrying an explicit `surface` is left alone — those were
 * deliberate (the sampled `Blue Gradient`, for one).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundingBox, resolveLayout } from '../src/autolayout.ts';
import type { Doc, Element } from '../src/document.ts';
import type { SurfaceName } from '../src/tokens.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');

interface Box { x: number; y: number; width: number; height: number }

/** Fraction of the smaller box that the two share. */
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? (w * h) / smaller : 0;
}

const counts = new Map<string, number>();
const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json'))) {
  const doc: Doc = JSON.parse(readFileSync(join(DOCS, file), 'utf8'));
  const resolved = resolveLayout(doc);
  const lines: string[] = [];

  // Panels are the hero surface.
  for (const p of doc.panels ?? []) {
    if (!p.surface) {
      p.surface = 'glass2';
      bump('glass2');
      lines.push(`    panel ${p.width}x${p.height} → glass2`);
    }
  }

  /** Root boxes, in draw order, for the floating test. */
  const rootBoxes = resolved.elements.map(boundingBox);

  const visit = (
    src: Element[],
    res: Element[],
    depth: number,
    siblingBoxes: (Box | null)[],
  ) => {
    src.forEach((el, i) => {
      const r = res[i];
      if (el.type === 'card' || el.type === 'subCard') {
        const e = el as Element & { surface?: SurfaceName; variant?: string };
        if (!e.surface) {
          let pick: SurfaceName;
          const box = siblingBoxes[i];

          if (e.variant === 'sunken') {
            pick = 'sunken';
          } else if (!('fill' in e) && e.variant === undefined && isStrokeOnly(el)) {
            pick = 'outline';
          } else if (
            depth === 0 &&
            box &&
            siblingBoxes.slice(0, i).some((b) => b && overlap(box, b) > 0.25)
          ) {
            // Drawn after something it covers: it is floating over the scene.
            pick = 'glass3';
          } else {
            pick = 'glass1';
          }

          e.surface = pick;
          delete e.variant;
          bump(pick);
          lines.push(
            `    ${'  '.repeat(depth)}${el.type} ${Math.round(
              (el as { width: number }).width,
            )}x${Math.round((el as { height: number }).height)} → ${pick}`,
          );
        }
      }
      const kids = (el as { children?: Element[] }).children;
      const rkids = (r as { children?: Element[] })?.children;
      if (kids?.length && rkids) {
        visit(kids, rkids, depth + 1, rkids.map(boundingBox));
      }
    });
  };

  visit(doc.elements, resolved.elements, 0, rootBoxes);

  if (lines.length) {
    console.log(`${doc.id}`);
    lines.forEach((l) => console.log(l));
  }
  if (WRITE) writeFileSync(join(DOCS, file), `${JSON.stringify(doc, null, 2)}\n`);
}

/** A card the original drew as a stroke with no fill. */
function isStrokeOnly(_el: Element): boolean {
  // Nothing in the documents records this today; the b2b price table is the
  // one case and it is set by hand below the pass.
  return false;
}

console.log('\nassigned:');
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log(WRITE ? 'written.' : 'dry run — pass --write to apply.');
