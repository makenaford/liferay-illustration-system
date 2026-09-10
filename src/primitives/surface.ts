import { h, backdropPane, type Ctx, type VNode } from '../vsvg.ts';
import type { Grad, ShadowLayer, SurfaceName, SurfaceSpec } from '../tokens.ts';

export interface SurfaceProps {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  /** A name from the token set, or a spec for a one-off. */
  surface?: SurfaceName | SurfaceSpec;
  /** Set false to skip the frosted pane. */
  backdrop?: boolean;
  children?: (VNode | null | undefined)[];
}

/**
 * CSS `linear-gradient(<deg>)` expressed as SVG gradient endpoints.
 *
 * CSS measures from "up" and turns clockwise, so the gradient line's unit
 * direction is `(sin θ, -cos θ)`; SVG wants the two endpoints of that line
 * across the box. Doing the conversion here lets the tokens keep the same
 * angles the design system's CSS uses (60°, 225°) rather than hand-derived
 * coordinates nobody can check against the source.
 */
export function cssAngleLine(
  deg: number,
  x: number,
  y: number,
  w: number,
  hgt: number,
) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const cx = x + w / 2;
  const cy = y + hgt / 2;
  const half = (Math.abs(w * dx) + Math.abs(hgt * dy)) / 2;
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

function gradient(
  ctx: Ctx,
  id: string,
  g: Grad,
  box: { x: number; y: number; width: number; height: number },
) {
  ctx.defs.push(
    h(
      'linearGradient',
      {
        id,
        ...cssAngleLine(g.angle, box.x, box.y, box.width, box.height),
        gradientUnits: 'userSpaceOnUse',
      },
      g.stops.map((s, i) =>
        h('stop', {
          offset: s.offset ?? (g.stops.length > 1 ? i / (g.stops.length - 1) : 0),
          'stop-color': s.color,
          'stop-opacity': s.opacity,
        }),
      ),
    ),
  );
  return `url(#${id})`;
}

function castShadow(
  ctx: Ctx,
  layers: ShadowLayer[],
  box: { x: number; y: number; width: number; height: number },
) {
  const id = ctx.uid('cast');
  const pad = Math.max(...layers.map((l) => l.blur + Math.abs(l.dy))) * 2 + 20;
  let input = 'SourceGraphic';
  const prims = layers.map((l, i) => {
    const result = `sh${i}`;
    const node = h('feDropShadow', {
      in: input,
      dy: l.dy,
      // A CSS shadow blur is roughly twice the Gaussian sigma.
      stdDeviation: l.blur / 2,
      'flood-color': l.color,
      'flood-opacity': l.opacity,
      result,
    });
    input = result;
    return node;
  });
  ctx.defs.push(
    h(
      'filter',
      {
        id,
        x: box.x - pad,
        y: box.y - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
        filterUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      },
      prims,
    ),
  );
  return id;
}

/**
 * SURFACE — one primitive that draws any card in the set.
 *
 * `GlassPanel` and `SubCard` each used to carry their own copy of the glass
 * recipe, which meant eight surfaces would have been eight branches across two
 * files. Here the recipe is data (`SurfaceSpec` in tokens.ts) and this only
 * knows how to paint one: fill, frosted pane, lit edge, hairline, shadow.
 * Adding a surface is a token entry.
 *
 * ORDER, and why: CSS clips an outer `box-shadow` to outside the border box,
 * so a translucent card never shows its own shadow through its fill. SVG
 * filters have no such rule, so the shadow is cast by an OPAQUE copy of the
 * shape underneath, and the frosted pane — itself an opaque blurred copy of
 * the backdrop — then covers it everywhere inside the card.
 */
export function Surface(ctx: Ctx, props: SurfaceProps): VNode {
  const { x, y, width, height, backdrop = true, children = [] } = props;
  const tk = ctx.tokens;
  const radius = props.radius ?? tk.radius.card;
  const spec: SurfaceSpec =
    typeof props.surface === 'string' || props.surface === undefined
      ? tk.surfaces[(props.surface as SurfaceName) ?? 'glass2']
      : props.surface;

  const box = { x, y, width, height };
  const shape = () => h('rect', { x, y, width, height, rx: radius });

  const layers: (VNode | null)[] = [];

  if (spec.shadow?.length) {
    const id = castShadow(ctx, spec.shadow, box);
    layers.push(
      h('g', { filter: `url(#${id})`, 'data-el': 'elevation' }, [
        h('rect', { x, y, width, height, rx: radius, fill: tk.stage.bg }),
      ]),
    );
  }

  if (backdrop && spec.blur && !spec.recessed) {
    layers.push(backdropPane(ctx, shape(), spec.blur));
  }

  if (spec.fill) {
    layers.push(
      h('rect', { x, y, width, height, rx: radius, fill: gradient(ctx, ctx.uid('sfill'), spec.fill, box) }),
    );
  }

  if (spec.litEdge && spec.litEdge.opacity > 0) {
    // A 1px band clipped to the rounded rect, which gets the corner inset
    // right for free — `inset 0 1px 0`, drawn.
    const clipId = ctx.uid('sclip');
    ctx.defs.push(h('clipPath', { id: clipId }, [shape()]));
    layers.push(
      h('g', { 'clip-path': `url(#${clipId})`, 'data-el': 'lit-edge' }, [
        h('rect', { x, y, width, height: 1, fill: spec.litEdge.color, 'fill-opacity': spec.litEdge.opacity }),
      ]),
    );
  }

  if (spec.line) {
    const w = spec.line.width ?? 1;
    layers.push(
      h('rect', {
        x: x + w / 2,
        y: y + w / 2,
        width: width - w,
        height: height - w,
        rx: Math.max(radius - w / 2, 0),
        stroke: gradient(ctx, ctx.uid('sline'), spec.line, box),
        'stroke-width': w === 1 ? undefined : w,
        fill: 'none',
      }),
    );
  }

  return h('g', { 'data-el': 'surface', 'data-surface': typeof props.surface === 'string' ? props.surface : 'custom' }, [
    ...layers,
    ...(children.filter(Boolean) as VNode[]),
  ]);
}
