/**
 * A PAGE-SCALE variant of an illustration.
 *
 * `Section 1` of the source file holds the same illustrations at 1440x960,
 * each with one or two SPOTLIGHT CALLOUTS overlaid — a glass card carrying a
 * glass icon and a single figure, placed half over the composition's edge so
 * it reads as annotation rather than as another panel.
 *
 * The composition underneath is the illustration this system already renders,
 * so the page variant is not a re-author: it reuses the document and lets
 * `artboard` scale it into the larger canvas. The callouts are authored in
 * artboard coordinates and scale with it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Element } from '../src/document.ts';

const ROOT = join(import.meta.dirname, '..');
const base = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'partner-dashboard.json'), 'utf8'),
) as Doc;

/** One spotlight callout, in artboard coordinates. */
function spotlight(
  x: number,
  y: number,
  width: number,
  title: string,
  icon: string,
  value: string,
): Element {
  return {
    type: 'subCard',
    x,
    y,
    width,
    height: 62,
    surface: 'highlighted',
    radius: 8,
    layout: { direction: 'vertical', gap: 6, padding: [10, 12], align: 'start' },
    children: [
      { type: 'text', x: x + 12, y: y + 20, role: 'bodySmall', content: title },
      {
        type: 'group',
        x: x + 12,
        y: y + 34,
        width: width - 24,
        height: 26,
        layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'center' },
        children: [
          { type: 'spotIcon', x: x + 12, y: y + 34, name: icon, size: 26 },
          { type: 'text', x: x + 46, y: y + 52, role: 'title', content: value, weight: 'bold' },
        ],
      },
    ],
  } as Element;
}

const doc: Doc = {
  ...structuredClone(base),
  id: 'partner-dashboard-page',
  name: 'Partner Performance Dashboard — page',
  // The composition is authored at 560x372 and scaled into the page canvas,
  // which is what the source does: the same illustration, larger, annotated.
  canvas: { width: 1440, height: 960 },
  artboard: { width: 560, height: 372 },
  elements: [
    ...structuredClone(base.elements),
    spotlight(6, 58, 104, 'Services Opportunity', 'analytics', '5X'),
    spotlight(436, 204, 114, 'Deal Pipelines', 'dashboard', ''),
  ],
};

writeFileSync(
  join(ROOT, 'docs', 'partner-dashboard-page.json'),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log(`wrote docs/partner-dashboard-page.json — ${doc.elements.length} elements`);
