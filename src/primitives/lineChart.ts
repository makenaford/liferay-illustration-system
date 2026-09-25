import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES } from './text.ts';
import { textBox } from '../fontMetrics.generated.ts';

export interface Series {
  /** Values in any unit; scaled to the plot box. */
  data: number[];
  /** `primary` is the hero series, `secondary` the comparison. */
  role?: 'primary' | 'secondary' | 'success';
  color?: string;
  strokeWidth?: number;
}

export interface LineChartProps {
  x: number;
  y: number;
  width: number;
  height: number;
  series: Series[];
  /** Horizontal rules, solid `Neutral/02`. Count matches the exports' 8. */
  gridLines?: number;
  /** Shared y-scale across series. Defaults to the combined data range. */
  domain?: [number, number];
  /**
   * A dot at every data point. Reads as "these are the readings" rather than
   * "this is a trend", which is the difference between a progress chart and a
   * sparkline.
   */
  markers?: boolean;
  /**
   * A horizontal accent rule at this data value, fading in from the left.
   * Used in the reference illustration to mark the "15x" threshold.
   */
  referenceLine?: number;
  /**
   * Axis labels under the plot — months, usually. Part of the chart rather
   * than a row beside it, so resizing the chart always carries them: first
   * label on the left edge, last on the right, the rest spaced evenly
   * between, whatever the width.
   */
  labels?: string[];
  /** Space between the plot's bottom and the labels. Defaults to 4. */
  labelGap?: number;
}

/** The labels' type: `micro`, regular, in the muted text colour. */
const AXIS_SIZE = TYPE_ROLES.micro.size;

/** Height the labels add below the plot: 0 without labels. */
export function axisBand(props: Pick<LineChartProps, 'labels' | 'labelGap'>): number {
  if (!props.labels?.length) return 0;
  return (props.labelGap ?? 4) + textBox('', AXIS_SIZE, 400).height;
}

/**
 * The labels, laid out the way the dashboards' label rows were: CSS
 * `justify-content: space-between` across the plot's width.
 */
function axisLabels(ctx: Ctx, props: LineChartProps): VNode[] {
  const labels = (props.labels ?? []).map((l) => l.trim());
  if (!labels.length) return [];
  const { x, y, width, height } = props;
  const widths = labels.map((l) => textBox(l, AXIS_SIZE, 400).width);
  const gap = labels.length > 1 ? (width - widths.reduce((a, b) => a + b, 0)) / (labels.length - 1) : 0;
  const baseline = y + height + (props.labelGap ?? 4) + textBox('', AXIS_SIZE, 400).baseline;
  let at = x;
  return labels.map((content, i) => {
    const node = Text(ctx, {
      x: at,
      y: baseline,
      role: 'micro',
      weight: 'regular',
      content,
      color: ctx.tokens.text.muted,
    });
    at += widths[i] + gap;
    return node;
  });
}

/**
 * Monotone cubic interpolation — smooth without the overshoot you get from a
 * naive Catmull-Rom, which matters because these charts are decorative and an
 * overshoot below zero looks like a bug.
 */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  if (n === 2) return `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;

  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    slope.push(dy[i] / dx[i]);
  }

  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);

  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const t = dx[i] / 3;
    d += `C${x0 + t} ${y0 + m[i] * t} ${x1 - t} ${y1 - m[i + 1] * t} ${x1} ${y1}`;
  }
  return d;
}

/** The y-scale: the chart's domain, or the combined data range. */
export function lineDomain(props: Pick<LineChartProps, 'series' | 'domain'>): [number, number] {
  const all = props.series.flatMap((s) => s.data);
  return props.domain ?? [Math.min(...all, 0), Math.max(...all, 1)];
}

/**
 * Where each series' points are drawn — shared with the editor, so the
 * drag handles sit exactly on the curve's points.
 */
export function linePoints(props: LineChartProps): [number, number][][] {
  const { x, y, width, height } = props;
  const [lo, hi] = lineDomain(props);
  const span = hi - lo || 1;
  return props.series.map((s) =>
    s.data.map((v, i) => [
      x + (width / Math.max(s.data.length - 1, 1)) * i,
      y + height - ((v - lo) / span) * height,
    ]),
  );
}

/**
 * LINE CHART — data in, curve out.
 *
 * In the current SVGs these curves are frozen path data, so changing "15x" to
 * "40x" means reopening Figma. Here the shape follows the numbers, which is
 * the whole point of a builder.
 */
export function LineChart(ctx: Ctx, props: LineChartProps): VNode {
  const { x, y, width, height, series, gridLines = 8 } = props;
  const tk = ctx.tokens;
  const t = tk.chart;

  const [lo, hi] = lineDomain(props);
  const span = hi - lo || 1;
  const points = linePoints(props);

  const grid: VNode[] = [];
  for (let i = 0; i < gridLines; i++) {
    const gy = y + (height / gridLines) * (i + 1);
    grid.push(
      h('line', {
        x1: x,
        y1: gy,
        x2: x + width,
        y2: gy,
        stroke: t.gridLine,
        'stroke-opacity': t.gridLineOpacity,
        'stroke-width': 0.5,
      }),
    );
  }

  const dots: VNode[] = [];
  const lines = series.map((s, si) => {
    const pts = points[si];
    const color =
      s.color ??
      (s.role === 'secondary'
        ? t.secondary
        : s.role === 'success'
          ? tk.status.success
          : t.primary);
    if (props.markers) {
      for (const [px, py] of pts) {
        dots.push(h('circle', { cx: px, cy: py, r: (s.strokeWidth ?? 1.5) * 1.1, fill: color }));
      }
    }
    return h('path', {
      d: monotonePath(pts),
      stroke: color,
      'stroke-width': s.strokeWidth ?? 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      fill: 'none',
    });
  });

  let refLine: VNode | null = null;
  if (props.referenceLine !== undefined) {
    const refId = ctx.uid('refline');
    const ry = y + height - ((props.referenceLine - lo) / span) * height;
    ctx.defs.push(
      h(
        'linearGradient',
        { id: refId, x1: x, y1: ry, x2: x + width, y2: ry, gradientUnits: 'userSpaceOnUse' },
        [
          h('stop', { 'stop-color': t.secondary, 'stop-opacity': 0 }),
          h('stop', { offset: 0.167, 'stop-color': t.secondary }),
          h('stop', { offset: 1, 'stop-color': t.secondary }),
        ],
      ),
    );
    refLine = h('path', {
      d: `M${x} ${ry}L${x + width} ${ry}`,
      stroke: `url(#${refId})`,
      'stroke-linejoin': 'round',
      fill: 'none',
      'data-el': 'reference-line',
    });
  }

  return h('g', { 'data-el': 'line-chart' }, [
    h('g', { 'data-el': 'grid' }, grid),
    refLine,
    ...lines,
    ...dots,
    ...axisLabels(ctx, props),
  ]);
}
