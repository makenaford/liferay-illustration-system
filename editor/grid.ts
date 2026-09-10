import { LAYOUT } from '../src/tokens.ts';
import type { Element } from '../src/document.ts';

/**
 * Grid snapping.
 *
 * Snapping is applied to the *result* of a drag, not to the delta — dragging
 * by a snapped delta preserves whatever off-grid offset an element started
 * with, so things never actually converge onto the grid. Snapping the
 * destination is what pulls a document into alignment as you work it.
 */

export const snap = (n: number, step: number) =>
  step <= 0 ? n : Math.round(n / step) * step;

/** Move an element so its origin lands on the grid. */
export function snapElement(el: Element, step: number): Element {
  if (step <= 0) return el;

  if (el.type === 'avatar') {
    return { ...el, cx: snap(el.cx, step), cy: snap(el.cy, step) };
  }
  if (el.type === 'connector') {
    return {
      ...el,
      from: [snap(el.from[0], step), snap(el.from[1], step)],
      to: [snap(el.to[0], step), snap(el.to[1], step)],
    };
  }
  const e = el as Element & { x: number; y: number };
  return { ...el, x: snap(e.x, step), y: snap(e.y, step) } as Element;
}

/** Snap origin *and* size, keeping the element at least one step big. */
export function snapElementFull(el: Element, step: number): Element {
  const moved = snapElement(el, step) as Element & {
    width?: number;
    height?: number;
  };
  if (step <= 0) return moved;
  const out = { ...moved };
  if (typeof out.width === 'number') out.width = Math.max(snap(out.width, step), step);
  if (typeof out.height === 'number') out.height = Math.max(snap(out.height, step), step);
  return out as Element;
}

/** Recursively snap a subtree. */
export function snapTree(el: Element, step: number): Element {
  const snapped = snapElementFull(el, step) as Element & { children?: Element[] };
  if (!snapped.children) return snapped;
  return {
    ...snapped,
    children: snapped.children.map((c) => snapTree(c, step)),
  } as Element;
}

export const DEFAULT_STEP = LAYOUT.grid;
