/**
 * Assemble the GitHub Pages site from the build outputs.
 *
 *   /                 the builder
 *   /svg/*.svg        every illustration as a file
 *
 * The builder is the site. The contact sheet used to be the landing page with
 * the builder a click away, which had it backwards: the thing people came for
 * was the editor. `npm run showcase` still produces the contact sheet for
 * anyone who wants it; it is simply not what this URL serves.
 */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'out');
const SITE = join(OUT, 'site');

mkdirSync(join(SITE, 'builder'), { recursive: true });
mkdirSync(join(SITE, 'svg'), { recursive: true });

copyFileSync(
  join(OUT, 'standalone', 'illustration-builder.html'),
  join(SITE, 'index.html'),
);

// The old /builder/ URL keeps working — people have it in tabs and messages.
copyFileSync(
  join(OUT, 'standalone', 'illustration-builder.html'),
  join(SITE, 'builder', 'index.html'),
);

const svgs = readdirSync(OUT).filter((f) => f.endsWith('.svg'));
for (const f of svgs) copyFileSync(join(OUT, f), join(SITE, 'svg', f));

// Pages runs the output through Jekyll unless told not to; a leading
// underscore anywhere would be silently dropped.
writeFileSync(join(SITE, '.nojekyll'), '');

console.log(`site: the builder at / (and /builder/) + ${svgs.length} svg files -> ${SITE}`);
