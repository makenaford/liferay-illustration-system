import type { Doc, Element } from '../src/document.ts';
import { resolveLayout } from '../src/autolayout.ts';
import { LAYOUT } from '../src/tokens.ts';
import { movedDeep } from './geometry.ts';
import { dashboard, windowCard } from './dashboardGrid.ts';

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
    surface: 'glass-default',
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
      { type: 'icon', x: 0, y: 0, size: 14, icon: 'mc:check_circle', tone: 'accentSoft' },
      t('caption', label),
    ],
  } as Element;
}

/**
 * A phone screen, as the Financial Services illustration draws it: 162 wide,
 * 16 in from each edge, 12 between rows, 16 corners, as tall as what it
 * holds. The width is the standard one, and also its `maxWidth`: its layout
 * stretches what it holds across it, so fields and buttons meet the padding
 * on both sides, and longer copy — a translation — wraps inside it instead
 * of widening it.
 */
export const PHONE = { width: 162, padding: 16, gap: 12, radius: 16 } as const;

const PHONE_INNER = PHONE.width - PHONE.padding * 2;

function phone(children: Element[]): Element {
  return {
    type: 'subCard',
    x: 0,
    y: 0,
    width: PHONE.width,
    maxWidth: PHONE.width,
    height: 0,
    surface: 'glass-default',
    radius: PHONE.radius,
    layout: { direction: 'vertical', gap: PHONE.gap, padding: PHONE.padding, align: 'stretch', hugHeight: true },
    children,
  } as Element;
}

const field = (placeholder: string, icon: string): Element =>
  ({ type: 'input', x: 0, y: 0, width: PHONE_INNER, height: 30, placeholder, icon, role: 'caption' }) as Element;

const phoneButton = (label: string, variant: 'solid' | 'outline'): Element =>
  ({ type: 'button', x: 0, y: 0, width: PHONE_INNER, height: 32, label, variant, role: 'bodySmall' }) as Element;

/**
 * An AI assistant's conversation, after "AI Assistant" in the Japan site's
 * hero images (Figma 250:47376), drawn in this system's own parts: the
 * person's messages as sender bubbles, the assistant's as receiver bubbles,
 * each indented from the far side so the talk staggers, and its two actions
 * at the foot. The bubbles stretch across the card; their indent keeps the
 * stagger whatever its width.
 */
const CHAT = { width: 320, indent: 32 } as const;

function chatCard(): Element {
  const inner = CHAT.width - PAD * 2;
  const bubble = (variant: 'sender' | 'receiver', name: string, message: string, initials: string): Element =>
    ({ type: 'chat', x: 0, y: 0, width: inner, variant, name, message, initials, indent: CHAT.indent, role: 'body' }) as Element;
  const action = (label: string, variant: 'solid' | 'outline', icon: string): Element =>
    ({ type: 'button', x: 0, y: 0, width: 0, height: 28, label, variant, icon, role: 'bodySmall', fit: true, rounded: true }) as Element;
  return {
    ...card(CHAT.width, 10, [
      t('heading', 'AI Assistant'),
      bubble('sender', 'Yuzuki Kimoto', 'Create a case study', 'YK'),
      bubble('receiver', 'AI Assistant', 'What is it about?', 'AI'),
      bubble('sender', 'Yuzuki Kimoto', 'About Acme Corporation', 'YK'),
      bubble('receiver', 'AI Assistant', 'Your content is ready!', 'AI'),
      {
        type: 'group',
        x: 0,
        y: 0,
        width: inner,
        height: 28,
        layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'center', justify: 'end', hugHeight: true },
        children: [action('Regenerate', 'outline', 'mc:back_2'), action('Save content', 'solid', 'mc:arrow_right')],
      } as Element,
    ]),
    radius: 16,
    layout: { ...column(10), align: 'stretch' },
  } as Element;
}

export const CARD_PRESETS: { label: string; title: string; make: () => Element }[] = [
  {
    label: 'Dashboard · full page',
    title: 'A 480 × 312 dashboard: header, then rows of slots that fill it — set rows and slots under Grid',
    make: () => dashboard('full'),
  },
  {
    label: 'Window',
    title: 'A 300 × 200 window: the three dots over slots that fill it — set rows and slots under Grid',
    make: () => windowCard(),
  },
  {
    label: 'Dashboard · widget',
    title: 'A 240 × 176 glass widget to set over a photo, its slots filling it — set rows and slots under Grid',
    make: () => dashboard('widget'),
  },
  {
    label: 'Dashboard · condensed',
    title: 'A 400 × 300 dashboard to lay over an image — metric tiles, a breakdown and three charts at the smallest type steps; reshape under Grid',
    make: () => dashboard('condensed'),
  },
  {
    label: 'Phone',
    title: `A ${PHONE.width}-wide phone screen: fields and buttons run edge to edge, longer copy wraps`,
    make: () =>
      phone([
        { type: 'spotIcon', x: 0, y: 0, name: 'compliance', size: 48, alignSelf: 'center' } as Element,
        { type: 'text', x: 0, y: 0, role: 'heading', weight: 'semibold', content: 'Enterprise SSO Login', alignSelf: 'center' } as Element,
        field('Email', 'mc:mail'),
        field('Password', 'mc:lock'),
        phoneButton('Sign in with Okta', 'solid'),
        phoneButton('MFA Required', 'outline'),
      ]),
  },
  {
    label: 'Icon card',
    title: 'A 64px glass icon over its title',
    make: () =>
      ({
        ...card(180, 12, [
          { type: 'spotIcon', x: 0, y: 0, name: 'composable', size: 64 } as Element,
          t('subheading', 'Card title'),
        ]),
        surface: 'glass-highlighted-over-light',
      }) as Element,
  },
  {
    label: 'Chat card',
    title: 'An AI assistant conversation: staggered sender and receiver bubbles, with Regenerate and Save content',
    make: chatCard,
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
  // Resolved at regular density and stored that way, its density put back,
  // so a condensed dashboard is condensed as it is drawn — not baked in.
  const { density, ...regular } = moved as Element & { density?: string };
  const scratch: Doc = { id: 'preset', name: '', layout: 'bare', canvas: { width: 0, height: 0 }, elements: [regular as Element] };
  const placed = resolveLayout(scratch).elements[0];
  return density ? ({ ...placed, density } as Element) : placed;
}
