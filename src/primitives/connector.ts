import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface ConnectorProps {
  /** Start and end points, in canvas coordinates. */
  from: [number, number];
  to: [number, number];
  /**
   * Elbow routing. `hv` leaves horizontally then turns vertical; `vh` the
   * reverse. `straight` draws a direct line.
   */
  route?: 'hv' | 'vh' | 'straight';
  /** Corner rounding on the elbow. */
  radius?: number;
  /** Draw a node dot at each end. */
  nodes?: boolean;
  /** Fade the line in from the `from` end. */
  fade?: boolean;
  /** A glass disc behind each end node — see `component.connector`. */
  rings?: boolean;
}

/** The end disc's radius: the source's 23.75px circle. */
const RING = 11.875;

/**
 * CONNECTOR — the elbow lines wiring the integration hub to its satellites.
 *
 * The originals draw these as filled ribbon shapes with baked gradients, one
 * hand-built path per connection. A routed stroke gets the same look, moves
 * when the nodes move, and is four numbers in the document instead of a
 * 600-character path.
 */
export function Connector(ctx: Ctx, props: ConnectorProps): VNode {
  const { from, to, route = 'hv', nodes = true, fade = true } = props;
  const rings = nodes && props.rings !== false;
  const r = props.radius ?? 10;
  const tk = ctx.tokens;
  const [x0, y0] = from;
  const [x1, y1] = to;

  let d: string;
  if (route === 'straight' || (Math.abs(x1 - x0) < 1 && Math.abs(y1 - y0) < 1)) {
    d = `M${x0} ${y0}L${x1} ${y1}`;
  } else if (route === 'hv') {
    const sx = Math.sign(x1 - x0);
    const sy = Math.sign(y1 - y0);
    const rr = Math.min(r, Math.abs(x1 - x0), Math.abs(y1 - y0));
    d =
      `M${x0} ${y0}` +
      `L${x1 - sx * rr} ${y0}` +
      `Q${x1} ${y0} ${x1} ${y0 + sy * rr}` +
      `L${x1} ${y1}`;
  } else {
    const sx = Math.sign(x1 - x0);
    const sy = Math.sign(y1 - y0);
    const rr = Math.min(r, Math.abs(x1 - x0), Math.abs(y1 - y0));
    d =
      `M${x0} ${y0}` +
      `L${x0} ${y1 - sy * rr}` +
      `Q${x0} ${y1} ${x0 + sx * rr} ${y1}` +
      `L${x1} ${y1}`;
  }

  let stroke: string = tk.accent.soft;
  if (fade) {
    const gid = ctx.uid('conn');
    ctx.defs.push(
      h(
        'linearGradient',
        { id: gid, x1: x0, y1: y0, x2: x1, y2: y1, gradientUnits: 'userSpaceOnUse' },
        [
          h('stop', { 'stop-color': tk.accent.soft, 'stop-opacity': 0.15 }),
          h('stop', { offset: 0.5, 'stop-color': tk.accent.soft, 'stop-opacity': 0.85 }),
          h('stop', { offset: 1, 'stop-color': tk.accent.base }),
        ],
      ),
    );
    stroke = `url(#${gid})`;
  }

  const c = tk.component.connector;
  const ring = (cx: number, cy: number) =>
    h('circle', {
      cx,
      cy,
      r: RING,
      fill: c.haloFill,
      'fill-opacity': c.haloFillOpacity,
      stroke: c.haloLine,
      'stroke-opacity': c.haloLineOpacity,
      'stroke-width': 1,
    });

  // Discs under the line, dots over it, so the line runs into each disc.
  return h('g', { 'data-el': 'connector' }, [
    ...(rings ? [ring(x0, y0), ring(x1, y1)] : []),
    h('path', {
      d,
      stroke,
      'stroke-width': 1.25,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    ...(nodes
      ? [
          // Sized to the disc as in the source: a third of its diameter.
          h('circle', { cx: x0, cy: y0, r: rings ? 3 : 2.25, fill: tk.accent.soft }),
          h('circle', { cx: x1, cy: y1, r: rings ? 3 : 2.25, fill: tk.accent.base }),
        ]
      : []),
  ]);
}
