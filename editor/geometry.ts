import type { Element } from '../src/document.ts';
import { axisBand } from '../src/primitives/axisLabels.ts';

/**
 * Position and size abstraction.
 *
 * Elements don't agree on how they're anchored — most use `x`/`y`, avatars use
 * `cx`/`cy`, connectors have two endpoints. Rather than special-casing in the
 * drag handler, everything goes through these four functions.
 */

export function movedBy(el: Element, dx: number, dy: number): Element {
  if (el.type === 'avatar') {
    return { ...el, cx: round(el.cx + dx), cy: round(el.cy + dy) };
  }
  if (el.type === 'connector') {
    return {
      ...el,
      from: [round(el.from[0] + dx), round(el.from[1] + dy)],
      to: [round(el.to[0] + dx), round(el.to[1] + dy)],
    };
  }
  const e = el as Element & { x: number; y: number };
  return { ...el, x: round(e.x + dx), y: round(e.y + dy) } as Element;
}

/** Whether this element type can be resized by dragging a corner. */
export function isResizable(el: Element): boolean {
  if (el.type === 'avatar') return true;
  return (
    'width' in el &&
    'height' in el &&
    typeof (el as { height?: unknown }).height === 'number'
  );
}

export function resizedTo(el: Element, width: number, height: number): Element {
  // A circle: the larger side is its diameter. Re-centred by the caller.
  if (el.type === 'avatar') return { ...el, r: round(Math.max(width, height, 4) / 2) };
  // A line's box is its run and rise, and 0 is the common case — a flat rule.
  const min = el.type === 'line' ? 0 : 4;
  // A line chart's box includes its labels; its `height` is the plot alone,
  // so the labels keep their size and gap and ride along under the plot.
  const band = el.type === 'lineChart' || el.type === 'barChart' ? axisBand(el) : 0;
  return {
    ...el,
    width: round(Math.max(width, min)),
    height: round(Math.max(height - band, min)),
  } as Element;
}

/** Move children alongside their container, so dragging a card is coherent. */
export function movedDeep(el: Element, dx: number, dy: number): Element {
  const moved = movedBy(el, dx, dy);
  const kids = (el as { children?: Element[] }).children;
  if (!kids) return moved;
  return {
    ...moved,
    children: kids.map((k) => movedDeep(k, dx, dy)),
  } as Element;
}

const round = (n: number) => Math.round(n * 100) / 100;
