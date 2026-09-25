/**
 * Bundle the Marketing Assets site into ONE self-contained HTML fragment for
 * publishing as a claude.ai Artifact — the same constraints and shape as
 * bundle-artifact.ts, which does this for the builder.
 *
 *   npm run assets:bundle
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'out', 'assets-site-build');
const OUT = join(ROOT, 'out', 'artifact');
mkdirSync(OUT, { recursive: true });

const assets = readdirSync(join(DIST, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No JS bundle in out/assets-site-build/assets — run the vite build first.');

const js = readFileSync(join(DIST, 'assets', jsFile), 'utf8').replace(/<\/script>/gi, '<\\/script>');
const css = cssFile ? readFileSync(join(DIST, 'assets', cssFile), 'utf8') : '';

const html = `<title>Liferay Marketing Assets</title>
<meta name="description" content="The team's finished illustrations and icon sets: browse, preview in dark and light, and download SVG or PNG." />

<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400&family=Source+Sans+3:wght@400;600;700&display=swap"
  rel="stylesheet"
/>

<style>
${css}
</style>

<div id="root"></div>

<script type="module">
${js}
</script>
`;

const path = join(OUT, 'marketing-assets.html');
writeFileSync(path, html);
console.log(`wrote ${path}  ${(html.length / 1024).toFixed(1)} KB`);
