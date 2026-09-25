import type { Doc, Element } from '../src/document.ts';
import type { Box } from './bounds.ts';
import { elementAt, isContainer, parentOf } from './state.ts';
import { insertAt, slotForDrop, type Slot } from './insertion.ts';

/**
 * DRAGGING INTO AND OUT OF CARDS.
 *
 * Where a dragged element belongs is decided by containment, not by the
 * cursor: it goes into the innermost card or group that its whole box sits
 * inside, and leaves a card once any part of it is outside. The strictness
 * is deliberate. Several illustrations float a card half over another — an
 * overlay is the point of it — and nudging one must not swallow it into the
 * card underneath. Holding ⌘ turns nesting off for the drag.
 *
 * Inside an auto-layout container the cursor picks the position in the flow,
 * the same rule a file drop uses.
 */

const inside = (a: Box, b: Box) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.x + a.width <= b.x + b.width + 0.5 &&
  a.y + a.height <= b.y + b.height + 0.5;

const within = (path: string, root: string) => path === root || path.startsWith(`${root}.`);

/** The innermost container that fully holds `box`, other than the dragged element's own subtree. */
export function containerFor(resolved: Doc, box: Box, dragged: string): string | null {
  let best: { path: string; depth: number } | null = null;
  const walk = (els: Element[], prefix: string, depth: number) =>
    els.forEach((el, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (within(path, dragged)) return;
      const b = el as Element & { x?: number; y?: number; width?: number; height?: number };
      if (
        isContainer(el) &&
        typeof b.x === 'number' && typeof b.y === 'number' &&
        typeof b.width === 'number' && typeof b.height === 'number' &&
        inside(box, b as Box)
      ) {
        // Deeper wins; at equal depth the later sibling, which draws on top.
        if (!best || depth >= best.depth) best = { path, depth };
      }
      const kids = (el as { children?: Element[] }).children;
      if (kids) walk(kids, path, depth + 1);
    });
  walk(resolved.elements, '', 0);
  return (best as { path: string } | null)?.path ?? null;
}

export interface DropPlan {
  slot: Slot;
  /** Whether dropping here changes the element's container or flow position. */
  changes: boolean;
}

/** Where a drag of `dragged`, currently occupying `box`, would land. */
export function planDrop(
  doc: Doc,
  resolved: Doc,
  dragged: string,
  box: Box,
  pointer: { x: number; y: number },
): DropPlan {
  const from = parentOf(dragged);
  const target = containerFor(resolved, box, dragged);
  const slot = target ? slotForDrop(doc, resolved, target, pointer) : { parent: null };

  const flows = !!(slot.parent && (elementAt(doc, slot.parent) as { layout?: unknown } | null)?.layout);
  if (slot.parent !== from) return { slot, changes: true };
  if (!flows) return { slot, changes: false };
  // Same flow: a change only if it lands somewhere other than where it is.
  const at = Number(dragged.slice(dragged.lastIndexOf('.') + 1));
  const to = slot.index ?? Number.POSITIVE_INFINITY;
  const kids = (elementAt(doc, slot.parent!) as { children?: Element[] }).children ?? [];
  const effective = Math.min(to, kids.length);
  return { slot, changes: effective !== at && effective !== at + 1 };
}

/** Remove the element at `from` and insert `el` at `slot`; returns the new path. */
export function moveTo(doc: Doc, from: string, el: Element, slot: Slot): { doc: Doc; path: string } {
  const parent = parentOf(from);
  const at = Number(from.slice(from.lastIndexOf('.') + 1));

  // Take it out.
  const removed: Doc = parent
    ? (() => {
        const p = elementAt(doc, parent) as Element & { children?: Element[] };
        const kids = (p.children ?? []).filter((_, i) => i !== at);
        return replaceChildren(doc, parent, kids);
      })()
    : { ...doc, elements: doc.elements.filter((_, i) => i !== at) };

  // Paths after the removed element, in the same list, moved up by one.
  const depth = from.split('.').length - 1;
  const shift = (path: string | null): string | null => {
    if (!path) return path;
    const parts = path.split('.').map(Number);
    const sameList = parts.length > depth && parts.slice(0, depth).join('.') === from.split('.').slice(0, depth).join('.');
    if (sameList && parts[depth] > at) parts[depth] -= 1;
    return parts.join('.');
  };
  let index = slot.index;
  if (slot.parent === parent && index !== undefined && index > at) index -= 1;
  return insertAt(removed, { parent: shift(slot.parent), index }, el);
}

function replaceChildren(doc: Doc, path: string, children: Element[]): Doc {
  const idx = path.split('.').map(Number);
  const walk = (list: Element[], d: number): Element[] =>
    list.map((item, i) => {
      if (i !== idx[d]) return item;
      if (d === idx.length - 1) return { ...item, children } as Element;
      return { ...item, children: walk((item as { children?: Element[] }).children ?? [], d + 1) } as Element;
    });
  return { ...doc, elements: walk(doc.elements, 0) };
}
