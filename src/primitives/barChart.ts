import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface BarChartProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Values in any unit; the tallest fills `height`. */
  data: number[];
  /** 0–1 share of each slot taken by the bar. */
  barRatio?: number;
  /** Vertical gradient from accent to cyan, as in the references. */
  gradient?: boolean;
}

/**
 * BAR CHART — vertical bars from data, with the accent-to-cyan vertical
 * gradient the exports use. Square corners, matching the reference.
 */
export function BarChart(ctx: Ctx, props: BarChartProps): VNode {
  const { x, y, width, height, data } = props;
  const tk = ctx.tokens;
  const ratio = props.barRatio ?? 0.68;
  const useGradient = props.gradient ?? true;

  const max = Math.max(...data, 1);
  const slot = width / data.length;
  const barW = slot * ratio;

  const gradId = ctx.uid('bargrad');
  if (useGradient) {
    ctx.defs.push(
      h(
        'linearGradient',
        { id: gradId, x1: x, y1: y, x2: x, y2: y + height, gradientUnits: 'userSpaceOnUse' },
        [
          h('stop', { 'stop-color': tk.status.info }),
          h('stop', { offset: 1, 'stop-color': tk.accent.base }),
        ],
      ),
    );
  }

  return h(
    'g',
    { 'data-el': 'bar-chart' },
    data.map((v, i) => {
      const barH = Math.max((v / max) * height, 1);
      return h('rect', {
        x: x + slot * i + (slot - barW) / 2,
        y: y + height - barH,
        width: barW,
        height: barH,
        fill: useGradient ? `url(#${gradId})` : tk.accent.base,
      });
    }),
  );
}
