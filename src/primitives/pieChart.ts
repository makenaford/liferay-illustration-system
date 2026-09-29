import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface PieChartProps {
  x: number;
  y: number;
  /** The box; the chart is centred in it, sized so its lifted glass stays inside. */
  width: number;
  height: number;
  /** Each segment's share, in any unit — they are summed. Up to four. */
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

/** At most this many segments; past it the rest are not drawn. */
export const PIE_MAX = 4;

/**
 * How much lighter each segment is than the one before: the gradient is one
 * colour, so the segments are told apart by a step of white over it and a
 * fine line between them, not by colours of their own.
 */
const STEP = 0.16;

/** How far the lifted glass segment reaches, as a share of the radius. */
const LIFT_REACH = 1.06 + 0.08;

/** The gap between segments, as a share of the radius. */
const GAP = 0.06;

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
 * A segment with rounded corners — `k` px — from `a0` to `a1` degrees,
 * between radii `r0` (0: a wedge to the centre) and `r1`. Each corner is a
 * curve through it, from `k` before to `k` after along the two edges.
 */
function roundedSector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, k: number): string {
  const p = (r: number, a: number) => at(cx, cy, r, a).map(f).join(' ');
  const deg = (len: number, r: number) => ((len / r) * 180) / Math.PI;
  const large = a1 - a0 > 180 ? 1 : 0;
  const o = deg(k, r1);
  const outer =
    `L${p(r1 - k, a0)}Q${p(r1, a0)} ${p(r1, a0 + o)}` +
    `A${f(r1)} ${f(r1)} 0 ${large} 1 ${p(r1, a1 - o)}` +
    `Q${p(r1, a1)} ${p(r1 - k, a1)}`;
  if (r0 <= 0) {
    return `M${p(k, a0)}${outer}L${p(k, a1)}Q${f(cx)} ${f(cy)} ${p(k, a0)}Z`;
  }
  const i = deg(k, r0);
  return (
    `M${p(r0 + k, a0)}${outer}L${p(r0 + k, a1)}Q${p(r0, a1)} ${p(r0, a1 - i)}` +
    `A${f(r0)} ${f(r0)} 0 ${large} 0 ${p(r0, a0 + i)}Q${p(r0, a0)} ${p(r0 + k, a0)}Z`
  );
}

/**
 * PIE CHART — shares of a whole, one way: a clean circle in the brand
 * gradient, whole or as a single ring, of up to four segments — each a step
 * lighter than the last, a clear gap between them — with one, the share
 * that matters, lifted off it as a pane of glass. No gaps, no stripes, no colours
 * of their own: the glass is where the eye is sent.
 */
export function PieChart(ctx: Ctx, props: PieChartProps): VNode {
  const { x, y, width, height } = props;
  const values = props.values.slice(0, PIE_MAX);
  const tk = ctx.tokens;
  // Smaller than the box by what the lifted glass reaches past the chart
  // (1.06 of the radius, pushed out 0.08), so the whole of it stays inside.
  const r = Math.min(width, height) / 2 / LIFT_REACH;
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

  // The circle, whole, in the gradient — then each segment's step of light,
  // the glass segment, and the lines between them.
  const nodes: VNode[] = [h('path', { d: arc(cx, cy, inner, r, 0, 360), fill: `url(#${gradId})`, 'fill-rule': 'evenodd' })];
  const edges: number[] = [];
  let a = 0;
  let shade = 0;
  let lifted: { a0: number; a1: number } | null = null;
  for (const [i, v] of values.entries()) {
    const sweep = (Math.max(v, 0) / total) * 360;
    const a0 = a;
    a += sweep;
    if (sweep <= 0) continue;
    if (sweep < 359.99) edges.push(a0);
    const d = arc(cx, cy, inner, r, a0, a0 + sweep);
    if (i === glass) lifted = { a0, a1: a0 + sweep };
    if (shade) nodes.push(h('path', { d, fill: '#FFFFFF', 'fill-opacity': Math.min(shade * STEP, 0.6) }));
    shade++;
  }

  // A gap at every boundary — cut out, so what is behind shows through — of
  // one width from the centre to the rim, so the circle stays a circle.
  const glassNodes = lifted ? elevated(lifted.a0, lifted.a1) : [];
  if (!edges.length) return h('g', { 'data-el': 'pie-chart' }, [...nodes, ...glassNodes]);
  const maskId = ctx.uid('piegaps');
  const gap = Math.max(2, r * GAP);
  ctx.defs.push(
    h('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: f(cx - r - 2), y: f(cy - r - 2), width: f(r * 2 + 4), height: f(r * 2 + 4) }, [
      h('rect', { x: f(cx - r - 2), y: f(cy - r - 2), width: f(r * 2 + 4), height: f(r * 2 + 4), fill: '#FFFFFF' }),
      ...edges.map((e) => {
        const [x1, y1] = at(cx, cy, r + 2, e);
        return h('line', { x1: f(cx), y1: f(cy), x2: f(x1), y2: f(y1), stroke: '#000000', 'stroke-width': f(gap) });
      }),
    ]),
  );
  return h('g', { 'data-el': 'pie-chart' }, [h('g', { mask: `url(#${maskId})` }, nodes), ...glassNodes]);

  /*
   * The glass segment, lifted off the chart: a little larger, pushed out
   * along its middle, its corners rounded — casting a soft shadow, frosting
   * a blurred view of the chart beneath, with a white sheen and a lit edge.
   * The chart under it stays whole, so it reads as above it, not cut from it.
   */
  function elevated(a0: number, a1: number): VNode[] {
    const [ox, oy] = at(0, 0, r * 0.08, (a0 + a1) / 2);
    const gx = cx + ox;
    const gy = cy + oy;
    const outer = r * 1.06;
    const k = r * 0.06;
    const d = roundedSector(gx, gy, line ? inner : 0, outer, a0, a1, k);
    const box = { x: f(gx - outer * 1.4), y: f(gy - outer * 1.4), width: f(outer * 2.8), height: f(outer * 2.8), filterUnits: 'userSpaceOnUse' };
    const shadowId = ctx.uid('pieshadow');
    const frostId = ctx.uid('piefrost');
    const clipId = ctx.uid('pieclip');
    const glowId = ctx.uid('pieglow');
    ctx.defs.push(
      h('filter', { id: shadowId, ...box }, [h('feGaussianBlur', { stdDeviation: f(r * 0.07) })]),
      h('filter', { id: frostId, ...box }, [h('feGaussianBlur', { stdDeviation: f(r * 0.09) })]),
      h('filter', { id: glowId, ...box }, [h('feGaussianBlur', { stdDeviation: f(r * 0.03) })]),
      h('clipPath', { id: clipId }, [h('path', { d })]),
    );
    return [
      h('path', { d, fill: '#000000', 'fill-opacity': 0.35, transform: `translate(${f(r * 0.02)} ${f(r * 0.06)})`, filter: `url(#${shadowId})` }),
      h('g', { 'clip-path': `url(#${clipId})`, 'data-el': 'pie-glass' }, [
        // What is under the glass, blurred: the chart, and the stage past it.
        h('path', { d: arc(cx, cy, 0, r * 1.5, 0, 360), fill: tk.stage.bg }),
        h('path', { d: arc(cx, cy, inner, r, 0, 360), fill: `url(#${gradId})`, 'fill-rule': 'evenodd', filter: `url(#${frostId})` }),
        h('path', { d, fill: `url(#${sheenId})`, 'fill-opacity': 0.5 }),
        // The lit edge's glow, inside the glass.
        h('path', { d, fill: 'none', stroke: '#FFFFFF', 'stroke-opacity': 0.8, 'stroke-width': f(r * 0.07), filter: `url(#${glowId})` }),
      ]),
      h('path', { d, fill: 'none', stroke: '#FFFFFF', 'stroke-opacity': 0.9, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
    ];
  }
}
