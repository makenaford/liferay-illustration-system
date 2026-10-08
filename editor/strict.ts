import type { Doc, Element } from '../src/document.ts';
import { boundingBox, resolveLayout, shifted } from '../src/autolayout.ts';
import { isImageBase, SLOT_RADIUS, slotIndex } from '../src/imageBase.ts';

/**
 * STRICT IMAGE BASE — every edit to an Image base, held to its guides.
 *
 * Run on each commit, so a drag, a nudge, a resize, a typed X or W, a paste
 * and a drop all obey it alike:
 *
 *   - the screenshot (the image that filled the slot before the edit) goes
 *     back to filling the slot exactly, with 16px corners — it cannot be
 *     moved or resized; a new picture dropped in still replaces it, and
 *     where it sits in the frame is still set by its crop
 *   - everything else on the canvas is kept inside the card guide: moved
 *     back in where it would cross it, and no wider or taller than it
 *
 * What is inside a card is the card's to place; connectors follow what
 * they are attached to. See src/imageBase.ts.
 */
export function strict(prev: Doc, next: Doc): Doc {
  if (!isImageBase(next)) return next;
  const m = next.mockup!;
  const g = next.cardArea!;
  // The screenshot, by where it was: it may have been dragged off the slot by this edit.
  const was = slotIndex(prev);
  const at = was >= 0 && prev.elements.length === next.elements.length ? was : slotIndex(next);

  let elements = next.elements.map((e, i) =>
    i === at && e.type === 'image'
      ? ({ ...e, x: m.x, y: m.y, width: m.width, height: m.height, radius: SLOT_RADIUS } as Element)
      : e,
  );

  const res = resolveLayout({ ...next, elements }).elements;
  elements = elements.map((e, i) => {
    if (i === at || e.type === 'connector') return e;
    const b = boundingBox(res[i]);
    if (!b) return e;
    let n = e as Element & { width?: number; height?: number };
    // No bigger than the guide.
    const sized = n.type === 'card' || n.type === 'subCard' || n.type === 'group' || n.type === 'image' || n.type === 'svg';
    if (sized && typeof n.width === 'number' && b.width > g.width) n = { ...n, width: g.width };
    if (sized && typeof n.height === 'number' && b.height > g.height) n = { ...n, height: g.height };
    const w = Math.min(b.width, g.width), h = Math.min(b.height, g.height);
    // Inside it: back in from whichever edge it crossed.
    const dx = b.x < g.x ? g.x - b.x : b.x + w > g.x + g.width ? g.x + g.width - (b.x + w) : 0;
    const dy = b.y < g.y ? g.y - b.y : b.y + h > g.y + g.height ? g.y + g.height - (b.y + h) : 0;
    return dx || dy ? shifted(n as Element, dx, dy) : (n as Element);
  });
  return { ...next, elements };
}
