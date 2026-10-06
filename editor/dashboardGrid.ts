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

/**
 * A slot: a glass tile that grows to its share of its row, its content
 * stretched across it. Empty by default — the builder shows it as a drop
 * zone, so a component goes in by dragging it there from the Library.
 */
export function gridSlot(children: Element[] = []): Element {
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
 * arrive empty, as drop zones; what goes is removed.
 */
export function setGrid<T extends Container>(el: T, grid: number[]): T {
  const counts = grid.slice(0, GRID_MAX).map((n) => Math.min(Math.max(Math.round(n), 1), GRID_MAX));
  if (!counts.length) counts.push(1);
  const kids = el.children ?? [];
  const rows = kids.filter(isRow) as Container[];
  const others = kids.filter((k) => !isRow(k));
  // New rows and slots take the shape of those already there — a condensed
  // dashboard's padding, gaps and corners — rather than the default one's.
  const rowLike = rows[0];
  const slotLike = rows.flatMap((r) => r.children ?? [])[0] as Container | undefined;
  const emptySlot = (): Element => (slotLike ? ({ ...slotLike, children: [] } as Element) : gridSlot());
  const next = counts.map((n, r) => {
    const row = rows[r];
    const slots = (row?.children ?? []).slice(0, n);
    while (slots.length < n) slots.push(emptySlot());
    if (row) return { ...row, children: slots } as Element;
    return rowLike ? ({ ...rowLike, children: slots } as Element) : gridRow(slots);
  });
  return { ...el, grid: counts, children: [...others, ...next] };
}

/**
 * A dashboard, full page or widget: a title over three rows of two empty
 * slots — drop zones in the builder, each filled by dragging a component in
 * from the Library, and reshaped under Grid (up to four rows of four). Full
 * page is the whole panel of a dashboard illustration; widget is the small
 * glass one set over a photo, frosting what is under it.
 */
export function dashboard(kind: 'full' | 'widget' | 'condensed', as: 'card' | 'group' = 'card'): Element {
  if (kind === 'condensed') return condensedDashboard();
  const full = kind === 'full';
  const title = t(full ? 'Performance overview' : 'This week', full ? 'subheading' : 'bodySmall', { weight: 'semibold' });
  const rows = [0, 1, 2].map(() => gridRow([gridSlot(), gridSlot()]));
  const base = {
    x: 0,
    y: 0,
    width: full ? 480 : 240,
    height: full ? 312 : 176,
    layout: { direction: 'vertical', gap: 8, padding: full ? 12 : 10, align: 'stretch' },
    children: [title, ...rows],
  };
  const el =
    as === 'group'
      ? ({ type: 'group', ...base } as Element)
      : full
        ? ({ type: 'subCard', ...base, surface: 'glass-default', radius: 10 } as Element)
        : ({ type: 'card', ...base, surface: 'glass-highlighted', sheen: 'radial', radius: 10, frost: 'content' } as Element);
  return { ...el, grid: gridOf(el as Container) } as Element;
}

/**
 * A window: a card with the three dots across its top and a grid of slots
 * under them that fills the rest — a product screen, sketched. `grid` sets
 * the slots, as a dashboard's (up to four rows of up to four); the title bar
 * is not a row, so reshaping the grid leaves it as it is.
 */
export function windowCard(grid: number[] = [1, 2]): Element {
  const bar = {
    type: 'group',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'center', hugHeight: true },
    children: [{ type: 'chrome', x: 0, y: 0, radius: 4, gap: 12 } as Element],
  } as Element;
  const card = {
    type: 'subCard',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    surface: 'glass-default',
    radius: 10,
    layout: { direction: 'vertical', gap: 8, padding: 12, align: 'stretch' },
    children: [bar],
  } as Element;
  return setGrid(card as Container, grid);
}

/**
 * CONDENSED — a dashboard small enough to lay over a photo, as the Japan site
 * hero images draw it (Figma yC6i3M1Iq1zPKxrZPB0vuO, 29:17498): four metric
 * tiles, then a breakdown beside a trend, then an area chart beside bars.
 *
 * An ordinary dashboard — the same rows and slots, its content at regular
 * sizes — set to `density: 'condensed'`, which draws it at the type scale's
 * floor with 60% spacing (src/density.ts). Switched to Regular under
 * Density, it is the same dashboard at full size. It arrives filled, every
 * slot an ordinary element to edit, and Grid reshapes it like any other.
 */
const CONDENSED = { width: 400, height: 300 } as const;

/** A metric tile: label and change tag on one line, the figure, a caption, a bar. */
function metric(label: string, value: string, caption: string, progress: number, change?: string): Element[] {
  const head: Element = {
    type: 'group',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    layout: { direction: 'horizontal', gap: 4, padding: 0, align: 'center', justify: 'between', hugHeight: true },
    children: [
      t(label, 'caption', { weight: 'bold' }),
      ...(change ? [{ type: 'badge', x: 0, y: 0, label: change, tone: 'info', dot: false } as Element] : []),
    ],
  } as Element;
  return [
    head,
    t(value, 'display', { weight: 'semibold' }),
    t(caption, 'caption', { tone: 'muted' }),
    { type: 'progress', x: 0, y: 0, width: 10, height: 3, value: progress, tone: 'info' } as Element,
  ];
}

const cardTitle = (s: string) => t(s, 'subheading', { weight: 'semibold' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

function condensedDashboard(): Element {
  const tiles = [
    metric('Total patients', '10,250', 'Patients admitted', 0.12, '+14.2%'),
    metric('New patients', '2,500', 'This month', 0.82),
    metric('Number of beds', '800', 'Available now', 0.1, '+15%'),
    metric('Operational cost', '$15,250', 'Avg cost per patient', 0.12, '+8.7%'),
  ];
  const breakdown = [
    cardTitle('Incident location'),
    ...[['Office', 0.7], ['Warehouse', 0.51], ['Vacations/PTO', 0.06], ['Offsite', 0.36]].map(
      ([label, value]) => ({ type: 'progress', x: 0, y: 0, width: 10, height: 5, value, label }) as Element,
    ),
  ];
  const trend = [
    cardTitle('Incidents by month'),
    {
      type: 'lineChart', x: 0, y: 0, width: 10, height: 40, grow: 1, gridLines: 4, domain: [0, 1], curve: 'straight',
      series: [{ role: 'success', data: [0.12, 0.3, 0.3, 0.55, 0.68, 0.95] }],
      labels: MONTHS,
    } as Element,
  ];
  const progress = [
    cardTitle('Health progress'),
    {
      type: 'lineChart', x: 0, y: 0, width: 10, height: 30, grow: 1, gridLines: 0, domain: [0, 1], markers: true,
      series: [
        { role: 'secondary', data: [0.15, 0.35, 0.28, 0.6, 0.45, 0.8], area: true },
        { role: 'primary', data: [0.05, 0.25, 0.4, 0.5, 0.7, 0.9] },
      ],
    } as Element,
  ];
  const recovery = [
    cardTitle('Recovery time'),
    {
      type: 'barChart', x: 0, y: 0, width: 10, height: 30, grow: 1, gridLines: 4,
      data: [70, 38, 48, 20, 32, 60], line: [20, 35, 30, 48, 55, 82], max: 100,
    } as Element,
  ];
  const card = {
    type: 'card',
    x: 0,
    y: 0,
    width: CONDENSED.width,
    height: CONDENSED.height,
    density: 'condensed',
    surface: 'glass-highlighted',
    sheen: 'radial',
    radius: 10,
    frost: 'content',
    layout: { direction: 'vertical', gap: 8, padding: 10, align: 'stretch' },
    children: [
      gridRow(tiles.map((c) => gridSlot(c))),
      gridRow([gridSlot(breakdown), gridSlot(trend)]),
      gridRow([gridSlot(progress), gridSlot(recovery)]),
    ],
  } as Element;
  return { ...card, grid: gridOf(card as Container) } as Element;
}
