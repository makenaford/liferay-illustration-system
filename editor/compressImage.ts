/**
 * IMAGE COMPRESSION — a raster made small enough to embed, without blurring it.
 *
 * Illustrations carry their images inline, and the shared library holds one
 * illustration per document, at most MAX_DOC_BYTES (1.75 MB, under the
 * database's 2 MB a row — assets-site/store.ts). An image is kept at up to
 * MAX_EDGE on its long side, whatever box it first lands in: enough for the
 * largest an illustration draws it (a full-width screenshot) in a 3x export,
 * so it never has to be stretched up. It is re-encoded as WebP at high
 * quality, the quality stepping down a little and then the size, until it is
 * under BUDGET. The original is kept when that would not make it smaller,
 * and GIFs are left alone (they may be animated).
 *
 * It used to be redrawn at twice its box's size and squeezed under 160 KB,
 * as low as 55% quality — so a photo chosen into a small placeholder, then
 * enlarged, came out soft, and a large screenshot came out smudged.
 */

/** An image this size or under is left for the document's other contents: two or three fit an illustration. */
export const BUDGET = 600 * 1024;
/** The long side an image is kept at, at most: an 800-wide canvas at 3x. */
export const MAX_EDGE = 2400;
/** Quality first, then size: a little smaller reads sharper than heavily compressed. */
const QUALITIES = [0.9, 0.82, 0.75];
const SCALES = [1, 0.85, 0.7, 0.55];

export interface Compressed {
  href: string;
  width: number;
  height: number;
  /** What changed, for the import note; undefined when nothing did. */
  change?: string;
}

const bytesOf = (dataUri: string) => Math.round(((dataUri.length - dataUri.indexOf(',') - 1) * 3) / 4);

/** `href` (a data URI of `w` × `h` pixels), at most MAX_EDGE on its long side, re-encoded as WebP under BUDGET. */
export async function compressImage(href: string, w: number, h: number): Promise<Compressed> {
  if (/^data:image\/gif/i.test(href) || !w || !h) return { href, width: w, height: h };
  const fit = Math.min(1, MAX_EDGE / Math.max(w, h));

  // `load`, not `decode()`, which waits for the page to render and never
  // settles in a hidden tab.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('the image could not be read'));
    img.src = href;
  });
  const before = bytesOf(href);

  let best: Compressed | undefined;
  for (const scale of SCALES) {
    const k = fit * scale;
    const width = Math.max(1, Math.round(w * k));
    const height = Math.max(1, Math.round(h * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { href, width: w, height: h };
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    for (const q of QUALITIES) {
      const out = canvas.toDataURL('image/webp', q);
      // A browser without WebP encoding answers with a PNG: keep the original.
      if (!out.startsWith('data:image/webp')) return { href, width: w, height: h };
      best = { href: out, width, height };
      if (bytesOf(out) <= BUDGET) break;
    }
    if (best && bytesOf(best.href) <= BUDGET) break;
  }
  // Already small and within MAX_EDGE: the original, untouched.
  if (!best || (fit === 1 && before <= BUDGET && bytesOf(best.href) >= before)) return { href, width: w, height: h };
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  const resized = best.width !== w;
  return {
    ...best,
    change: `${kb(before)} → ${kb(bytesOf(best.href))} WebP${resized ? `, ${best.width} × ${best.height}` : ''}`,
  };
}
