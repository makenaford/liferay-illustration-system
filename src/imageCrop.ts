import type { Element } from './document.ts';

type ImageEl = Extract<Element, { type: 'image' }>;

/**
 * WHERE AN IMAGE SITS IN ITS FRAME — for a `cover` image placed by hand.
 *
 * `cover` scales the picture to fill the frame and crops the rest. Which part
 * shows is `crop`: `x` and `y` run 0 to 1, from showing the picture's left
 * (top) edge to its right (bottom), 0.5 centred — so the frame never shows
 * past the picture, however far it is dragged. `zoom`, 1 and up, scales it
 * further in. Working it out needs the picture's own size (`natural`),
 * recorded when it is uploaded; an image without one is centred, as before.
 */

export const ZOOM_MAX = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The picture's rectangle, frame coordinates — or null to draw it the plain way. */
export function coverRect(el: ImageEl): { x: number; y: number; width: number; height: number } | null {
  if ((el.fit ?? 'cover') !== 'cover' || !el.natural || !el.crop) return null;
  const { width: nw, height: nh } = el.natural;
  if (!(nw > 0 && nh > 0)) return null;
  const zoom = clamp(el.crop.zoom ?? 1, 1, ZOOM_MAX);
  const s = Math.max(el.width / nw, el.height / nh) * zoom;
  const w = nw * s;
  const h = nh * s;
  return {
    x: el.x + (el.width - w) * clamp(el.crop.x, 0, 1),
    y: el.y + (el.height - h) * clamp(el.crop.y, 0, 1),
    width: w,
    height: h,
  };
}

/**
 * The crop after dragging the picture by (dx, dy) frame px from `from` — the
 * picture follows the pointer, and stops at its edges.
 */
export function dragCrop(el: ImageEl, from: NonNullable<ImageEl['crop']>, dx: number, dy: number): NonNullable<ImageEl['crop']> {
  const r = coverRect({ ...el, crop: from });
  if (!r) return from;
  const spareX = r.width - el.width;
  const spareY = r.height - el.height;
  return {
    ...from,
    x: spareX > 0.5 ? clamp(from.x - dx / spareX, 0, 1) : 0.5,
    y: spareY > 0.5 ? clamp(from.y - dy / spareY, 0, 1) : 0.5,
  };
}
