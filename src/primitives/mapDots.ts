import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface MapDotsProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grid spacing in px. The references sit around 4. */
  spacing?: number;
  dotRadius?: number;
  /** Highlighted points in 0–1 map space, drawn as accent nodes. */
  markers?: [number, number][];
}

/**
 * Landmass approximation in 0–1 map space (x east, y south), as overlapping
 * ellipses. Deliberately coarse: at the ~140px width these maps are used at,
 * this reads as "world" without carrying a real geographic dataset.
 */
const LAND: [number, number, number, number][] = [
  // cx,  cy,   rx,   ry
  [0.17, 0.24, 0.10, 0.14], // North America
  [0.20, 0.40, 0.04, 0.05], // Central America
  [0.29, 0.66, 0.05, 0.16], // South America
  [0.51, 0.20, 0.07, 0.07], // Europe
  [0.54, 0.48, 0.08, 0.18], // Africa
  [0.70, 0.24, 0.17, 0.13], // Asia
  [0.72, 0.44, 0.04, 0.07], // India
  [0.80, 0.50, 0.04, 0.05], // SE Asia
  [0.87, 0.74, 0.06, 0.07], // Australia
];

function onLand(u: number, v: number): boolean {
  return LAND.some(
    ([cx, cy, rx, ry]) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1,
  );
}

/**
 * MAP DOTS — the dotted world map behind the commerce and analytics panels.
 *
 * Procedural rather than traced: the document says "put a map here, this big,
 * with markers at these points" instead of carrying a few hundred circles.
 */
export function MapDots(ctx: Ctx, props: MapDotsProps): VNode {
  const { x, y, width, height, markers = [] } = props;
  const spacing = props.spacing ?? 4;
  const r = props.dotRadius ?? 0.85;
  const tk = ctx.tokens;
  const light = tk.name === 'light';

  const dots: VNode[] = [];
  for (let py = 0; py < height; py += spacing) {
    for (let px = 0; px < width; px += spacing) {
      if (!onLand(px / width, py / height)) continue;
      dots.push(h('circle', { cx: x + px, cy: y + py, r }));
    }
  }

  return h('g', { 'data-el': 'map-dots' }, [
    h(
      'g',
      { fill: light ? '#8C96A9' : '#70A2FF', 'fill-opacity': light ? 0.55 : 0.45 },
      dots,
    ),
    ...markers.map(([u, v]) =>
      h('circle', {
        cx: x + u * width,
        cy: y + v * height,
        r: 2,
        fill: tk.accent.base,
      }),
    ),
  ]);
}
