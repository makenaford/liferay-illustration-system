/**
 * Convert two-dimensional cards into NESTED auto-layout containers.
 *
 *   node --experimental-strip-types scripts/nest.ts          # report
 *   node --experimental-strip-types scripts/nest.ts --write  # apply
 *
 * A one-dimensional flow cannot express "a title on the left with two icons on
 * the right". A column of rows can. This does that decomposition, using the
 * classic guillotine partition:
 *
 *   1. Look for horizontal cut lines that no child straddles. If the children
 *      fall into two or more bands, this level is a VERTICAL flow of bands.
 *   2. Otherwise look for vertical cut lines — a HORIZONTAL flow of columns.
 *   3. Recurse into each band or column.
 *   4. A band that is one element is that element; a band that splits on
 *      neither axis is genuinely overlapping and is left alone.
 *
 * Every intermediate becomes a `group` — a container that draws nothing and
 * only positions — so nesting adds structure without inventing visuals.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundingBox, isContainer, resolveLayout } from '../src/autolayout.ts';
import { SPACE, LAYOUT } from '../src/tokens.ts';
import type { Doc, Element, LayoutSpec } from '../src/document.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');
const TOLERANCE = Number(
  process.argv.find((a) => a.startsWith('--tolerance='))?.split('=')[1] ?? 20,
);

interface Box { x: number; y: number; width: number; height: number }
interface Item { el: Element; box: Box }

/**
 * Snap to the spacing scale, but only when the value is genuinely near a step.
 *
 * Blindly snapping treats every distance as a spacing token, and the scale
 * tops out at 80 — so the 104px between a table's name and price columns
 * became 80 and threw the header 34px out of place. A gap that large is
 * layout geometry, not a token, so it is kept (on the 2px grid) instead.
 */
const SNAP_WINDOW = 3;

const onScale = (n: number) => {
  const nearest = (SPACE as readonly number[]).reduce((best: number, v: number) =>
    Math.abs(v - n) < Math.abs(best - n) ? v : best,
  );
  return Math.abs(nearest - n) <= SNAP_WINDOW ? nearest : Math.round(n / 2) * 2;
};

/**
 * Split items into bands along one axis. A band ends where the next item
 * starts at or after every previous item's end — i.e. at a clean cut line.
 */
function bands(items: Item[], axis: 'x' | 'y'): Item[][] {
  const len = axis === 'x' ? 'width' : 'height';
  const sorted = [...items].sort((a, b) => a.box[axis] - b.box[axis]);
  const out: Item[][] = [];
  let current: Item[] = [];
  let edge = -Infinity;

  for (const item of sorted) {
    // A 1px slack absorbs rounding without merging genuinely separate bands.
    if (current.length && item.box[axis] >= edge - 1) {
      out.push(current);
      current = [];
    }
    current.push(item);
    edge = Math.max(edge, item.box[axis] + item.box[len]);
  }
  if (current.length) out.push(current);
  return out;
}

const hull = (items: Item[]): Box => {
  const x = Math.min(...items.map((i) => i.box.x));
  const y = Math.min(...items.map((i) => i.box.y));
  return {
    x,
    y,
    width: Math.max(...items.map((i) => i.box.x + i.box.width)) - x,
    height: Math.max(...items.map((i) => i.box.y + i.box.height)) - y,
  };
};

/** Raw gaps between consecutive bands. */
function gapsBetween(groups: Item[][], axis: 'x' | 'y'): number[] {
  const len = axis === 'x' ? 'width' : 'height';
  const gaps: number[] = [];
  for (let i = 1; i < groups.length; i++) {
    const prev = hull(groups[i - 1]);
    const cur = hull(groups[i]);
    gaps.push(cur[axis] - (prev[axis] + prev[len]));
  }
  return gaps;
}

/** Median gap, snapped to the spacing scale. */
function gapBetween(groups: Item[][], axis: 'x' | 'y'): number {
  const gaps = gapsBetween(groups, axis).sort((a, b) => a - b);
  return onScale(Math.max(gaps[Math.floor(gaps.length / 2)] ?? LAYOUT.gap, 0));
}

/**
 * Cross-axis placement for a child inside its parent's extent.
 *
 * Picks whichever of start / center / end lands CLOSEST, rather than
 * requiring a near-exact match and falling back to `start`. That fallback was
 * a bug: a label sitting 6px from the right edge is obviously end-aligned,
 * but a 2px threshold called it `start` and threw it 128px across the card.
 */
function alignOf(
  child: Box,
  parent: Box,
  axis: 'x' | 'y',
  canStretch: boolean,
): { align: LayoutSpec['align']; error: number; offset: number } {
  const len = axis === 'x' ? 'width' : 'height';
  const slack = parent[len] - child[len];
  const before = child[axis] - parent[axis];
  /*
   * `stretch` RESIZES the child, which is fine for a group (it has no size of
   * its own) and wrong for a leaf: stretching a 96px outline button to fill a
   * 197px card moved its centred label 39px. A leaf keeps its size and is
   * merely positioned.
   */
  if (slack <= 2 && canStretch) return { align: 'stretch', error: 0, offset: before };

  const after = slack - before;
  const options: [LayoutSpec['align'], number][] = [
    ['start', Math.abs(before)],
    ['end', Math.abs(after)],
    ['center', Math.abs(before - after) / 2],
  ];
  const [align, error] = options.sort((a, b) => a[1] - b[1])[0];
  return { align, error, offset: before };
}

let groupsMade = 0;

/** Build a nested container tree from a flat set of positioned items. */
function partition(items: Item[], depth = 0): Element | null {
  if (items.length === 1) return items[0].el;
  if (depth > 6) return null;

  for (const axis of ['y', 'x'] as const) {
    let parts = bands(items, axis);
    if (parts.length < 2) continue;

    /*
     * A flow has ONE gap, so bands whose gaps vary wildly cannot be one flow.
     * "Title ......... icon icon" is not a three-column row with a 66px gap;
     * it is a title and an icon pair, far apart. Splitting at the largest gap
     * and recursing recovers that structure — and it is what makes the
     * difference between nesting reproducing a card and scattering it.
     */
    const seps = gapsBetween(parts, axis);
    const sorted = [...seps].sort((a, b) => a - b);
    // LOWER median: with two gaps of 4 and 66 the representative gap is 4,
    // and 66 is the outlier to split at. Taking the upper would call 66
    // typical and never split.
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    const widest = Math.max(...seps);
    if (parts.length > 2 && widest > median * 2 + 4) {
      const at = seps.indexOf(widest) + 1;
      parts = [parts.slice(0, at).flat(), parts.slice(at).flat()];
    }

    const direction: LayoutSpec['direction'] = axis === 'y' ? 'vertical' : 'horizontal';
    const cross = axis === 'y' ? 'x' : 'y';
    const box = hull(items);

    const children: Element[] = [];
    for (const part of parts) {
      let child = partition(part, depth + 1);
      if (!child) return null;
      const childBox = hull(part);
      const { align: self, error, offset } = alignOf(
        childBox,
        box,
        cross,
        child.type === 'group',
      );

      /*
       * A group sitting at an ARBITRARY cross-axis offset — a status row 29px
       * in from the card's edge — is neither start, centre nor end. Flex can
       * still express it exactly: widen the group to the parent's full extent
       * and push its contents across with padding. Only a group can absorb
       * this, since a leaf has no padding of its own.
       */
      if (error > 2 && child.type === 'group' && offset > 0) {
        const g = child as Extract<Element, { type: 'group' }>;
        const p = g.layout?.padding;
        const base = typeof p === 'number' ? [p, p] : Array.isArray(p) ? [p[0], p[1]] : [0, 0];
        child = {
          ...g,
          [cross === 'x' ? 'x' : 'y']: box[cross],
          [cross === 'x' ? 'width' : 'height']: box[cross === 'x' ? 'width' : 'height'],
          layout: {
            ...g.layout!,
            padding: (cross === 'x'
              ? [base[0], base[1], base[0], offset]
              : [offset, base[1], base[0], base[1]]) as LayoutSpec['padding'],
          },
        } as Element;
        children.push(child);
        continue;
      }

      children.push(self === 'start' ? child : ({ ...child, alignSelf: self } as Element));
    }

    // If every child wants the same alignment, say it once on the container.
    const selves = children.map((c) => (c as { alignSelf?: string }).alignSelf ?? 'start');
    const uniform = selves.every((s) => s === selves[0]) ? selves[0] : null;
    const cleaned = uniform
      ? children.map((c) => {
          const { alignSelf: _drop, ...rest } = c as unknown as Record<string, unknown>;
          return rest as unknown as Element;
        })
      : children;

    groupsMade++;
    return {
      type: 'group',
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      layout: {
        direction,
        gap: gapBetween(parts, axis),
        padding: 0,
        align: (uniform ?? 'start') as LayoutSpec['align'],
      },
      children: cleaned,
    } as Element;
  }

  return null;
}

/**
 * Leaves keyed by a tag stamped on before nesting.
 *
 * Comparing by position in the list is wrong: nesting REORDERS leaves —
 * grouping a title with the icons beside it moves both ahead of a caption
 * that used to sit between them — so an order-based diff compares unrelated
 * elements and reports a huge phantom drift. Identity is the only safe key.
 */
const TAG = '__nestId';

function leaves(el: Element, out: Map<string, Element> = new Map()): Map<string, Element> {
  const kids = (el as { children?: Element[] }).children ?? [];
  if (!kids.length) {
    const id = (el as unknown as Record<string, string>)[TAG];
    if (id) out.set(id, el);
    return out;
  }
  kids.forEach((k) => leaves(k, out));
  return out;
}

/** Stamp, and strip, the comparison tag. */
function tag(el: Element, id: string): Element {
  const kids = (el as { children?: Element[] }).children;
  const self = { ...el, [TAG]: id } as unknown as Element;
  if (!kids?.length) return self;
  return { ...self, children: kids.map((k, i) => tag(k, `${id}.${i}`)) } as Element;
}

function untag(el: Element): Element {
  const { [TAG]: _drop, ...rest } = el as unknown as Record<string, unknown>;
  const kids = (rest as { children?: Element[] }).children;
  if (kids?.length) (rest as { children: Element[] }).children = kids.map(untag);
  return rest as unknown as Element;
}

function resolveOne(el: Element): Element {
  const doc: Doc = {
    id: 't', name: 't', layout: 'bare',
    canvas: { width: 0, height: 0 }, elements: [el],
  };
  return resolveLayout(doc).elements[0];
}

let converted = 0;
let failed = 0;
const notes: string[] = [];

function nest(el: Element, label: string): Element {
  let out = el;

  const kids = (out as { children?: Element[] }).children;
  if (kids?.length) {
    out = { ...out, children: kids.map((k, i) => nest(k, `${label}>${k.type}[${i}]`)) } as Element;
  }

  if (!isContainer(out) || out.layout) return out;
  const children = (out as { children?: Element[] }).children ?? [];
  if (children.length < 2) return out;

  const items: Item[] = [];
  children.forEach((k, i) => {
    const box = boundingBox(k);
    if (box) items.push({ el: tag(k, String(i)), box });
  });
  if (items.length !== children.length) return out; // an unplaceable child

  const before = groupsMade;
  const tree = partition(items);
  if (!tree || (tree as { type?: string }).type !== 'group') {
    groupsMade = before;
    failed++;
    notes.push(`    · ${label} — children overlap on both axes; left absolute`);
    return out;
  }

  /*
   * Padding is inferred PER AXIS. Using the horizontal inset for both put a
   * card's content 26px below where it belonged whenever the two differed —
   * which is most of the time, because a card is usually wider than it is
   * generous at the top.
   */
  const cardBox = boundingBox(out)!;
  const padTop = onScale(Math.min(...items.map((i) => i.box.y)) - cardBox.y);
  const padLeft = onScale(Math.min(...items.map((i) => i.box.x)) - cardBox.x);
  const padding: LayoutSpec['padding'] =
    padTop === padLeft ? padTop : [padTop, padLeft];

  const candidate = {
    ...out,
    layout: {
      direction: (tree as { layout: LayoutSpec }).layout.direction,
      gap: (tree as { layout: LayoutSpec }).layout.gap,
      padding,
      align: (tree as { layout: LayoutSpec }).layout.align,
    },
    // The top level of the tree becomes the card's own flow, so its children
    // become the card's children rather than adding a redundant wrapper.
    children: (tree as { children: Element[] }).children,
  } as Element;
  groupsMade--;

  // NOT re-tagged: `items` already carry their ids, and stamping again would
  // give the two sides different keys — which is exactly the bug that made
  // this check silently compare nothing and report every card as exact.
  const originals = leaves({ ...out, children: items.map((i) => i.el) } as Element);
  const after = leaves(resolveOne(candidate));
  let worst = 0;
  let worstAt = '';
  for (const [id, before] of originals) {
    const a = boundingBox(before);
    const b = after.has(id) ? boundingBox(after.get(id)!) : null;
    if (!a || !b) continue;
    const d = Math.max(
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
      // A resized element moves its own contents even when its origin holds.
      Math.abs(a.width - b.width),
      Math.abs(a.height - b.height),
    );
    if (d > worst) {
      worst = d;
      worstAt = (before as { content?: string; label?: string }).content
        ?? (before as { label?: string }).label ?? before.type;
    }
  }

  if (worst > TOLERANCE) {
    groupsMade = before;
    failed++;
    notes.push(
      `    · ${label} — nesting would move "${worstAt}" ${worst.toFixed(0)}px; left absolute`,
    );
    return out;
  }

  converted++;
  const depth = countGroups(candidate);
  notes.push(
    `    ✓ ${label} → ${(candidate as { layout: LayoutSpec }).layout.direction}` +
      ` with ${depth} nested group${depth === 1 ? '' : 's'}` +
      `${worst > 2 ? ` (rhythm normalised, max move ${worst.toFixed(1)}px)` : ' (exact)'}`,
  );
  return untag(candidate);
}

function countGroups(el: Element): number {
  const kids = (el as { children?: Element[] }).children ?? [];
  return kids.reduce((n, k) => n + (k.type === 'group' ? 1 : 0) + countGroups(k), 0);
}

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json'))) {
  const doc: Doc = JSON.parse(readFileSync(join(DOCS, file), 'utf8'));
  notes.length = 0;
  const b = { converted, failed };

  const next: Doc = {
    ...doc,
    elements: doc.elements.map((e, i) => nest(e, `${e.type}[${i}]`)),
  };

  if (converted - b.converted || failed - b.failed) {
    console.log(`${doc.id}  —  ${converted - b.converted} nested, ${failed - b.failed} still absolute`);
    notes.forEach((n) => console.log(n));
    console.log('');
  }
  if (WRITE) writeFileSync(join(DOCS, file), `${JSON.stringify(next, null, 2)}\n`);
}

console.log(`${converted} cards nested (${groupsMade} groups created); ${failed} still absolute.`);
console.log(WRITE ? 'written.' : 'dry run — pass --write to apply.');
