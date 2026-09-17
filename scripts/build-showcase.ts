/**
 * SHOWCASE — a page for seeing the illustrations where they will actually live.
 *
 * Every SVG is inlined, both themes of every document, and the page's theme
 * control switches the artwork along with the page. That is the whole claim of
 * the system in one gesture: one document, two themes, no second file to keep
 * in sync — so the page has to demonstrate it rather than assert it.
 *
 * Generated rather than hand-written because it embeds ~600KB of artwork.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc } from '../src/document.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'out');

interface Entry {
  id: string;
  name: string;
  elements: number;
  light: string;
  dark: string;
}

const countElements = (els: { children?: unknown[] }[]): number =>
  els.reduce(
    (n, e) => n + 1 + countElements(((e.children ?? []) as { children?: unknown[] }[])),
    0,
  );

/** Strip the fixed width/height so CSS can size it; keep the viewBox. */
const fluid = (svg: string) =>
  svg.replace(/^<svg width="\d+" height="\d+"/, '<svg');

const docs: Entry[] = readdirSync(join(ROOT, 'docs'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const doc = JSON.parse(readFileSync(join(ROOT, 'docs', f), 'utf8')) as Doc;
    return {
      id: doc.id,
      name: doc.name,
      elements: countElements(doc.elements as { children?: unknown[] }[]),
      light: fluid(readFileSync(join(OUT, `${doc.id}.light.svg`), 'utf8')),
      dark: fluid(readFileSync(join(OUT, `${doc.id}.dark.svg`), 'utf8')),
    };
  });

const by = (id: string) => {
  const d = docs.find((x) => x.id === id);
  if (!d) throw new Error(`no document ${id}`);
  return d;
};

/** Both themes inline; CSS reveals the one matching the page theme. */
const art = (d: Entry, cls = '') =>
  `<div class="art ${cls}" role="img" aria-label="${d.name}">` +
  `<div class="t t-light">${d.light}</div><div class="t t-dark">${d.dark}</div></div>`;

const SECTIONS = [
  {
    doc: 'integrate-all-systems',
    eyebrow: 'Platform',
    head: 'Every system, one place',
    body:
      'Connect the CRM, the commerce engine, the identity provider and the ' +
      'PIM to a single composable core &mdash; and stop paying the integration tax ' +
      'twice.',
    cta: 'See the architecture',
  },
  {
    doc: 'secure-access',
    eyebrow: 'Security',
    head: 'Access that auditors sign off on',
    body:
      'Single sign-on, an audit trail that answers the question before it is ' +
      'asked, and vulnerability counts that stay at zero.',
    cta: 'Read the compliance brief',
  },
  {
    doc: 'partner-dashboard',
    eyebrow: 'Partners',
    head: 'See the pipeline your partners are building',
    body:
      'Registered deals, co-sell motion and closed revenue in one view, so ' +
      'partner managers spend their week on the deals that moved.',
    cta: 'Explore partner reporting',
  },
];

const THREE_UP = ['deploy-daily', 'turn-analytics', 'launch-campaigns'];

const html = `<title>Illustration Contact Sheet</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
/* The page borrows the illustrations' own tokens, so artwork and chrome
   resolve from one palette rather than two that nearly agree. */
:root {
  --ground: #fbfcfe;
  --raised: #ffffff;
  --ink: #262c37;
  --muted: #6f798e;
  --line: #e0e4eb;
  --accent: #0b5fff;
  --accent-soft: #7aa8ff;
  --wash: rgba(11, 95, 255, 0.05);
  --shadow: 0 10px 28px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.06);
  --sans: "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme: light;
}
:root:not([data-theme="light"]) { }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #070b13;
    --raised: #0f131b;
    --ink: #f0f1f5;
    --muted: #8b94a8;
    --line: #313948;
    --accent: #70a2ff;
    --accent-soft: #adc9ff;
    --wash: rgba(112, 162, 255, 0.08);
    --shadow: 0 18px 40px rgba(0, 0, 0, 0.45), 0 3px 8px rgba(0, 0, 0, 0.3);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --ground: #070b13;
  --raised: #0f131b;
  --ink: #f0f1f5;
  --muted: #8b94a8;
  --line: #313948;
  --accent: #70a2ff;
  --accent-soft: #adc9ff;
  --wash: rgba(112, 162, 255, 0.08);
  --shadow: 0 18px 40px rgba(0, 0, 0, 0.45), 0 3px 8px rgba(0, 0, 0, 0.3);
  color-scheme: dark;
}

* { box-sizing: border-box; }
body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  margin: 0;
}
.wrap { max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 0; }

/* Artwork: both themes inline, one revealed. */
.art { position: relative; }
.art svg { display: block; width: 100%; height: auto; border-radius: 10px; }
.t-dark { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .t-light { display: none; }
  :root:not([data-theme="light"]) .t-dark { display: block; }
}
:root[data-theme="dark"] .t-light { display: none; }
:root[data-theme="dark"] .t-dark { display: block; }
:root[data-theme="light"] .t-light { display: block; }
:root[data-theme="light"] .t-dark { display: none; }

header.bar {
  position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10;
  background: color-mix(in srgb, var(--ground) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.bar-in { display: flex; align-items: center; gap: 16px; padding-block: 12px; flex-wrap: wrap; }
.mark { font-weight: 700; letter-spacing: -0.2px; }
.mark span { color: var(--muted); font-weight: 400; }
.spacer { flex: 1; }
.seg { display: flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.seg button {
  font: 600 13px/1 var(--sans); color: var(--muted);
  background: transparent; border: 0; padding: 7px 16px; cursor: pointer;
}
.seg button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.lede { padding-block: 56px 40px; max-width: 62ch; }
.lede h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.1; letter-spacing: -1px; margin: 0 0 14px; text-wrap: balance; }
.lede p { color: var(--muted); font-size: 18px; margin: 0; }
.eyebrow { font: 600 11px/1 var(--sans); letter-spacing: 1.4px; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }

.stats { display: flex; flex-wrap: wrap; gap: 28px; padding-block: 0 48px; }
.stat b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.stat span { color: var(--muted); font-size: 13px; }

h2.sec {
  font-size: 13px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted);
  border-top: 1px solid var(--line); padding-top: 14px; margin: 0 0 28px;
}

/* In context: the artwork sitting in the kind of section it was drawn for. */
.ctx { display: grid; grid-template-columns: 1fr 1.1fr; gap: 48px; align-items: center; padding-block: 40px; }
.ctx.flip .ctx-copy { order: 2; }
.ctx h3 { font-size: clamp(24px, 3.4vw, 34px); line-height: 1.15; letter-spacing: -0.7px; margin: 0 0 12px; text-wrap: balance; }
.ctx p { color: var(--muted); margin: 0 0 20px; max-width: 46ch; }
.ctx a.cta {
  display: inline-block; font-weight: 600; font-size: 14px; color: #fff; text-decoration: none;
  background: var(--accent); padding: 10px 18px; border-radius: 6px;
}
.ctx a.cta:focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 2px; }

.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding-block: 8px 48px; }
.three h4 { margin: 14px 0 4px; font-size: 16px; letter-spacing: -0.2px; }
.three p { margin: 0; color: var(--muted); font-size: 14px; }

/* Contact sheet: every document at a consistent size, with its real numbers. */
.sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; padding-block: 0 64px; }
.item { background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: var(--shadow); }
.item .art svg { border-radius: 6px; }
.meta { display: flex; align-items: baseline; gap: 8px; margin-top: 12px; }
.meta b { font-size: 14.5px; letter-spacing: -0.1px; }
.meta code { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-left: auto; white-space: nowrap; }
.tag { font-family: var(--mono); font-size: 11px; color: var(--muted); }

footer { border-top: 1px solid var(--line); padding-block: 28px 56px; color: var(--muted); font-size: 14px; }
footer code { font-family: var(--mono); font-size: 12.5px; background: var(--wash); padding: 2px 6px; border-radius: 4px; color: var(--ink); }
footer p { max-width: 68ch; }

@media (max-width: 860px) {
  .ctx { grid-template-columns: 1fr; gap: 24px; }
  .ctx.flip .ctx-copy { order: 0; }
  .three { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>

<header class="bar">
  <div class="wrap bar-in">
    <div class="mark">Liferay illustrations <span>&middot; contact sheet</span></div>
    <div class="spacer"></div>
    <div class="seg" role="group" aria-label="Theme">
      <button type="button" id="t-light" aria-pressed="false">Light</button>
      <button type="button" id="t-dark" aria-pressed="false">Dark</button>
      <button type="button" id="t-system" aria-pressed="true">System</button>
    </div>
  </div>
</header>

<div class="wrap">
  <section class="lede">
    <div class="eyebrow">${docs.length} illustrations &middot; two themes &middot; one document each</div>
    <h1>The same artwork, in the theme the page is already in.</h1>
    <p>Every illustration below is a single source document rendered twice. Switch
    the theme and the artwork switches with the page &mdash; there is no second file to
    keep in sync, and nothing here is a screenshot.</p>
  </section>

  <div class="stats">
    <div class="stat"><b>${docs.length}</b><span>documents</span></div>
    <div class="stat"><b>560&times;372</b><span>every canvas</span></div>
    <div class="stat"><b>${docs.reduce((n, d) => n + d.elements, 0)}</b><span>live elements</span></div>
    <div class="stat"><b>165</b><span>design tokens</span></div>
    <div class="stat"><b>0</b><span>audit findings</span></div>
  </div>

  <h2 class="sec">In context</h2>
${SECTIONS.map(
  (s, i) => `  <section class="ctx${i % 2 ? ' flip' : ''}">
    <div class="ctx-copy">
      <div class="eyebrow">${s.eyebrow}</div>
      <h3>${s.head}</h3>
      <p>${s.body}</p>
      <a class="cta" href="#sheet">${s.cta}</a>
    </div>
    ${art(by(s.doc))}
  </section>`,
).join('\n')}

  <h2 class="sec">Three-up feature row</h2>
  <div class="three">
${THREE_UP.map((id) => {
  const d = by(id);
  return `    <div>
      ${art(d)}
      <h4>${d.name}</h4>
      <p class="tag">${d.elements} elements</p>
    </div>`;
}).join('\n')}
  </div>

  <h2 class="sec" id="sheet">Every illustration</h2>
  <div class="sheet">
${docs
  .map(
    (d) => `    <figure class="item" style="margin:0">
      ${art(d)}
      <figcaption class="meta"><b>${d.name}</b><code>${d.elements} el</code></figcaption>
    </figure>`,
  )
  .join('\n')}
  </div>

  <footer>
    <p>Rendered from <code>docs/*.json</code> by <code>npm run build:svg</code>. Text is
    live text in Source Sans 3, charts are drawn from data, and the glass is a real
    backdrop blur rather than a baked image &mdash; so every one of these is editable,
    searchable and re-themable after export.</p>
  </footer>
</div>

<script>
(function () {
  var root = document.documentElement;
  var ids = { light: 't-light', dark: 't-dark', system: 't-system' };
  function paint(mode) {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    Object.keys(ids).forEach(function (k) {
      var el = document.getElementById(ids[k]);
      if (el) el.setAttribute('aria-pressed', String(k === mode));
    });
    try { localStorage.setItem('showcase-theme', mode); } catch (e) {}
  }
  Object.keys(ids).forEach(function (k) {
    var el = document.getElementById(ids[k]);
    if (el) el.addEventListener('click', function () { paint(k); });
  });
  var saved = null;
  try { saved = localStorage.getItem('showcase-theme'); } catch (e) {}
  paint(saved === 'light' || saved === 'dark' ? saved : 'system');
})();
</script>
`;

mkdirSync(join(OUT, 'artifact'), { recursive: true });
const path = join(OUT, 'artifact', 'showcase.html');
writeFileSync(path, html);
console.log(
  `wrote ${path}  ${(html.length / 1024).toFixed(0)} KB  ${docs.length} documents`,
);
