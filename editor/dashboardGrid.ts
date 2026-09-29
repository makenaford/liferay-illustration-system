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
  const next = counts.map((n, r) => {
    const row = rows[r];
    const slots = (row?.children ?? []).slice(0, n);
    while (slots.length < n) slots.push(gridSlot());
    return row ? ({ ...row, children: slots } as Element) : gridRow(slots);
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
export function dashboard(kind: 'full' | 'widget', as: 'card' | 'group' = 'card'): Element {
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
