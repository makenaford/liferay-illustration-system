/**
 * Bundle the editor into ONE double-clickable HTML file.
 *
 * This is the artifact bundle's sibling, and the two differ in ways that
 * matter more than they look:
 *
 *   - It is a COMPLETE document. The artifact publish step supplies the
 *     doctype, head and body; nothing supplies them here.
 *   - The script is a CLASSIC script, not a module. Module scripts are subject
 *     to CORS, and a `file://` page has an opaque origin, so a `type="module"`
 *     bundle opened by double-click fails silently in Chrome and Edge. This is
 *     the single reason the artifact bundle cannot just be renamed.
 *   - The font is inlined as a stylesheet link with a real fallback stack, so
 *     the page still sets type when it is opened with no network.
 *
 * Everything else — React, the documents, the renderer — is already inlined by
 * Vite. The output depends on nothing: no server, no build step, no account.
 *
 *   npm run standalone
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'out', 'editor');
const OUT = join(ROOT, 'out', 'standalone');
mkdirSync(OUT, { recursive: true });

const assets = readdirSync(join(DIST, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No JS bundle in out/editor/assets — run vite build first.');

const js = readFileSync(join(DIST, 'assets', jsFile), 'utf8');
const css = cssFile ? readFileSync(join(DIST, 'assets', cssFile), 'utf8') : '';

/** `</script>` can appear inside a string literal and would close the tag. */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Liferay Illustration Builder</title>
<meta name="description" content="Compose Liferay marketing illustrations from a token-driven component library. Every element themes for dark and light from one document." />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${safeJs}
</script>
</body>
</html>
`;

const path = join(OUT, 'illustration-builder.html');
writeFileSync(path, html);
console.log(
  `wrote ${path}  ${(html.length / 1024).toFixed(1)} KB — open it directly, or host it anywhere static`,
);
