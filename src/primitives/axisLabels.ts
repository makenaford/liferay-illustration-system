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
  labels?: string[];
  /** Space between the plot's bottom and the labels. Defaults to 4. */
  labelGap?: number;
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
