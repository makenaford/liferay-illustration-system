/**
 * CUSTOM ICON SHAPE — the rule a custom icon has to meet, shared by the repo's
 * import (scripts/build-custom-icons.ts) and uploads to the Marketing Assets
 * site's Custom icons set, so both accept and refuse the same files.
 *
 * A custom icon is drawn as MingCute's are, so the two mix: a 24 × 24
 * viewBox, filled shapes only (strokes outlined, no transforms). Colours are
 * dropped — the illustration's own colour paints it — so only the shapes are
 * kept, joined into one path.
 */

/** A custom icon's key, from its file or display name: "Server Stack" -> "server_stack". */
export const customIconKey = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** One file's painted shapes as a single path, or why it can't be. */
export function customShape(svg: string): { d: string } | { problem: string } {
  const viewBox = svg.match(/<svg\b[^>]*\sviewBox="([^"]+)"/)?.[1]?.trim().split(/[\s,]+/).map(Number);
  const w = Number(svg.match(/<svg\b[^>]*\swidth="([\d.]+)/)?.[1]);
  const h = Number(svg.match(/<svg\b[^>]*\sheight="([\d.]+)/)?.[1]);
  const box = viewBox ?? (w && h ? [0, 0, w, h] : undefined);
  if (!box || box[0] !== 0 || box[1] !== 0 || box[2] !== 24 || box[3] !== 24) {
    return { problem: `draw it on a 24 × 24 grid (viewBox="0 0 24 24")${box ? ` — it is ${box.join(' ')}` : ''}` };
  }
  if (/<(rect|circle|ellipse|line|polyline|polygon)\b/.test(svg)) {
    return { problem: 'convert its rectangles, circles and lines to paths (Outline Stroke / Flatten in Figma)' };
  }
  if (/\stransform="/.test(svg)) {
    return { problem: 'flatten its transforms, so every path is in the grid’s own coordinates' };
  }
  // A path with no fill of its own inherits one; inside an unfilled wrapper
  // (<svg fill="none">, <g fill="none">) it draws nothing — MingCute's frame.
  const unfilledWrapper = /<(svg|g)\b[^>]*\sfill="none"/.test(svg);
  const painted: string[] = [];
  for (const [, attrs] of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const d = attrs.match(/\sd="([^"]+)"/)?.[1];
    if (!d) continue;
    const stroke = attrs.match(/\sstroke="([^"]+)"/)?.[1];
    const fill = attrs.match(/\sfill="([^"]+)"/)?.[1];
    if (stroke && stroke !== 'none') {
      return { problem: 'outline its strokes into filled shapes (Outline Stroke in Figma)' };
    }
    // An unfilled path draws nothing — a frame, a guide.
    if (fill === 'none' || (!fill && unfilledWrapper)) continue;
    painted.push(d);
  }
  if (!painted.length) return { problem: 'it has no filled paths to draw' };
  return { d: painted.join(' ') };
}

