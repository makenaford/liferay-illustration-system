import type { Doc, Element } from '../src/document.ts';
import { LAYOUT } from '../src/tokens.ts';
import { CURSOR_ASPECT } from '../src/primitives/cursor.ts';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Selection bounds for an element.
 *
 * Props first, DOM measurement only as a fallback. That ordering matters:
 * glass surfaces contain a `<use>` of the canvas-sized backdrop for their
 * frosted pane, and `getBBox()` ignores both `clip-path` and `filter`, so
 * measuring a card would return the whole canvas. Anything whose geometry is
 * already in the document is computed, never measured.
 */
export function boundsOf(el: Element, node: SVGGraphicsElement | null): Box | null {
  switch (el.type) {
    case 'avatar': {
      const r = el.r ?? 11.875;
      return { x: el.cx - r, y: el.cy - r, width: r * 2, height: r * 2 };
    }
    case 'connector': {
      const [x0, y0] = el.from;
      const [x1, y1] = el.to;
      // The end rings (on by default wherever nodes are) reach 12 past each end.
      const reach = el.nodes !== false && el.rings !== false ? 12 : 3;
      return {
        x: Math.min(x0, x1) - reach,
        y: Math.min(y0, y1) - reach,
        width: Math.abs(x1 - x0) + reach * 2,
        height: Math.abs(y1 - y0) + reach * 2,
      };
    }
    case 'cursor': {
      const w = el.size ?? 85.5953;
      return { x: el.x, y: el.y, width: w, height: w * CURSOR_ASPECT };
    }
    case 'icon':
    case 'spotIcon': {
      const s = el.size ?? (el.type === 'icon' ? 20 : 48);
      return { x: el.x, y: el.y, width: s, height: s };
    }
    default:
      break;
  }

  const e = el as Element & { x?: number; y?: number; width?: number; height?: number };
  if (typeof e.width === 'number' && typeof e.height === 'number') {
    return { x: e.x ?? 0, y: e.y ?? 0, width: e.width, height: e.height };
  }
  // Progress rows, skeletons and badges carry a width but default their height.
  if (typeof e.width === 'number' && typeof e.x === 'number') {
    const measured = measure(node);
    return {
      x: e.x,
      y: measured ? measured.y : (e.y ?? 0),
      width: e.width,
      height: measured ? measured.height : 8,
    };
  }
  return measure(node);
}

function measure(node: SVGGraphicsElement | null): Box | null {
  if (!node) return null;
  try {
    const b = node.getBBox();
    if (!b.width && !b.height) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

/**
 * The safe area: where the drawing may go, in ARTBOARD units.
 *
 * `LAYOUT.canvasInset` is measured in export pixels, after the artboard is
 * fitted into the canvas — the same edge the audit checks. The editor works
 * in artboard units, so the inset is converted back through that fit.
 */
export function safeArea(doc: Doc): Box {
  const art = doc.artboard ?? doc.canvas;
  const fit = Math.min(doc.canvas.width / art.width, doc.canvas.height / art.height);
  const ox = (doc.canvas.width - art.width * fit) / 2;
  const oy = (doc.canvas.height - art.height * fit) / 2;
  const ix = Math.max(0, (LAYOUT.canvasInset - ox) / fit);
  const iy = Math.max(0, (LAYOUT.canvasInset - oy) / fit);
  return { x: ix, y: iy, width: art.width - ix * 2, height: art.height - iy * 2 };
}
