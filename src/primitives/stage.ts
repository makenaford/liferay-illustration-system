import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface Glow {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /**
   * Blur radius. Discovered during the port: the references use 60 on one
   * illustration and 100 on the other eight, and the difference is dramatic —
   * a 100px blur spreads the same ellipse into a much dimmer, wider wash.
   * It's a per-glow composition choice, not a global token.
   */
  blur?: number;
  /** Per-glow override; all nine references happen to use the token value. */
  opacity?: number;
}

export interface StageProps {
  width: number;
  height: number;
  /**
   * Ambient bloom placement. The references use one to three of these, often
   * anchored off-canvas so only a corner of the bloom shows.
   */
  glow?: Glow[];
}

/**
 * STAGE — the ground every illustration sits on.
 *
 * Three layers, straight from the exports: flat background, a large radial
 * wash, then a heavily blurred ellipse for ambient bloom. In light mode the
 * bloom drops to a faint tint (see tokens) so it reads as paper, not haze.
 */
export function Stage(ctx: Ctx, props: StageProps): VNode {
  const { width, height, glow } = props;
  const t = ctx.tokens.stage;

  const washId = ctx.uid('wash');

  const glows: Glow[] =
    glow && glow.length
      ? glow
      : [{ cx: width / 2, cy: height * 0.73, rx: width * 0.3, ry: height * 0.44 }];

  /**
   * The corner mesh: one radial gradient per bloom, each painted over the full
   * canvas. `radial-gradient(rx ry at x y, C o 0%, transparent f)` becomes a
   * userSpaceOnUse radial gradient whose unit circle is scaled to (rx, ry) —
   * which is how CSS sizes an elliptical radial gradient too.
   */
  const meshLayers = t.mesh.map((b) => {
    const id = ctx.uid('mesh');
    ctx.defs.push(
      h(
        'radialGradient',
        {
          id,
          cx: 0,
          cy: 0,
          r: 1,
          gradientUnits: 'userSpaceOnUse',
          gradientTransform:
            `translate(${b.x * width} ${b.y * height}) ` +
            `scale(${b.rx * width} ${b.ry * height})`,
        },
        [
          h('stop', { 'stop-color': b.color, 'stop-opacity': b.opacity }),
          h('stop', { offset: b.fade, 'stop-color': b.color, 'stop-opacity': 0 }),
        ],
      ),
    );
    // Bled like the base fill, so `backdropPane`'s blur has real pixels to
    // sample at the canvas edges — which is exactly where a mesh is strongest.
    return h('rect', {
      x: -140,
      y: -140,
      width: width + 280,
      height: height + 280,
      fill: `url(#${id})`,
    });
  });

  const blurIds = glows.map(() => ctx.uid('glowblur'));

  ctx.defs.push(
    h(
      'radialGradient',
      {
        id: washId,
        cx: 0,
        cy: 0,
        r: 1,
        gradientUnits: 'userSpaceOnUse',
        gradientTransform: `translate(${width / 2} ${height / 2}) rotate(90) scale(${height * 1.81} ${width * 1.81})`,
      },
      [
        h('stop', { 'stop-color': t.washColor, 'stop-opacity': 0 }),
        h('stop', { offset: 1, 'stop-color': t.washColor }),
      ],
    ),
    ...glows.map((g, i) => {
      const blur = g.blur ?? t.glowBlur;
      return h(
        'filter',
        {
          id: blurIds[i],
          x: g.cx - g.rx - blur * 2,
          y: g.cy - g.ry - blur * 2,
          width: g.rx * 2 + blur * 4,
          height: g.ry * 2 + blur * 4,
          filterUnits: 'userSpaceOnUse',
          'color-interpolation-filters': 'sRGB',
        },
        [h('feGaussianBlur', { stdDeviation: blur })],
      );
    }),
  );

  // The base fills beyond the viewBox. Invisible when drawn (the viewport
  // clips it) but it gives `backdropPane`'s blur real pixels to sample near
  // the canvas edges, instead of transparent black that darkens card borders.
  const bleed = 140;

  return h('g', { 'data-el': 'stage' }, [
    h('rect', {
      x: -bleed,
      y: -bleed,
      width: width + bleed * 2,
      height: height + bleed * 2,
      fill: t.bg,
    }),
    t.washOpacity > 0
      ? h('rect', {
          width,
          height,
          fill: `url(#${washId})`,
          'fill-opacity': t.washOpacity,
        })
      : null,
    ...meshLayers,
    ...glows.map((g, i) =>
      h('g', { opacity: g.opacity ?? t.glowOpacity, filter: `url(#${blurIds[i]})` }, [
        h('ellipse', { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, fill: t.glowColor }),
      ]),
    ),
  ]);
}
