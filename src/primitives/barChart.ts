import { h, type Ctx, type VNode } from '../vsvg.ts';
import { monotonePath } from './lineChart.ts';
import { chartColor } from '../colors.ts';
import { axisLabels, plotBox, valueAxisLabels, type AxisLabelProps } from './axisLabels.ts';

export interface BarSeries {
  /**
   * Values in any unit, scaled against every series together. `null` leaves
   * that category empty for this series — which is how you get two bars of
   * different tones standing apart rather than shoulder to shoulder.
   */
  data: (number | null)[];
  /** Retained for older documents; the colour now comes from `color`, or the series' place. */
  tone?: 'accent' | 'soft';
  /** A colour from the set. Omitted: Primary, then Purple — see `CHART_COLORS`. */
  color?: string;
}

/** Labels centred under their categories' bars. */
export interface BarChartProps extends AxisLabelProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Values in any unit; the tallest fills `height`. Ignored when `series` is set. */
  data?: number[];
  /**
   * Two or more bars per category, drawn side by side and scaled together —
   * a this-versus-that comparison, which a single `data` array cannot say.
   */
  series?: BarSeries[];
  /** 0–1 share of each slot taken by the bars. */
  barRatio?: number;
  /** Vertical gradient from accent to cyan, as in the references. */
  gradient?: boolean;
  /** One colour for a single-series chart, in place of the gradient. */
  color?: string;
  /** Horizontal rules behind the bars, as on the line chart. */
  gridLines?: number;
  /**
   * The value the full height stands for. Omit and the tallest bar fills
   * the chart, which is the original behaviour; set it when the chart sits
   * beside an axis (0 … 100K) that the bars should agree with.
   */
  max?: number;
  /**
   * A line over the bars, through the top of each slot — a second measure
   * on the same months ("recovery time" over the bar counts). On its own
   * scale, from zero to its largest value.
   */
  line?: (number | null)[];
  /** The line's colour, from the set. Omitted: the text colour, as a highlight. */
  lineColor?: string;
}

/** One drawn bar — shared with the editor, so its handles sit on the bars. */
export interface BarRect {
  series: number;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalised series, the scale ceiling, and where every bar is drawn. */
export function barGeometry(props: BarChartProps): { series: BarSeries[]; max: number; bars: BarRect[] } {
  const { x, y, width, height } = plotBox(props);
  const ratio = props.barRatio ?? 0.68;
  const series: BarSeries[] = props.series ?? [{ data: props.data ?? [] }];
  const categories = Math.max(...series.map((s) => s.data.length), 1);
  const tallest = Math.max(...series.flatMap((s) => s.data.filter((v) => v !== null) as number[]), 1);
  const max = props.max && props.max > 0 ? props.max : tallest;
  const slot = width / categories;
  const groupW = slot * ratio;
  const barW = groupW / series.length;

  const bars: BarRect[] = [];
  series.forEach((s, si) =>
    s.data.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const barH = Math.min(Math.max((v / max) * height, 1), height);
      bars.push({
        series: si,
        index: i,
        x: x + slot * i + (slot - groupW) / 2 + barW * si,
        y: y + height - barH,
        width: barW,
        height: barH,
      });
    }),
  );
  return { series, max, bars };
}

/**
 * BAR CHART — vertical bars from data, with the accent-to-cyan vertical
 * gradient the exports use. Square corners, matching the reference.
 */
export function BarChart(ctx: Ctx, props: BarChartProps): VNode {
  // The plot, right of any vertical labels; the bars come from `barGeometry`, which does the same.
  const plot = plotBox(props);
  const { x, y, width, height } = plot;
  const tk = ctx.tokens;
  // A grouped chart is making a comparison, and the accent-to-cyan gradient
  // would make the two series harder to tell apart, not easier.
  const { series, bars: rects } = barGeometry(props);
  const grouped = !!props.series;
  // A chosen colour is a solid fill; the gradient is the single chart's default.
  const useGradient = (props.gradient ?? true) && !grouped && !props.color;

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

  const grid: VNode[] = [];
  const gridLines = props.gridLines ?? 0;
  for (let i = 0; i < gridLines; i++) {
    const gy = y + (height / gridLines) * i;
    grid.push(
      h('line', {
        x1: x,
        y1: gy,
        x2: x + width,
        y2: gy,
        stroke: tk.chart.gridLine,
        'stroke-opacity': tk.chart.gridLineOpacity,
        'stroke-width': 0.5,
      }),
    );
  }

  const fillFor = (si: number) =>
    useGradient ? `url(#${gradId})` : chartColor(tk, si, grouped ? series[si].color : props.color);
  const bars = rects.map((r) =>
    h('rect', { x: r.x, y: r.y, width: r.width, height: r.height, fill: fillFor(r.series) }),
  );

  // The line: one point over the middle of each slot, on its own scale.
  const overlay: VNode[] = [];
  const values = props.line ?? [];
  if (values.some((v) => v !== null)) {
    const slots = Math.max(values.length, 1);
    const top = Math.max(...values.map((v) => v ?? 0), 1);
    const pts = values.flatMap((v, i): [number, number][] =>
      v === null ? [] : [[x + (width / slots) * (i + 0.5), y + height - (v / top) * height * 0.9]],
    );
    const stroke = props.lineColor ? chartColor(tk, 0, props.lineColor) : tk.text.primary;
    overlay.push(
      h('path', { d: monotonePath(pts), stroke, 'stroke-width': 1.25, fill: 'none', 'stroke-linecap': 'round', 'data-el': 'bar-line' }),
      ...pts.map(([cx, cy]) => h('circle', { cx, cy, r: 1.8, fill: stroke })),
    );
  }

  return h('g', { 'data-el': 'bar-chart' }, [
    ...grid,
    ...bars,
    ...overlay,
    ...axisLabels(ctx, plot, 'slots'),
    ...valueAxisLabels(ctx, props),
  ]);
}
