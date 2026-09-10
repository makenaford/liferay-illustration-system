/**
 * Snap fractional authored sizes onto the 2px grid.
 *
 * These are leftovers from the guillotine conversion: a group that wrapped a
 * measured 46.597px of content kept the measurement as its width. The value
 * is load-bearing (a container with an explicit size does not hug), so it
 * cannot just be deleted — but it should be a number a designer could have
 * typed. Containers round UP so nothing inside them clips; leaves round to
 * the nearest step.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Element } from '../src/document.ts';
import { LAYOUT } from '../src/tokens.ts';

const DOCS = join(import.meta.dirname, '..', 'docs');
const G = LAYOUT.grid;
const CONTAINER = new Set(['card', 'subCard', 'group']);
let total = 0;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(DOCS, file);
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Doc;
  const notes: string[] = [];

  const visit = (el: Element, trail: string) => {
    const any = el as unknown as Record<string, unknown>;
    const up = CONTAINER.has(el.type);
    for (const k of ['width', 'height'] as const) {
      const v = any[k];
      if (typeof v !== 'number' || Math.abs(v % G) < 1e-6) continue;
      const next = up ? Math.ceil(v / G) * G : Math.round(v / G) * G;
      notes.push(`${trail} ${el.type}.${k} ${Math.round(v * 100) / 100} -> ${next}`);
      any[k] = next;
    }
    (any.children as Element[] | undefined)?.forEach((c, i) => visit(c, `${trail}.${i}`));
  };
  doc.elements.forEach((el, i) => visit(el, String(i)));

  if (notes.length) {
    total += notes.length;
    console.log(`${file}`);
    for (const n of notes) console.log(`  ${n}`);
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
}
console.log(`\n${total} sizes snapped`);
