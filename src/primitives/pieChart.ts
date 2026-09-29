import { h, type Ctx, type VNode } from '../vsvg.ts';
import { paintOf } from '../colors.ts';
import { cssAngleLine } from './surface.ts';

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
  /** Each segment's tone, by position. A gap takes `PIE_COLORS`. */
  colors?: (string | null)[];
  /** Retained for older documents: a hole makes it the `line` style. */
  hole?: number;
}

/** The ring's thickness, as a share of the radius, in the `line` style. */
const LINE = 0.26;

/** At most this many segments; past it the rest are not drawn. */
export const PIE_MAX = 4;

/**
 * Each segment's default fill, by position — the pie in the Marketing UI
 * Assets Repo (Figma 905:19487): Blue Gradient, Primary Dark navy, Aqua, and
 * Blue Gradient again under the glass, which is the last segment by default.
 * All three are tokens the builder already offers, so a segment changed in
 * the picker is still a design-system colour.
 */
export const PIE_COLORS = ['gradient-brand', 'primary-dark', 'base-aqua', 'gradient-brand'];

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
 * PIE CHART — shares of a whole, one way: a clean circle, whole or as a
 * single ring, of up to four segments, each in its own colour with a clear
 * gap between them — and one, the share that matters, lifted off it as a
 * pane of glass. The glass is where the eye is sent.
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

  // A tone's paint across the chart's box: a colour, or a gradient laid over the whole circle.
  const box = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  const paints = new Map<string, string>();
  const fillOf = (tone: string): string => {
    const hit = paints.get(tone);
    if (hit) return hit;
    const p = paintOf(tk, tone) ?? paintOf(tk, PIE_COLORS[0])!;
    let fill: string;
    if ('color' in p) fill = p.color;
    else {
      const id = ctx.uid('piefill');
      ctx.defs.push(
        h(
          'linearGradient',
          { id, ...cssAngleLine(p.gradient.angle, box.x, box.y, box.w, box.h), gradientUnits: 'userSpaceOnUse' },
          p.gradient.stops.map((st, i, all) =>
            h('stop', { offset: st.offset ?? (all.length > 1 ? i / (all.length - 1) : 0), 'stop-color': st.color, 'stop-opacity': st.opacity }),
          ),
        ),
      );
      fill = `url(#${id})`;
    }
    paints.set(tone, fill);
    return fill;
  };

  // Each segment in its own fill, and the lines between them.
  const nodes: VNode[] = [];
  const edges: number[] = [];
  let a = 0;
  let lifted: { a0: number; a1: number } | null = null;
  for (const [i, v] of values.entries()) {
    const sweep = (Math.max(v, 0) / total) * 360;
    const a0 = a;
    a += sweep;
    if (sweep <= 0) continue;
    if (sweep < 359.99) edges.push(a0);
    if (i === glass) lifted = { a0, a1: a0 + sweep };
    const tone = props.colors?.[i] || PIE_COLORS[i % PIE_COLORS.length];
    nodes.push(h('path', { d: arc(cx, cy, inner, r, a0, a0 + sweep), fill: fillOf(tone), 'fill-rule': 'evenodd' }));
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
   * The glass segment, lifted off the chart — Figma 905:19487's `pie3`: a
   * little larger, pushed out along its middle, its corners rounded. White at
   * 60% over a 12px blur of the chart beneath, a soft dark drop shadow (4px
   * down), a white glow all round its inside edge and a brand-blue one
   * falling from its top. The figures are the file's at its 144px radius,
   * scaled with the chart. The chart under it stays whole, so it reads as
   * above it, not cut from it.
   */
  function elevated(a0: number, a1: number): VNode[] {
    const u = r / 144;
    const [ox, oy] = at(0, 0, r * 0.08, (a0 + a1) / 2);
    const gx = cx + ox;
    const gy = cy + oy;
    const outer = r * 1.06;
    const k = r * 0.06;
    const d = roundedSector(gx, gy, line ? inner : 0, outer, a0, a1, k);
    const reach = outer * 1.4;
    const fbox = { x: f(gx - reach), y: f(gy - reach), width: f(reach * 2), height: f(reach * 2), filterUnits: 'userSpaceOnUse' };
    const shadowId = ctx.uid('pieshadow');
    const frostId = ctx.uid('piefrost');
    const clipId = ctx.uid('pieclip');
    const glowId = ctx.uid('pieglow');
    const blueId = ctx.uid('pieblue');
    ctx.defs.push(
      h('filter', { id: shadowId, ...fbox }, [h('feGaussianBlur', { stdDeviation: f(2 * u) })]),
      h('filter', { id: frostId, ...fbox }, [h('feGaussianBlur', { stdDeviation: f(6 * u) })]),
      h('filter', { id: glowId, ...fbox }, [h('feGaussianBlur', { stdDeviation: f(3 * u) })]),
      h('filter', { id: blueId, ...fbox }, [h('feGaussianBlur', { stdDeviation: f(4 * u) })]),
      h('clipPath', { id: clipId }, [h('path', { d })]),
    );
    // Everything outside the glass, for its inset shadows: a frame around it.
    const frame = (dy: number) =>
      `M${f(gx - reach)} ${f(gy - reach)}h${f(reach * 2)}v${f(reach * 2)}h${f(-reach * 2)}Z` +
      roundedSector(gx, gy + dy, line ? inner : 0, outer, a0, a1, k);
    return [
      h('path', { d, fill: '#000000', 'fill-opacity': 0.25, transform: `translate(0 ${f(4 * u)})`, filter: `url(#${shadowId})` }),
      h('g', { 'clip-path': `url(#${clipId})`, 'data-el': 'pie-glass' }, [
        // What is under the glass, blurred: the chart, and the stage past it.
        h('path', { d: arc(cx, cy, 0, r * 1.5, 0, 360), fill: tk.stage.bg }),
        h('g', { filter: `url(#${frostId})` }, nodes.map((n) => h(n.tag, { ...n.attrs }))),
        h('path', { d, fill: '#FFFFFF', 'fill-opacity': 0.6 }),
        h('path', { d: frame(2 * u), fill: '#0B5FFF', 'fill-rule': 'evenodd', filter: `url(#${blueId})` }),
        h('path', { d: frame(0), fill: '#FFFFFF', 'fill-rule': 'evenodd', filter: `url(#${glowId})` }),
      ]),
    ];
  }
}
