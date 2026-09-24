/**
 * Assemble the GitHub Pages site from the build outputs.
 *
 *   /                 the contact sheet — every illustration, both themes
 *   /builder/         the editor, standalone
 *   /svg/*.svg        every illustration as a file
 *
 * The showcase is authored as an Artifact *fragment* — no doctype, head or
 * body, because the publish step supplies them. Pages supplies nothing, so it
 * is wrapped here rather than being authored twice.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'out');
const SITE = join(OUT, 'site');

mkdirSync(join(SITE, 'builder'), { recursive: true });
mkdirSync(join(SITE, 'svg'), { recursive: true });

const fragment = readFileSync(join(OUT, 'artifact', 'showcase.html'), 'utf8');
writeFileSync(
  join(SITE, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>:root{color-scheme:light dark}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${fragment}
</body>
</html>
`,
);

copyFileSync(
  join(OUT, 'standalone', 'illustration-builder.html'),
  join(SITE, 'builder', 'index.html'),
);

const svgs = readdirSync(OUT).filter((f) => f.endsWith('.svg'));
for (const f of svgs) copyFileSync(join(OUT, f), join(SITE, 'svg', f));

// Pages runs the output through Jekyll unless told not to; a leading
// underscore anywhere would be silently dropped.
writeFileSync(join(SITE, '.nojekyll'), '');

console.log(`site: index.html + builder/ + ${svgs.length} svg files -> ${SITE}`);
