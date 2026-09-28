import { h, type Ctx, type VNode } from '../vsvg.ts';
import { measureText, VERTICAL } from '../fontMetrics.generated.ts';
import { Text, measureTextEl, typeStyle, type TypeRole, type TypeWeight } from './text.ts';
import { chartColor } from '../colors.ts';

export interface TableColumn {
  label: string;
  /** Defaults: the first column `start`, the rest `end` — names, then values. */
  align?: 'start' | 'end';
  /** `bar` draws each cell's number as a bar, as long as its share of the column's largest. */
  kind?: 'text' | 'bar';
  /** A bar column's colour, from the set. Omitted: Primary. */
  color?: string;
  /**
   * Fixed width in px. Omitted, text columns fit their content and the rest
   * is shared by the bar columns — or, with none, given to the first column.
   */
  width?: number;
}

export interface TableProps {
  x: number;
  y: number;
  width: number;
  columns: TableColumn[];
  rows: string[][];
  /** The contract-price style: micro type, all muted, no dividers. */
  compact?: boolean;
  /** Show the header row. Defaults on. */
  header?: boolean;
  /** Rules under the header and between rows. Defaults on, off when compact. */
  dividers?: boolean;
  /** Height of each row band. Defaults 20, or 14 compact. */
  rowHeight?: number;
}

/** Space between columns. */
const GAP = 8;

/**
 * The type each part of the table is set in — from the two tables the set
 * already draws by hand. "Top opportunities" (the partner dashboards): a
 * muted header over its rows, the value column semibold, a rule under every
 * row but the last, rows 20px apart — all in `bodySmall`. The contract
 * prices (B2B commerce): everything `micro`, muted and semibold, no rules,
 * rows tight.
 */
function styles(compact: boolean) {
  return compact
    ? {
        head: { role: 'micro' as TypeRole, weight: 'semibold' as TypeWeight, tone: 'muted' as const },
        body: { role: 'micro' as TypeRole, weight: 'semibold' as TypeWeight, tone: 'muted' as const },
        value: { role: 'micro' as TypeRole, weight: 'semibold' as TypeWeight, tone: 'muted' as const },
        rowHeight: 14,
      }
    : {
        head: { role: 'bodySmall' as TypeRole, weight: 'semibold' as TypeWeight, tone: 'muted' as const },
        body: { role: 'bodySmall' as TypeRole, weight: 'regular' as TypeWeight, tone: 'primary' as const },
        value: { role: 'bodySmall' as TypeRole, weight: 'semibold' as TypeWeight, tone: 'primary' as const },
        rowHeight: 20,
      };
}

/** A bar cell's number: `1,250`, `$12.08`, `60%` and `0.6` all read as their number. */
export function barValue(cell: string | undefined): number {
  const n = parseFloat((cell ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Bar thickness, and the gap either side of it being the row's. */
const BAR = 6;

/**
 * Where everything goes. Rows are bands `rowHeight` tall with the text centred
 * in each, the header band first; a divider sits on the line between two
 * bands. That puts a 20px row's baseline 12px under the rule above it and 8px
 * over the rule below — the hand-drawn table's own spacing.
 */
export function tableLayout(p: TableProps) {
  const s = styles(!!p.compact);
  const header = p.header !== false;
  const dividers = p.dividers ?? !p.compact;
  const rowHeight = p.rowHeight ?? s.rowHeight;
  const cols = p.columns.length ? p.columns : [{ label: '' }];
  const last = cols.length - 1;

  const hasBars = cols.some((c) => c.kind === 'bar');
  const styleOf = (c: number) => (c > 0 && c === last ? s.value : s.body);
  const fits = (c: number) => {
    const col = cols[c];
    if (col.width !== undefined) return col.width;
    // What stretches: the bars if there are any, otherwise the first column.
    if (col.kind === 'bar' || (c === 0 && !hasBars)) return null;
    const head = (label: string) => measureTextEl({ role: s.head.role, weight: s.head.weight, content: label, smallCaps: true }).width;
    const bs = typeStyle(styleOf(c).role, styleOf(c).weight);
    return Math.ceil(
      Math.max(
        header ? head(col.label) : 0,
        ...p.rows.map((r) => measureText(r[c] ?? '', bs.size, bs.weight)),
      ),
    );
  };
  const fixed = cols.map((_, c) => fits(c));
  const flex = fixed.filter((w) => w === null).length || 1;
  const spare = p.width - GAP * last - fixed.reduce<number>((a, w) => a + (w ?? 0), 0);
  const widths = fixed.map((w) => w ?? Math.max(spare / flex, 0));
  let cx = p.x;
  const columns = cols.map((col, c) => {
    const out = { ...col, x: cx, width: widths[c], align: col.align ?? (c === 0 || col.kind === 'bar' ? 'start' : 'end') };
    cx += widths[c] + GAP;
    return out;
  });

  const bands = (header ? 1 : 0) + p.rows.length;
  const baseline = (role: TypeRole, top: number) => {
    const size = typeStyle(role).size;
    return top + (rowHeight - (VERTICAL.ascent + VERTICAL.descent) * size) / 2 + VERTICAL.ascent * size;
  };
  return {
    s,
    header,
    dividers,
    rowHeight,
    columns,
    styleOf,
    baseline,
    height: bands * rowHeight,
    /** Top of body row `r`. */
    rowTop: (r: number) => p.y + (header ? 1 + r : r) * rowHeight,
  };
}

/**
 * TABLE — a header and rows of cells, sized from its content.
 *
 * Replaces hand-placing a text per cell and a line per rule: the columns lay
 * themselves out across the width, and adding a row is a row, not four
 * elements nudged into line.
 */
export function Table(ctx: Ctx, props: TableProps): VNode {
  const L = tableLayout(props);
  const tk = ctx.tokens;
  const ink = (tone: 'muted' | 'primary') => (tone === 'muted' ? tk.text.muted : tk.text.primary);
  const nodes: VNode[] = [];

  const cell = (
    c: number,
    top: number,
    content: string,
    st: { role: TypeRole; weight?: TypeWeight; tone: 'muted' | 'primary' },
    smallCaps = false,
  ) => {
    const col = L.columns[c];
    return Text(ctx, {
      x: col.align === 'end' ? col.x + col.width : col.x,
      y: L.baseline(st.role, top),
      role: st.role,
      weight: st.weight,
      content,
      anchor: col.align === 'end' ? 'end' : 'start',
      color: ink(st.tone),
      smallCaps,
    });
  };

  if (L.header) {
    // The header in small caps, as the set's column labels are.
    L.columns.forEach((col, c) => col.label && nodes.push(cell(c, props.y, col.label, L.s.head, true)));
  }
  // A bar's length is its value's share of the column's largest, so the bars
  // compare the rows with each other; the largest runs the column's width.
  const most = L.columns.map((col, c) => (col.kind === 'bar' ? Math.max(0, ...props.rows.map((r) => barValue(r[c]))) : 0));
  props.rows.forEach((row, r) => {
    const top = L.rowTop(r);
    L.columns.forEach((col, c) => {
      if (col.kind === 'bar') {
        const v = barValue(row[c]);
        const w = most[c] ? (v / most[c]) * col.width : 0;
        const fill = chartColor(tk, 0, col.color);
        const y = top + (L.rowHeight - BAR) / 2;
        // The whole bar, faint, so each row's share reads against its full length.
        nodes.push(h('rect', { x: col.x, y, width: col.width, height: BAR, rx: BAR / 2, fill, 'fill-opacity': 0.2 }));
        if (w > 0) {
          nodes.push(
            h('rect', {
              x: col.x,
              y,
              width: Math.max(w, BAR),
              height: BAR,
              rx: BAR / 2,
              fill,
            }),
          );
        }
      } else if (row[c]) {
        nodes.push(cell(c, top, row[c], L.styleOf(c)));
      }
    });
  });

  if (L.dividers) {
    const count = (L.header ? 1 : 0) + props.rows.length - 1;
    for (let i = 1; i <= count; i++) {
      const y = props.y + i * L.rowHeight;
      nodes.push(h('line', { x1: props.x, y1: y, x2: props.x + props.width, y2: y, stroke: '#FFFFFF', 'stroke-opacity': 0.2, 'stroke-width': 1 }));
    }
  }

  return h('g', { 'data-el': 'table' }, nodes);
}
