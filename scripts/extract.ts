/**
 * Structural extractor for the original Figma exports.
 *
 * Strips outlined-glyph paths (which are noise) and reports the geometry that
 * actually matters: panels, cards, pills, lines, icons, and gradient recipes.
 * Used to author the documents in ./docs — not part of the runtime library.
 *
 *   node --experimental-strip-types scripts/extract.ts "<reference file>"
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');
const body = src.slice(0, src.indexOf('<defs>') >= 0 ? src.indexOf('<defs>') : undefined);

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

console.log(`# ${file}`);
console.log(`viewBox: ${src.match(/viewBox="([^"]*)"/)?.[1]}`);

/* ---- rounded rects: panels, cards, pills, inputs, tracks --------------- */
console.log('\n## rects');
for (const m of body.matchAll(/<rect\b[^>]*>/g)) {
  const t = m[0];
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => num(attr(t, k)) ?? 0);
  const rx = num(attr(t, 'rx'));
  const fill = attr(t, 'fill') ?? '';
  const stroke = attr(t, 'stroke') ?? '';
  const op = attr(t, 'fill-opacity') ?? '';
  const kind =
    rx === undefined ? 'sharp' : rx >= h / 2 - 0.6 ? 'PILL' : rx >= 6 ? 'card' : 'small';
  console.log(
    `  ${kind.padEnd(5)} ${x},${y} ${w}x${h} r=${rx ?? '-'} ` +
      `fill=${fill.replace(/url\(#(\w+?)_\d+_\d+\)/, 'grad:$1')}${op ? ` op=${op}` : ''}` +
      `${stroke ? ` stroke=${stroke.replace(/url\(#(\w+?)_\d+_\d+\)/, 'grad:$1')}` : ''}`,
  );
}

/* ---- circles / ellipses: avatars, nodes, glows, dots ------------------- */
console.log('\n## circles & ellipses');
for (const m of body.matchAll(/<(circle|ellipse)\b[^>]*>/g)) {
  const t = m[0];
  const cx = num(attr(t, 'cx')) ?? 0;
  const cy = num(attr(t, 'cy')) ?? 0;
  const r = attr(t, 'r') ?? `${attr(t, 'rx')}/${attr(t, 'ry')}`;
  console.log(`  ${m[1]} ${cx},${cy} r=${r} fill=${attr(t, 'fill')} op=${attr(t, 'fill-opacity') ?? attr(t, 'opacity') ?? ''}`);
}

/* ---- straight lines: rules, connectors, dividers ----------------------- */
console.log('\n## lines');
for (const m of body.matchAll(/<line\b[^>]*>/g)) {
  const t = m[0];
  console.log(
    `  ${attr(t, 'x1')},${attr(t, 'y1')} -> ${attr(t, 'x2')},${attr(t, 'y2')} ` +
      `stroke=${attr(t, 'stroke')} w=${attr(t, 'stroke-width') ?? 1}` +
      `${attr(t, 'stroke-dasharray') ? ` dash=${attr(t, 'stroke-dasharray')}` : ''}`,
  );
}

/* ---- paths, bucketed by length ---------------------------------------- */
console.log('\n## paths');
const buckets = { icon: 0, glyphRun: 0 };
for (const m of body.matchAll(/<path\b[^>]*?\bd="([^"]*)"[^>]*>/g)) {
  const d = m[1];
  const t = m[0];
  const stroked = /\bstroke="/.test(t) && !/fill="(?!none)/.test(t);
  // Long fill-only paths are almost always a merged run of outlined glyphs.
  if (d.length > 1200 && !stroked) {
    buckets.glyphRun++;
    continue;
  }
  buckets.icon++;
  const label = stroked ? 'stroke' : 'fill  ';
  const paint = (stroked ? attr(t, 'stroke') : attr(t, 'fill')) ?? '';
  const bbox = (() => {
    const ns = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    const xs = ns.filter((_, i) => i % 2 === 0);
    const ys = ns.filter((_, i) => i % 2 === 1);
    if (!xs.length) return '';
    return `[${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)} ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)}x${(Math.max(...ys) - Math.min(...ys)).toFixed(0)}]`;
  })();
  console.log(
    `  ${label} len=${String(d.length).padStart(5)} ${bbox} paint=${paint.replace(/url\(#(\w+?)_\d+_\d+\)/, 'grad:$1')}` +
      `${d.length < 240 ? `\n         d=${d}` : ''}`,
  );
}
console.log(`  (${buckets.glyphRun} long fill paths skipped as outlined text runs)`);

/* ---- gradient recipes -------------------------------------------------- */
console.log('\n## gradients');
const defs = src.slice(src.indexOf('<defs>'));
for (const m of defs.matchAll(
  /<(linear|radial)Gradient id="(paint\d+)[^"]*"([^>]*)>([\s\S]*?)<\/\1Gradient>/g,
)) {
  const stops = [...m[4].matchAll(/<stop([^/]*)\/>/g)].map((s) =>
    s[1].replace(/\s+/g, ' ').trim(),
  );
  console.log(`  ${m[2]} ${m[1]} ${m[3].replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  stops.forEach((s) => console.log(`      ${s}`));
}

/* ---- embedded raster --------------------------------------------------- */
const rasters = [...src.matchAll(/<image[^>]*?(?:width="([^"]*)")?[^>]*?(?:height="([^"]*)")?[^>]*>/g)];
if (rasters.length) console.log(`\n## raster: ${rasters.length} <image> element(s)`);
for (const m of src.matchAll(/<(?:pattern|image)\b[^>]*>/g)) {
  const t = m[0].replace(/xlink:href="[^"]{40,}"/, 'xlink:href="<base64>"');
  if (t.length < 400) console.log(`  ${t}`);
}
