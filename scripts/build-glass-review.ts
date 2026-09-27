/**
 * Build the glass rebuild review page: one self-contained HTML file with every
 * glass icon from assets/glass-icons/ embedded, and the builder's own maker
 * and the rebuild (src/glassRebuild.ts) bundled in, so the page draws exactly
 * what the builder would. See scripts/glass-review/main.ts.
 *
 *   pnpm glass:review    -> out/glass-review/glass-rebuild-review.html
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'assets', 'glass-icons');
const OUT = join(ROOT, 'out', 'glass-review');
mkdirSync(OUT, { recursive: true });

const files = new Set(readdirSync(DIR));
const icons = [...files]
  .filter((f) => f.endsWith(' - Dark.svg'))
  .map((f) => f.slice(0, -' - Dark.svg'.length))
  .sort()
  .map((name) => ({
    name,
    dark: readFileSync(join(DIR, `${name} - Dark.svg`), 'utf8'),
    ...(files.has(`${name} - Light.svg`) ? { light: readFileSync(join(DIR, `${name} - Light.svg`), 'utf8') } : {}),
  }));

const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: { entry: join(ROOT, 'scripts', 'glass-review', 'main.ts'), formats: ['iife'], name: 'GlassReview' },
  },
});
const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] };
const js = output.output[0].code!.replace(/<\/script>/gi, '<\\/script>');
const data = JSON.stringify(icons).replace(/</g, '\\u003c');
const page = readFileSync(join(ROOT, 'scripts', 'glass-review', 'page.html'), 'utf8')
  .replace('/*ICONS*/', () => data)
  .replace('/*SCRIPT*/', () => js);

const file = join(OUT, 'glass-rebuild-review.html');
writeFileSync(file, page);
console.log(`${icons.length} icons -> ${file} (${Math.round(page.length / 1024)} KB)`);
