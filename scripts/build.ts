/**
 * Build both themes for every document in ./docs, plus a comparison page
 * against the original Figma export.
 *
 *   node --experimental-strip-types scripts/build.ts
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDocument } from '../src/render.ts';
import type { Doc } from '../src/document.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'out');
mkdirSync(OUT, { recursive: true });

const docs = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.json'));
const built: { doc: Doc; dark: string; light: string; bytes: [number, number] }[] = [];

for (const file of docs) {
  const doc: Doc = JSON.parse(readFileSync(join(ROOT, 'docs', file), 'utf8'));
  const dark = renderDocument(doc, 'dark');
  const light = renderDocument(doc, 'light');

  const dp = join(OUT, `${doc.id}.dark.svg`);
  const lp = join(OUT, `${doc.id}.light.svg`);
  writeFileSync(dp, dark);
  writeFileSync(lp, light);

  built.push({
    doc,
    dark: `${doc.id}.dark.svg`,
    light: `${doc.id}.light.svg`,
    bytes: [Buffer.byteLength(dark), Buffer.byteLength(light)],
  });

  const src = readFileSync(join(ROOT, 'docs', file), 'utf8');
  console.log(
    `${doc.id.padEnd(16)} doc ${String(Buffer.byteLength(src)).padStart(5)}B` +
      `  ->  dark ${(Buffer.byteLength(dark) / 1024).toFixed(1)}KB` +
      `  light ${(Buffer.byteLength(light) / 1024).toFixed(1)}KB`,
  );
}

/* ---- comparison page ---------------------------------------------------- */

const ORIGINALS = join(ROOT, 'reference');
const originals = new Set(
  (() => {
    try {
      return readdirSync(ORIGINALS);
    } catch {
      return [] as string[];
    }
  })(),
);

const cards = built
  .map((b) => {
    const orig = [...originals].find((f) => basename(f, '.svg') === b.doc.name);
    return `
    <section>
      <h2>${b.doc.name}</h2>
      <div class="row">
        <figure>
          <div class="frame">${orig ? `<img src="../reference/${encodeURIComponent(orig)}" alt="">` : '<div class="missing">original not found</div>'}</div>
          <figcaption><b>Original export</b><span>Figma · text outlined</span></figcaption>
        </figure>
        <figure>
          <div class="frame">${readFileSync(join(OUT, b.dark), 'utf8')}</div>
          <figcaption><b>Rebuilt — dark</b><span>${(b.bytes[0] / 1024).toFixed(1)}KB · live text</span></figcaption>
        </figure>
        <figure>
          <div class="frame light">${readFileSync(join(OUT, b.light), 'utf8')}</div>
          <figcaption><b>Rebuilt — light</b><span>${(b.bytes[1] / 1024).toFixed(1)}KB · same document</span></figcaption>
        </figure>
      </div>
    </section>`;
  })
  .join('\n');

writeFileSync(
  join(OUT, 'compare.html'),
  `<meta charset="utf-8">
<title>Illustration system — spike</title>
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px; background:#f4f6f9; color:#020812;
         font:14px/1.5 'Source Sans 3', -apple-system, sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:#667380; margin:0 0 28px; }
  section { margin-bottom:36px; }
  h2 { font-size:14px; font-weight:600; color:#667380; margin:0 0 10px;
       text-transform:uppercase; letter-spacing:.06em; }
  .row { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  figure { margin:0; }
  .frame { background:#020812; border-radius:10px; overflow:hidden;
           box-shadow:0 1px 3px rgba(2,8,18,.12); aspect-ratio:560/372; }
  .frame.light { background:#FBFCFE; }
  .frame > svg, .frame > img { width:100%; height:100%; display:block; }
  .missing { display:grid; place-items:center; height:100%; color:#667380; font-size:12px; }
  figcaption { padding:8px 2px; font-size:12px; display:flex; flex-direction:column; }
  figcaption b { font-weight:600; }
  figcaption span { color:#8C96A9; }
</style>
<h1>Illustration system — vertical slice</h1>
<p class="sub">One JSON document, seven primitives, two token sets. Text is live &lt;text&gt; — try selecting it.</p>
${cards}
`,
);

console.log(`\nwrote out/compare.html`);
