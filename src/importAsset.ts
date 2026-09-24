/**
 * Preparing an imported asset for inlining.
 *
 * Runs in the browser (the editor's file picker) and in Node (a build step),
 * so it is pure string work with no DOM.
 */

/**
 * Soften Figma's glass edge so it reads as a highlight rather than an outline.
 *
 * A Figma glass shape is two effects: a pure-white inner shadow for the edge,
 * and a `backdrop-filter` blur for the frosting. Only the first survives
 * export — `backdrop-filter` needs a live DOM and does nothing in an `<img>`,
 * an SVG file, or on a canvas. So the pane arrives as a 20-30% translucent
 * fill with a FULLY OPAQUE white rim, and the rim becomes the most visible
 * thing in the icon: a hard outline around every shape.
 *
 * Figma writes that rim as a colour matrix whose alpha multiplier is 1:
 *
 *   values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
 *                                                  ^ alpha
 *
 * Dropping it to 0.45 restores the intent — an edge that catches light —
 * without pretending we can reproduce a blur SVG cannot express.
 */
export const GLASS_RIM_ALPHA = 0.45;

export function softenGlassRim(markup: string, alpha = GLASS_RIM_ALPHA): string {
  return markup.replace(
    /values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/g,
    `values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${alpha} 0"`,
  );
}

/** Bytes above which a raster is worth warning about. */
export const RASTER_WARN_BYTES = 512 * 1024;

export interface ImportedSvg {
  viewBox: [number, number, number, number];
  /** Markup whose ids carry the `__NS__` placeholder. */
  body: string;
  /** Anything stripped, so the editor can say what changed. */
  notes: string[];
}

/**
 * Normalise an SVG file for inlining, the same way the glass icons are
 * normalised: strip the wrapper, namespace every id, and drop the
 * non-portable background-blur hack.
 *
 * The id rewriting is the part that matters. An imported file's `paint0_linear`
 * will collide with the next imported file's, and with the illustration's own
 * gradients — silently, by repainting the wrong shape. Every id becomes
 * `__NS__n`, and the renderer swaps that token for a per-instance namespace.
 */
export function importSvg(source: string): ImportedSvg {
  const notes: string[] = [];
  let s = source;

  // Comments, XML prolog and DOCTYPE carry nothing we want inline.
  s = s.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  if (/<script/i.test(s)) {
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    notes.push('removed <script> — imported artwork must not execute');
  }
  // Inline event handlers are the other script vector in an SVG.
  if (/\son\w+\s*=/i.test(s)) {
    s = s.replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, '');
    notes.push('removed inline event handlers');
  }
  const rims = (s.match(/values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/g) ?? []).length;
  if (rims) {
    s = softenGlassRim(s);
    notes.push(`softened ${rims} glass edge${rims === 1 ? '' : 's'} — see softenGlassRim`);
  }

  if (/<foreignObject/i.test(s)) {
    s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
    s = s.replace(/<clipPath id="bgblur[^"]*"[\s\S]*?<\/clipPath>/g, '');
    notes.push('removed foreignObject background-blur (ignored by rasterisers)');
  }

  const svgTag = s.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const vbRaw = svgTag.match(/viewBox="([^"]+)"/i)?.[1];
  let viewBox: [number, number, number, number];
  if (vbRaw) {
    const n = vbRaw.trim().split(/[\s,]+/).map(Number);
    viewBox = [n[0], n[1], n[2], n[3]];
  } else {
    // No viewBox: fall back to width/height, then to a square.
    const w = Number(svgTag.match(/\swidth="([\d.]+)/i)?.[1] ?? 100);
    const h = Number(svgTag.match(/\sheight="([\d.]+)/i)?.[1] ?? 100);
    viewBox = [0, 0, w, h];
    notes.push('no viewBox — inferred from width/height');
  }

  s = s.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');

  const ids = [...new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  ids.forEach((id, i) => {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = `__NS__${i}`;
    s = s.replace(new RegExp(`(\\sid=")${esc}(")`, 'g'), `$1${next}$2`);
    s = s.replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${next})`);
    s = s.replace(new RegExp(`((?:xlink:)?href=")#${esc}(")`, 'g'), `$1#${next}$2`);
  });
  if (ids.length) notes.push(`namespaced ${ids.length} id${ids.length === 1 ? '' : 's'}`);

  return { viewBox, body: s.replace(/\n\s*\n/g, '\n').trim(), notes };
}

/** A rough byte count for a data URI, for the size warning. */
export function dataUriBytes(uri: string): number {
  const i = uri.indexOf(',');
  if (i < 0) return uri.length;
  const payload = uri.slice(i + 1);
  return uri.slice(0, i).includes('base64') ? Math.floor((payload.length * 3) / 4) : payload.length;
}
