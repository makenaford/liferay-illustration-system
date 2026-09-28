import { h, type Ctx, type VNode } from '../vsvg.ts';
import { chartColor } from '../colors.ts';

export interface PieChartProps {
  x: number;
  y: number;
  /** The box; the chart is the largest circle centred in it. */
  width: number;
  height: number;
  /** Each segment's share, in any unit — they are summed. */
  values: number[];
  /** Per segment, a colour from the set; omitted or null, the chart colours in order. */
  colors?: (string | null)[];
  /** The hole, as a share of the radius: 0 is a pie, 0.6 a ring. */
  hole?: number;
  /** Degrees of space between segments. */
  gap?: number;
  /** One segment pulled out of the chart as a pane of glass — "Orders by Channel". */
  highlight?: number;
  /** One segment drawn in stripes — the share still to come, "Top Expense Items". */
  striped?: number;
  /** Every segment in the brand gradient, told apart by the gaps — the set's rings. */
  gradient?: boolean;
}

/** Where a point on the circle is, clockwise from the top. */
const at = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const f = (n: number) => Math.round(n * 100) / 100;

/** A segment from `a0` to `a1` degrees, between radii `r0` (0 for a pie) and `r1`. */
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x1, y1] = at(cx, cy, r1, a0);
  const [x2, y2] = at(cx, cy, r1, a1);
  if (r0 <= 0) return `M${f(cx)} ${f(cy)}L${f(x1)} ${f(y1)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${f(x2)} ${f(y2)}Z`;
  const [x3, y3] = at(cx, cy, r0, a1);
  const [x4, y4] = at(cx, cy, r0, a0);
  return (
    `M${f(x1)} ${f(y1)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${f(x2)} ${f(y2)}` +
    `L${f(x3)} ${f(y3)}A${f(r0)} ${f(r0)} 0 ${large} 0 ${f(x4)} ${f(y4)}Z`
  );
}

/**
 * PIE CHART — shares of a whole, as a pie or a ring. The set draws them two
 * ways, and both are here: a pie whose one segment of note lifts out as
 * glass ("Orders by Channel"), and a gradient ring with one segment striped
 * ("Top Expense Items", "Consumption by sector").
 */
export function PieChart(ctx: Ctx, props: PieChartProps): VNode {
  const { x, y, width, height, values } = props;
  const tk = ctx.tokens;
  const r = Math.min(width, height) / 2;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const hole = Math.min(Math.max(props.hole ?? 0, 0), 0.9) * r;
  const gap = props.gap ?? (hole ? 3 : 0);
  const total = values.reduce((n, v) => n + Math.max(v, 0), 0) || 1;

  let gradId: string | null = null;
  if (props.gradient) {
    gradId = ctx.uid('piegrad');
    ctx.defs.push(
      h('linearGradient', { id: gradId, x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r, gradientUnits: 'userSpaceOnUse' }, [
        h('stop', { 'stop-color': tk.accent.base }),
        h('stop', { offset: 1, 'stop-color': tk.status.info }),
      ]),
    );
  }

  const nodes: VNode[] = [];
  let a = 0;
  values.forEach((v, i) => {
    const sweep = (Math.max(v, 0) / total) * 360;
    const a0 = a + gap / 2;
    const a1 = a + sweep - gap / 2;
    a += sweep;
    if (a1 <= a0) return;
    const chosen = props.colors?.[i] ?? undefined;
    const color = chartColor(tk, i, chosen);
    const fill = gradId && !chosen ? `url(#${gradId})` : color;

    if (i === props.highlight) {
      // Lifted out along its middle, as a pane of glass tinted its colour.
      const [dx, dy] = at(0, 0, r * 0.08, (a0 + a1) / 2);
      const d = arc(cx + dx, cy + dy, hole, r * 1.02, a0, a1);
      const sheenId = ctx.uid('pieglass');
      ctx.defs.push(
        h('linearGradient', { id: sheenId, x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, gradientUnits: 'userSpaceOnUse' }, [
          h('stop', { 'stop-color': '#FFFFFF', 'stop-opacity': 0.75 }),
          h('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 0.15 }),
        ]),
      );
      nodes.push(
        h('path', { d, fill: color, 'fill-opacity': 0.55 }),
        h('path', { d, fill: `url(#${sheenId})`, 'fill-opacity': 0.5, stroke: '#FFFFFF', 'stroke-opacity': 0.7, 'stroke-width': 1 }),
      );
      return;
    }
    if (i === props.striped) {
      // Stripes across the segment, clipped to it.
      const d = arc(cx, cy, hole, r, a0, a1);
      const pid = ctx.uid('piestripes');
      const w = Math.max(r * 0.09, 2);
      ctx.defs.push(
        h('pattern', { id: pid, width: w * 2, height: w * 2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
          h('rect', { width: w, height: w * 2, fill: color }),
        ]),
      );
      nodes.push(h('path', { d, fill: `url(#${pid})` }));
      return;
    }
    nodes.push(h('path', { d: arc(cx, cy, hole, r, a0, a1), fill }));
  });

  return h('g', { 'data-el': 'pie-chart' }, nodes);
}
