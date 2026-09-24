/**
 * One chart convention across every document.
 *
 * The nine were ported one at a time over weeks, and the charts drifted:
 * `gridLines` was 8 in `deploy-daily` and 4 everywhere else, and point markers
 * existed only on the document written after the feature was added. Neither
 * difference means anything — nobody chose them.
 *
 * The canon comes from the source artwork, not from a preference: the Figma
 * export for `deploy-daily` draws 8 dashed rules, and the current iteration of
 * the AI Visibility dashboard (node 792:15537) draws a dot at every reading.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Element } from '../src/document.ts';

const DOCS = join(import.meta.dirname, '..', 'docs');
const GRID_LINES = 8;
let changed = 0;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(DOCS, file);
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Doc;
  const notes: string[] = [];

  const visit = (el: Element, trail: string) => {
    if (el.type === 'lineChart') {
      if (el.gridLines !== GRID_LINES) {
        notes.push(`${trail} gridLines ${el.gridLines ?? 'default'} -> ${GRID_LINES}`);
        el.gridLines = GRID_LINES;
      }
      if (!el.markers) {
        notes.push(`${trail} markers -> true`);
        el.markers = true;
      }
    }
    // A progress row's default tone is `accent`; saying so makes a document
    // that means `info` visibly deliberate rather than possibly forgotten.
    if (el.type === 'progress' && !el.tone) {
      notes.push(`${trail} tone -> accent (was implicit)`);
      el.tone = 'accent';
    }
    (el as { children?: Element[] }).children?.forEach((c, i) => visit(c, `${trail}.${i}`));
  };
  doc.elements.forEach((el, i) => visit(el, String(i)));

  if (notes.length) {
    changed += notes.length;
    console.log(file);
    for (const n of notes) console.log(`  ${n}`);
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
}
console.log(`\n${changed} changes`);
