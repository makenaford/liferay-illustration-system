import type { Element } from '../src/document.ts';

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
      return {
        x: Math.min(x0, x1) - 3,
        y: Math.min(y0, y1) - 3,
        width: Math.abs(x1 - x0) + 6,
        height: Math.abs(y1 - y0) + 6,
      };
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
