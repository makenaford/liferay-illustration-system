import type { Doc, Element } from '../src/document.ts';
import { resolveLayout } from '../src/autolayout.ts';
import { LAYOUT } from '../src/tokens.ts';
import { movedDeep } from './geometry.ts';

/**
 * STARTER CARDS — cards that arrive with content in them.
 *
 * Each is an ordinary sub-card with auto-layout and ordinary children: no
 * slots, no special type. That is the point. Editing the words, swapping the
 * icon, deleting a row or adding a badge are all the same operations as
 * anywhere else in the editor, so a preset is a head start, not a template
 * the card is stuck with.
 *
 * All of them hug their content vertically, so adding or removing a row
 * resizes the card instead of leaving a gap or overflowing it, and all pad
 * at `LAYOUT.cardPadding` — the minimum the audit holds cards to.
 */

const PAD = LAYOUT.cardPadding;

const column = (gap: number) =>
  ({ direction: 'vertical', gap, padding: PAD, align: 'start', hugHeight: true }) as const;

function card(width: number, gap: number, children: Element[]): Element {
  return {
    type: 'subCard',
    x: 0,
    y: 0,
    width,
    height: 0,
    surface: 'glass2',
    radius: 8,
    layout: column(gap),
    children,
  } as Element;
}

const t = (role: string, content: string, tone?: string): Element =>
  ({ type: 'text', x: 0, y: 0, role, content, ...(tone ? { tone } : {}) }) as Element;

function listRow(width: number, label: string): Element {
  return {
    type: 'group',
    x: 0,
    y: 0,
    width,
    height: 16,
    layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'center', hugHeight: true },
    children: [
      { type: 'icon', x: 0, y: 0, size: 14, icon: 'check', tone: 'accentSoft' },
      t('caption', label),
    ],
  } as Element;
}

export const CARD_PRESETS: { label: string; title: string; make: () => Element }[] = [
  {
    label: 'Icon card',
    title: 'Glass icon, title and a line of copy',
    make: () =>
      card(180, 8, [
        { type: 'spotIcon', x: 0, y: 0, name: 'composable', size: 32 } as Element,
        t('subheading', 'Card title'),
        t('caption', 'A line of supporting copy', 'muted'),
      ]),
  },
  {
    label: 'Stat card',
    title: 'Label with change badge, figure, caption and progress bar',
    make: () => {
      const w = 200;
      const cw = w - PAD * 2;
      return card(w, 6, [
        // The label and its change badge share a line, the badge inside the
        // padding — not floated over the corner, where it gets cut off.
        {
          type: 'group',
          x: 0,
          y: 0,
          width: cw,
          height: 14,
          layout: { direction: 'horizontal', gap: 6, padding: 0, align: 'center', justify: 'between', hugHeight: true },
          children: [
            t('subheading', 'Total Connections'),
            { type: 'badge', x: 0, y: 0, label: '+14.2%', tone: 'info', dot: false } as Element,
          ],
        } as Element,
        t('display', '12,847'),
        t('caption', 'Goal: 11,500 completions', 'muted'),
        { type: 'progress', x: 0, y: 0, width: cw, value: 0.12, tone: 'info' } as Element,
      ]);
    },
  },
  {
    label: 'List card',
    title: 'Title and three rows — duplicate or delete rows freely',
    make: () =>
      card(200, 8, [
        t('bodySmall', 'Recent activity'),
        listRow(200 - PAD * 2, 'List item one'),
        listRow(200 - PAD * 2, 'List item two'),
        listRow(200 - PAD * 2, 'List item three'),
      ]),
  },
];

/**
 * A preset placed with its top-left at `at`, children moved with it, and its
 * layout resolved once so the stored height and child positions are the real
 * ones — otherwise the inspector would show the placeholder height of 0.
 */
export function placePreset(el: Element, at: { x: number; y: number }): Element {
  const moved = movedDeep(el, at.x, at.y);
  const scratch: Doc = { id: 'preset', name: '', layout: 'bare', canvas: { width: 0, height: 0 }, elements: [moved] };
  return resolveLayout(scratch).elements[0];
}
