import type { Element } from '../src/document.ts';

/**
 * DASHBOARD GRID — a card of slots that always fill it.
 *
 * A dashboard is an ordinary card with auto-layout: a column of rows, each a
 * row of slots. Every row grows to share the card's height and every slot to
 * share its row's width, and slots stretch to their row's height — so
 * whatever the card's size, the slots divide it exactly, and what is in a
 * slot (a chart set to grow, a stat) fills the slot. `grid` records how
 * many slots each row has; `setGrid` reshapes the card to a new count,
 * keeping what the slots that stay hold. Other children — a header over
 * the grid — are left where they are.
 */

/** At most this many rows, and this many slots in a row. */
export const GRID_MAX = 4;

type Container = Extract<Element, { type: 'card' | 'subCard' | 'group' }>;

const t = (content: string, role: string, extra: Record<string, unknown> = {}): Element =>
  ({ type: 'text', x: 0, y: 0, role, content, ...extra }) as Element;

/** A slot: a glass tile that grows to its share of its row, its content stretched across it. */
export function gridSlot(children: Element[] = [t('Title', 'bodySmall', { weight: 'semibold' })]): Element {
  return {
    type: 'subCard',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    grow: 1,
    surface: 'glass-default',
    radius: 8,
    layout: { direction: 'vertical', gap: 4, padding: 10, align: 'stretch' },
    children,
  } as Element;
}

/** A row of slots, growing to its share of the dashboard's height. */
export function gridRow(slots: Element[]): Element {
  return {
    type: 'group',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    grow: 1,
    gridRow: true,
    layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'stretch' },
    children: slots,
  } as Element;
}

const isRow = (e: Element) => e.type === 'group' && !!(e as { gridRow?: boolean }).gridRow;

/** The slots per row a dashboard has now, read from its rows. */
export const gridOf = (el: Container): number[] =>
  (el.children ?? []).filter(isRow).map((r) => (r as Container).children?.length ?? 0);

/**
 * `el` reshaped to `grid` — so many rows, so many slots in each, each count
 * held to 1…GRID_MAX. Rows and slots that stay keep what they hold; new ones
 * arrive empty but for a title; what goes is removed.
 */
export function setGrid<T extends Container>(el: T, grid: number[]): T {
  const counts = grid.slice(0, GRID_MAX).map((n) => Math.min(Math.max(Math.round(n), 1), GRID_MAX));
  if (!counts.length) counts.push(1);
  const kids = el.children ?? [];
  const rows = kids.filter(isRow) as Container[];
  const others = kids.filter((k) => !isRow(k));
  const next = counts.map((n, r) => {
    const row = rows[r];
    const slots = (row?.children ?? []).slice(0, n);
    while (slots.length < n) slots.push(gridSlot());
    return row ? ({ ...row, children: slots } as Element) : gridRow(slots);
  });
  return { ...el, grid: counts, children: [...others, ...next] };
}

/* ---- slot content: made to stretch, so it fills whatever slot it is in ---- */

const spread = (children: Element[]): Element =>
  ({
    type: 'group',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    layout: { direction: 'horizontal', gap: 6, padding: 0, align: 'center', justify: 'between', hugHeight: true },
    children,
  }) as Element;

/** A figure with its label, change and note. */
export const statSlot = (label: string, change: string, value: string, note: string) =>
  gridSlot([
    spread([t(label, 'label', { weight: 'semibold' }), { type: 'badge', x: 0, y: 0, label: change, tone: 'info', dot: false } as Element]),
    t(value, 'heading', { weight: 'bold' }),
    t(note, 'micro', { tone: 'muted' }),
  ]);

/** A titled chart that grows to fill the rest of its slot. */
export const chartSlot = (title: string, chart: Element) =>
  gridSlot([t(title, 'bodySmall', { weight: 'semibold' }), { ...chart, grow: 1 } as Element]);

/** A titled breakdown: one progress row per item. */
export const listSlot = (title: string, items: [string, number][]) =>
  gridSlot([
    t(title, 'bodySmall', { weight: 'semibold' }),
    ...items.map(([label, value]) => ({ type: 'progress', x: 0, y: 0, width: 10, value, label, tone: 'accent' }) as Element),
  ]);

const trafficChart = (): Element =>
  ({
    type: 'lineChart', x: 0, y: 0, width: 10, height: 40, gridLines: 4, domain: [0, 1], markers: true,
    series: [
      { role: 'secondary', data: [0.2, 0.3, 0.28, 0.45, 0.52, 0.6, 0.82] },
      { role: 'primary', data: [0.1, 0.18, 0.24, 0.3, 0.34, 0.46, 0.5] },
    ],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    labelGap: 2,
  }) as Element;

/**
 * A dashboard, full page or widget. Full page is the whole panel of a
 * dashboard illustration: a header over three stat tiles and a chart beside
 * a breakdown. Widget is the small one set over a photo — glass that frosts
 * what is under it — two figures over a chart.
 */
export function dashboard(kind: 'full' | 'widget', as: 'card' | 'group' = 'card'): Element {
  const full = kind === 'full';
  const header = spread([
    t(full ? 'Performance overview' : 'This week', full ? 'subheading' : 'bodySmall', { weight: 'semibold' }),
    { type: 'badge', x: 0, y: 0, label: 'Live', tone: 'success' } as Element,
  ]);
  const rows = full
    ? [
        gridRow([
          statSlot('Visitors', '+12.4%', '48,210', 'Last 30 days'),
          statSlot('Conversions', '+6.1%', '3,982', 'vs. 3,750 target'),
          statSlot('Revenue', '+9.8%', '$1.2M', 'This quarter'),
        ]),
        gridRow([
          chartSlot('Traffic growth', trafficChart()),
          listSlot('By channel', [['Organic', 0.68], ['Paid', 0.42], ['Email', 0.31], ['Social', 0.18]]),
        ]),
      ]
    : [
        gridRow([statSlot('Sessions', '+8%', '18.4K', 'Today'), statSlot('Uptime', '+0.2%', '99.9%', 'Last 30 days')]),
        gridRow([chartSlot('Traffic', trafficChart())]),
      ];
  // In a full page the rows share its height 2:3 — the stats a strip, the charts the room.
  if (full) {
    (rows[0] as { grow: number }).grow = 2;
    (rows[1] as { grow: number }).grow = 3;
  }
  const base = {
    x: 0,
    y: 0,
    width: full ? 480 : 240,
    height: full ? 312 : 176,
    layout: { direction: 'vertical', gap: 8, padding: full ? 12 : 10, align: 'stretch' },
    children: [header, ...rows],
  };
  const el =
    as === 'group'
      ? ({ type: 'group', ...base } as Element)
      : full
        ? ({ type: 'subCard', ...base, surface: 'glass-default', radius: 10 } as Element)
        : ({ type: 'card', ...base, surface: 'glass-highlighted', sheen: 'radial', radius: 10, frost: 'content' } as Element);
  return { ...el, grid: gridOf(el as Container) } as Element;
}
