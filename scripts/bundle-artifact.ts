/**
 * Bundle the editor into ONE self-contained HTML fragment for publishing as a
 * claude.ai Artifact.
 *
 * Constraints that shape this:
 *   - Artifacts allow external *scripts* only from a small CDN allowlist, and
 *     no external stylesheets except Google Fonts. So React and every module
 *     must be inlined — which Vite already does; this just folds the emitted
 *     asset files back into the HTML.
 *   - The publish step wraps the file in `<!doctype html><head></head><body>`,
 *     so we emit page content only: no doctype, html, head or body tags.
 *
 *   node --experimental-strip-types scripts/bundle-artifact.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'out', 'editor');
const OUT = join(ROOT, 'out', 'artifact');
mkdirSync(OUT, { recursive: true });

const assets = readdirSync(join(DIST, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No JS bundle in out/editor/assets — run vite build first.');

const js = readFileSync(join(DIST, 'assets', jsFile), 'utf8');
const css = cssFile ? readFileSync(join(DIST, 'assets', cssFile), 'utf8') : '';

/**
 * A bundle can legitimately contain the characters `</script>` inside a string
 * literal, which would close the tag early. Escaping the slash is safe in JS
 * and invisible to the parser.
 */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const html = `<title>Illustration Builder</title>
<meta name="description" content="Compose Liferay marketing illustrations from a token-driven component library. Every element themes for dark and light from one document." />

<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap"
  rel="stylesheet"
/>

<style>
${css}
</style>

<div id="root"></div>

<script type="module">
${safeJs}
</script>
`;

const path = join(OUT, 'illustration-builder.html');
writeFileSync(path, html);

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
console.log(`wrote ${path}`);
console.log(`  js   ${kb(js.length)}`);
console.log(`  css  ${kb(css.length)}`);
console.log(`  page ${kb(html.length)}`);
