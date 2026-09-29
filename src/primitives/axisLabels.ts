import type { Ctx, VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES } from './text.ts';
import { textBox } from '../fontMetrics.generated.ts';

/**
 * AXIS LABELS — the words under a chart's plot: months, categories.
 *
 * Part of the chart rather than a row of texts beside it, so resizing the
 * chart always carries them. They hang below the plot inside the chart's own
 * box; the chart's `height` stays the plot alone, so a resize changes the
 * plot and the labels keep their size and gap.
 */
export interface AxisLabelProps {
  /** Horizontal labels, left to right, under the plot. */
  labels?: string[];
  /** Space between the plot's bottom and the labels. Defaults to 4. */
  labelGap?: number;
  /**
   * Vertical labels, top to bottom, down the plot's left edge — a value
   * scale (100K … 0). Drawn inside the chart's box: the plot moves right by
   * the widest label and its gap, so the chart's size in a layout holds.
   */
  valueLabels?: string[];
}

/** `micro`, regular, in the muted text colour. */
const SIZE = TYPE_ROLES.micro.size;
const DEFAULT_GAP = 4;

/** Height the labels add below the plot: 0 without labels. */
export function axisBand(props: AxisLabelProps): number {
  if (!props.labels?.some((l) => l.trim())) return 0;
  return (props.labelGap ?? DEFAULT_GAP) + textBox('', SIZE, 400).height;
}

/**
 * Draw the labels under a plot at (x, y, width, height).
 *
 *   between  first on the left edge, last on the right, the rest evenly
 *            spaced — a line chart, whose points run edge to edge
 *   slots    each centred in its share of the width — a bar chart, whose
 *            bars sit in the middle of their slots
 */
export function axisLabels(
  ctx: Ctx,
  props: AxisLabelProps & { x: number; y: number; width: number; height: number },
  spread: 'between' | 'slots',
): VNode[] {
  const labels = (props.labels ?? []).map((l) => l.trim());
  if (!labels.some(Boolean)) return [];
  const { x, y, width, height } = props;
  const baseline = y + height + (props.labelGap ?? DEFAULT_GAP) + textBox('', SIZE, 400).baseline;
  const text = (content: string, at: number, anchor: 'start' | 'middle') =>
    Text(ctx, { x: at, y: baseline, role: 'micro', weight: 'regular', content, anchor, color: ctx.tokens.text.muted });

  if (spread === 'slots') {
    const slot = width / labels.length;
    return labels.map((l, i) => text(l, x + slot * (i + 0.5), 'middle'));
  }

  // CSS `justify-content: space-between`, as the dashboards' label rows were.
  const widths = labels.map((l) => textBox(l, SIZE, 400).width);
  const gap = labels.length > 1 ? (width - widths.reduce((a, b) => a + b, 0)) / (labels.length - 1) : 0;
  let at = x;
  return labels.map((l, i) => {
    const node = text(l, at, 'start');
    at += widths[i] + gap;
    return node;
  });
}

/** The width the vertical labels take from the left of the chart: 0 without them. */
export function valueBand(props: AxisLabelProps): number {
  const labels = (props.valueLabels ?? []).map((l) => l.trim()).filter(Boolean);
  if (!labels.length) return 0;
  return Math.max(...labels.map((l) => textBox(l, SIZE, 400).width)) + (props.labelGap ?? DEFAULT_GAP);
}

/**
 * The plot inside a chart's box: the box less the vertical labels' band on
 * the left. Everything the chart plots — and the editor's handles on it —
 * is placed in this, so they all move together.
 */
export function plotBox<T extends { x: number; width: number } & AxisLabelProps>(props: T): T {
  const band = Math.min(valueBand(props), props.width * 0.5);
  return band ? { ...props, x: props.x + band, width: props.width - band } : props;
}

/** Draw the vertical labels, right-aligned beside the plot, spread evenly from its top to its bottom. */
export function valueAxisLabels(
  ctx: Ctx,
  props: AxisLabelProps & { x: number; y: number; width: number; height: number },
): VNode[] {
  const labels = (props.valueLabels ?? []).map((l) => l.trim());
  if (!labels.some(Boolean)) return [];
  const right = plotBox(props).x - (props.labelGap ?? DEFAULT_GAP);
  const mid = textBox('', SIZE, 400);
  const step = labels.length > 1 ? props.height / (labels.length - 1) : 0;
  return labels.map((l, i) =>
    Text(ctx, {
      x: right,
      y: props.y + step * i - mid.height / 2 + mid.baseline,
      role: 'micro',
      weight: 'regular',
      content: l,
      anchor: 'end',
      color: ctx.tokens.text.muted,
    }),
  );
}
