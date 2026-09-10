/**
 * Bake auto-layout back to absolute positions and dissolve `group` wrappers.
 *
 *   node --experimental-strip-types scripts/flatten.ts --write
 *
 * The inverse of `nest`, and the document-scale version of the editor's
 * `detach`. Useful on its own — a designer may want to break out of a flow —
 * and essential while developing the converter, since it makes the conversion
 * round-trippable instead of one-way.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLayout } from '../src/autolayout.ts';
import type { Doc, Element } from '../src/document.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const WRITE = process.argv.includes('--write');

let dissolved = 0;
let detached = 0;

/** Lift a group's children into its parent, and drop `layout` specs. */
function flatten(el: Element): Element[] {
  const kids = (el as { children?: Element[] }).children ?? [];
  const flatKids = kids.flatMap(flatten);

  if (el.type === 'group') {
    dissolved++;
    return flatKids;
  }

  const out = { ...el } as Record<string, unknown>;
  if (out.layout) {
    detached++;
    delete out.layout;
  }
  delete out.alignSelf;
  delete out.grow;
  if (kids.length) out.children = flatKids;
  return [out as unknown as Element];
}

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json'))) {
  const doc: Doc = JSON.parse(readFileSync(join(DOCS, file), 'utf8'));
  // Resolve first, so the baked coordinates are the ones being rendered.
  const resolved = resolveLayout(doc);
  const next: Doc = { ...resolved, elements: resolved.elements.flatMap(flatten) };
  if (WRITE) writeFileSync(join(DOCS, file), `${JSON.stringify(next, null, 2)}\n`);
}

console.log(`${detached} layout specs baked, ${dissolved} groups dissolved.`);
console.log(WRITE ? 'written.' : 'dry run — pass --write to apply.');
