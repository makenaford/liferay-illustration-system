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
  const r = g.radial;
  ctx.defs.push(
    h(
      r ? 'radialGradient' : 'linearGradient',
      r
        ? {
            // A unit circle, stretched to the ellipse and set at its centre.
            id,
            cx: 0,
            cy: 0,
            r: 1,
            gradientUnits: 'userSpaceOnUse',
            gradientTransform: `translate(${box.x + r.cx * box.width} ${box.y + r.cy * box.height}) scale(${r.rx * box.width} ${r.ry * box.height})`,
          }
        : {
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

/** A rounded rect as path data, for cutting holes — `rect` cannot be one. */
function roundedRectPath(x: number, y: number, w: number, hgt: number, r: number) {
  const rr = Math.min(r, w / 2, hgt / 2);
  return (
    `M${x + rr} ${y}h${w - rr * 2}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${hgt - rr * 2}` +
    `a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - rr * 2)}a${rr} ${rr} 0 0 1 ${-rr} ${-rr}` +
    `v${-(hgt - rr * 2)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}Z`
  );
}

function castShadow(
  ctx: Ctx,
  layers: ShadowLayer[],
  box: { x: number; y: number; width: number; height: number },
) {
  const id = ctx.uid('cast');
  const pad = Math.max(...layers.map((l) => l.blur + Math.max(Math.abs(l.dx ?? 0), Math.abs(l.dy)))) * 2 + 20;
  let input = 'SourceGraphic';
  const prims = layers.map((l, i) => {
    const result = `sh${i}`;
    const node = h('feDropShadow', {
      in: input,
      // Explicit: feDropShadow defaults both offsets to 2, not 0.
      dx: l.dx ?? 0,
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
 * knows how to paint one: fill, frosted pane, inset glow, lit edge, hairline,
 * shadow.
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
      ? // A name this build doesn't know — renamed since, say — draws as the standard card.
        (tk.surfaces[(props.surface as SurfaceName) ?? 'glass-default'] ?? tk.surfaces['glass-default'])
      : props.surface;

  const box = { x, y, width, height };
  const shape = () => h('rect', { x, y, width, height, rx: radius });

  if (ctx.figma) return figmaSurface(ctx, spec, box, radius, backdrop, props.surface, children);

  const layers: (VNode | null)[] = [];

  if (spec.shadow?.length) {
    const id = castShadow(ctx, spec.shadow, box);
    const caster = h('g', { filter: `url(#${id})`, 'data-el': 'elevation' }, [
      h('rect', { x, y, width, height, rx: radius, fill: tk.stage.bg }),
    ]);
    if (ctx.transparent) {
      // Over no background the frosted pane is transparent too, so the opaque
      // caster would show through the glass. Masked to outside the card, only
      // its shadow is left.
      const maskId = ctx.uid('smask');
      const pad = Math.max(...spec.shadow.map((l) => l.blur + Math.max(Math.abs(l.dx ?? 0), Math.abs(l.dy)))) * 2 + 20;
      ctx.defs.push(
        h('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 }, [
          h('rect', { x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2, fill: '#FFFFFF' }),
          h('rect', { x, y, width, height, rx: radius, fill: '#000000' }),
        ]),
      );
      layers.push(h('g', { mask: `url(#${maskId})` }, [caster]));
    } else {
      layers.push(caster);
    }
  }

  if (backdrop && spec.blur && !spec.recessed) {
    layers.push(backdropPane(ctx, shape(), spec.blur, spec.blurOpacity));
  }

  if (spec.fill) {
    layers.push(
      h('rect', { x, y, width, height, rx: radius, fill: gradient(ctx, ctx.uid('sfill'), spec.fill, box) }),
    );
  }

  if (spec.inset?.length) {
    // CSS `inset` box-shadow: everything OUTSIDE the card, shifted by the
    // offset and blurred, seen through the card's own shape — so the light
    // falls in from the edge the offset points away from.
    const clipId = ctx.uid('sclip');
    ctx.defs.push(h('clipPath', { id: clipId }, [shape()]));
    layers.push(
      h(
        'g',
        { 'clip-path': `url(#${clipId})`, 'data-el': 'inset' },
        spec.inset.map((l) => {
          const pad = l.blur * 2 + Math.max(Math.abs(l.dx ?? 0), Math.abs(l.dy)) + 4;
          const fid = ctx.uid('sinset');
          ctx.defs.push(
            h(
              'filter',
              { id: fid, x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2, filterUnits: 'userSpaceOnUse' },
              [h('feGaussianBlur', { stdDeviation: l.blur / 2 })],
            ),
          );
          const hole = roundedRectPath(x + (l.dx ?? 0), y + l.dy, width, height, radius);
          return h('path', {
            d: `M${x - pad} ${y - pad}h${width + pad * 2}v${height + pad * 2}h${-(width + pad * 2)}Z${hole}`,
            'fill-rule': 'evenodd',
            fill: l.color,
            'fill-opacity': l.opacity,
            filter: `url(#${fid})`,
          });
        }),
      ),
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

/** A `#RRGGBB` colour as the 0–1 channels an `feColorMatrix` takes. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const c = (v: number) => Math.round((v / 255) * 1e6) / 1e6;
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

/**
 * A SURFACE FOR FIGMA — the same card, written the way Figma's own SVG
 * exporter writes one, which is the form its SVG import turns back into
 * native effects (see `RenderOptions.figma`):
 *
 *   - the blur as `data-figma-bg-blur-radius` on the group — a
 *     BACKGROUND_BLUR (Figma's exporter also writes a `foreignObject` for
 *     browsers; its import does not need it)
 *   - the shadows as one filter on that group, in Figma's own chain: each
 *     drop shadow blended over `BackgroundImageFix`, then the shape, then each
 *     inset — a DROP_SHADOW or INNER_SHADOW per layer. `litEdge` is an inset
 *     1px down with no blur, which is what it draws.
 *
 * The fill and hairline go inside that group; the card's contents after it,
 * so the effects apply to the card, not to everything on it. Figma's blur
 * radius is twice the CSS one the tokens hold.
 */
function figmaSurface(
  ctx: Ctx,
  spec: SurfaceSpec,
  box: { x: number; y: number; width: number; height: number },
  radius: number,
  backdrop: boolean,
  name: SurfaceProps['surface'],
  children: (VNode | null | undefined)[],
): VNode {
  const { x, y, width, height } = box;
  const drops = spec.shadow ?? [];
  const insets: ShadowLayer[] = [
    ...(spec.litEdge && spec.litEdge.opacity > 0 ? [{ dy: 1, blur: 0, color: spec.litEdge.color, opacity: spec.litEdge.opacity }] : []),
    ...(spec.inset ?? []),
  ];
  const blur = backdrop && spec.blur && !spec.recessed ? spec.blur : 0;
  const glass: VNode[] = [];
  if (spec.fill) glass.push(h('rect', { x, y, width, height, rx: radius, fill: gradient(ctx, ctx.uid('sfill'), spec.fill, box) }));
  if (spec.line) {
    const w = spec.line.width ?? 1;
    glass.push(
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

  const attrs: Record<string, string | number> = { 'data-el': 'glass' };
  if (drops.length || insets.length) {
    const pad = Math.max(0, ...[...drops, ...insets].map((l) => l.blur + Math.max(Math.abs(l.dx ?? 0), Math.abs(l.dy)))) * 2 + 4;
    const fid = ctx.uid('fx');
    const alpha = () =>
      h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' });
    const tint = (l: ShadowLayer) => {
      const [r, g, b] = channels(l.color);
      return h('feColorMatrix', { type: 'matrix', values: `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${l.opacity} 0` });
    };
    const move = (l: ShadowLayer) => [
      h('feOffset', { dx: l.dx || undefined, dy: l.dy || undefined }),
      l.blur > 0 ? h('feGaussianBlur', { stdDeviation: l.blur / 2 }) : null,
    ];
    const prims: (VNode | null)[] = [h('feFlood', { 'flood-opacity': 0, result: 'BackgroundImageFix' })];
    let prev = 'BackgroundImageFix';
    drops.forEach((l, i) => {
      const result = `effect${i + 1}_dropShadow`;
      prims.push(alpha(), ...move(l), h('feComposite', { in2: 'hardAlpha', operator: 'out' }), tint(l), h('feBlend', { mode: 'normal', in2: prev, result }));
      prev = result;
    });
    prims.push(h('feBlend', { mode: 'normal', in: 'SourceGraphic', in2: prev, result: 'shape' }));
    prev = 'shape';
    insets.forEach((l, i) => {
      const result = `effect${drops.length + i + 1}_innerShadow`;
      prims.push(alpha(), ...move(l), h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }), tint(l), h('feBlend', { mode: 'normal', in2: prev, result }));
      prev = result;
    });
    ctx.defs.push(
      h(
        'filter',
        { id: fid, x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' },
        prims,
      ),
    );
    attrs.filter = `url(#${fid})`;
  }

  const out: VNode[] = [];
  // Figma's import reads the blur from this marker alone; the foreignObject
  // its exporter writes beside it is only for a browser, which this is not for.
  if (blur) attrs['data-figma-bg-blur-radius'] = blur * 2;
  out.push(h('g', attrs, glass));

  return h('g', { 'data-el': 'surface', 'data-surface': typeof name === 'string' ? name : 'custom' }, [
    ...out,
    ...(children.filter(Boolean) as VNode[]),
  ]);
}
