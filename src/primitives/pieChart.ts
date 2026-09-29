import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface PieChartProps {
  x: number;
  y: number;
  /** The box; the chart is the largest circle centred in it. */
  width: number;
  height: number;
  /** Each segment's share, in any unit — they are summed. */
  values: number[];
  /** `full`, a whole disc (default), or `line`, a single ring. */
  style?: 'full' | 'line';
  /** The one segment drawn as glass. Defaults to the last. */
  highlight?: number;
  /** Retained for older documents: a hole makes it the `line` style. */
  hole?: number;
}

/** The ring's thickness, as a share of the radius, in the `line` style. */
const LINE = 0.26;

/** Where a point on the circle is, clockwise from the top. */
const at = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const f = (n: number) => Math.round(n * 100) / 100;

/** A segment from `a0` to `a1` degrees, between radii `r0` (0 for a disc) and `r1`. */
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  // A whole turn is two halves: one arc cannot start and end on the same point.
  if (a1 - a0 >= 359.99) return arc(cx, cy, r0, r1, a0, a0 + 180) + arc(cx, cy, r0, r1, a0 + 180, a1);
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
 * PIE CHART — shares of a whole, one way: a clean circle in the brand
 * gradient, whole or as a single ring, with one segment — the share that
 * matters — drawn as a pane of glass. No gaps, no stripes, no second
 * colour: the glass is the only thing the eye is sent to.
 */
export function PieChart(ctx: Ctx, props: PieChartProps): VNode {
  const { x, y, width, height, values } = props;
  const tk = ctx.tokens;
  const r = Math.min(width, height) / 2;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const line = (props.style ?? ((props.hole ?? 0) > 0 ? 'line' : 'full')) === 'line';
  const inner = line ? r * (1 - LINE) : 0;
  const total = values.reduce((n, v) => n + Math.max(v, 0), 0) || 1;
  const glass = props.highlight ?? values.length - 1;

  const gradId = ctx.uid('piegrad');
  const sheenId = ctx.uid('pieglass');
  ctx.defs.push(
    h('linearGradient', { id: gradId, x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r, gradientUnits: 'userSpaceOnUse' }, [
      h('stop', { 'stop-color': tk.accent.base }),
      h('stop', { offset: 1, 'stop-color': tk.status.info }),
    ]),
    h('linearGradient', { id: sheenId, x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, gradientUnits: 'userSpaceOnUse' }, [
      h('stop', { 'stop-color': '#FFFFFF', 'stop-opacity': 0.7 }),
      h('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 0.2 }),
    ]),
  );

  // The circle, whole, in the gradient — then the glass segment over it.
  const nodes: VNode[] = [h('path', { d: arc(cx, cy, inner, r, 0, 360), fill: `url(#${gradId})`, 'fill-rule': 'evenodd' })];
  let a = 0;
  values.forEach((v, i) => {
    const sweep = (Math.max(v, 0) / total) * 360;
    const a0 = a;
    a += sweep;
    if (i !== glass || sweep <= 0) return;
    const d = arc(cx, cy, inner, r, a0, a0 + sweep);
    nodes.push(
      // Frosted: the gradient muted under it, a white sheen across it, a lit edge.
      h('path', { d, fill: tk.stage.bg, 'fill-opacity': 0.55 }),
      h('path', { d, fill: `url(#${sheenId})`, 'fill-opacity': 0.55, stroke: '#FFFFFF', 'stroke-opacity': 0.75, 'stroke-width': 1, 'stroke-linejoin': 'round' }),
    );
  });

  return h('g', { 'data-el': 'pie-chart' }, nodes);
}
