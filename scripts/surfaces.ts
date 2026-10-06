/**
 * Render a specimen sheet of the surface set, both themes.
 *
 *   node --experimental-strip-types scripts/surfaces.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDocument } from '../src/render.ts';
import { dark } from '../src/tokens.ts';
import type { Doc, Element } from '../src/document.ts';
import type { SurfaceName } from '../src/tokens.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAMES = Object.keys(dark.surfaces) as SurfaceName[];

const COLS = 4;
const CW = 150;
const CH = 96;
const GAP = 20;
const PAD = 28;
const rows = Math.ceil(NAMES.length / COLS);

const DESCRIPTION: Record<SurfaceName, string> = {
  'glass-background': 'Background — the pane a composition sits on',
  'glass-default': 'Flat — the everyday card',
  'glass-blue': 'Blue tinted — washed in brand blue',
  sunken: 'Sunken — inputs, rows, wells',
  'glass-highlighted': 'Highlighted — the one that matters, raised',
  'glass-highlighted-over-dark': 'Highlighted over dark — as Figma 985:15154, always',
  'glass-highlighted-over-light': 'Highlighted over light — as Figma 985:14729, always',
  gradient: 'buttons only: Figma Blue Gradient',
  solid: 'buttons only: opaque action',
  outline: 'buttons only: structure, no weight',
};

const elements: Element[] = NAMES.flatMap((name, i) => {
  const x = PAD + (i % COLS) * (CW + GAP);
  const y = PAD + Math.floor(i / COLS) * (CH + GAP + 22);
  return [
    {
      type: 'subCard',
      x, y, width: CW, height: CH,
      surface: name,
      radius: 8,
      children: [
        { type: 'text', x: x + 14, y: y + 30, role: 'heading',
          content: name, tone: name === 'solid' || name === 'gradient' ? 'onAccent' : undefined },
        { type: 'text', x: x + 14, y: y + 46, role: 'caption',
          content: DESCRIPTION[name], tone: name === 'solid' || name === 'gradient' ? 'onAccent' : 'muted' },
        { type: 'progress', x: x + 14, y: y + 66, width: CW - 28, value: 0.55 },
      ],
    } as Element,
  ];
});


const doc: Doc = {
  id: 'surface-specimens',
  name: 'Surface set',
  layout: 'bare',
  canvas: {
    width: PAD * 2 + COLS * CW + (COLS - 1) * GAP,
    height: PAD * 2 + rows * (CH + 22) + (rows - 1) * GAP,
  },
  glow: [
    { cx: 0.1 * 700, cy: 40, rx: 240, ry: 200, blur: 100 },
    { cx: 640, cy: 300, rx: 240, ry: 200, blur: 100 },
  ],
  elements,
};

for (const theme of ['dark', 'light'] as const) {
  writeFileSync(join(ROOT, 'out', `surfaces.${theme}.svg`), renderDocument(doc, theme));
}
console.log(`wrote out/surfaces.{dark,light}.svg — ${NAMES.length} surfaces`);
