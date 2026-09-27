/**
 * IMAGE COMPRESSION — a raster made small enough to embed.
 *
 * Illustrations carry their images inline, and the shared library holds one
 * illustration per document, at most 250KB (assets-site/store.ts). A
 * screenshot straight from a design tool is a PNG of 0.5–2MB, so it is
 * redrawn here at no more than twice the size it will be shown at (sharp on
 * a 2x display) and re-encoded as WebP, stepping the quality down until it is
 * under BUDGET. The original is kept when that would not make it smaller, and
 * GIFs are left alone (they may be animated).
 */

/** An image this size or under is left for the document's other contents. */
export const BUDGET = 160 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

export interface Compressed {
  href: string;
  width: number;
  height: number;
  /** What changed, for the import note; undefined when nothing did. */
  change?: string;
}

const bytesOf = (dataUri: string) => Math.round(((dataUri.length - dataUri.indexOf(',') - 1) * 3) / 4);

/**
 * `href` (a data URI of `w` × `h` pixels), redrawn for a slot `slot` px in
 * size — fitted to cover it at 2x — and re-encoded as WebP.
 */
export async function compressImage(
  href: string,
  w: number,
  h: number,
  slot: { width: number; height: number },
): Promise<Compressed> {
  if (/^data:image\/gif/i.test(href) || !w || !h) return { href, width: w, height: h };
  // Enough pixels to cover the slot at 2x, never more than the original.
  const k = Math.min(1, Math.max((2 * slot.width) / w, (2 * slot.height) / h));
  const width = Math.max(1, Math.round(w * k));
  const height = Math.max(1, Math.round(h * k));

  const img = new Image();
  img.src = href;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { href, width: w, height: h };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const before = bytesOf(href);
  let best: string | undefined;
  for (const q of QUALITIES) {
    const out = canvas.toDataURL('image/webp', q);
    // A browser without WebP encoding answers with a PNG: keep the original.
    if (!out.startsWith('data:image/webp')) return { href, width: w, height: h };
    best = out;
    if (bytesOf(out) <= BUDGET) break;
  }
  if (!best || bytesOf(best) >= before) return { href, width: w, height: h };
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  return {
    href: best,
    width,
    height,
    change: `${kb(before)} → ${kb(bytesOf(best))} WebP${k < 1 ? `, ${width} × ${height}` : ''}`,
  };
}
