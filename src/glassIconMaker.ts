/**
 * GLASS ICON MAKER — two MingCute icons, made into one glass icon in the
 * house style, dark and light.
 *
 * The recipe is read off the existing glass icons (assets/glass-icons/, e.g.
 * "General - Mail"): a GRADIENT icon behind, up and to the right, and a
 * FROSTED GLASS icon in front, down and to the left — a translucent blue fill
 * with a drop shadow and two inner glows, over a background blur of the one
 * behind. Each theme has its own fill and effects, as there; light mode's
 * gradient is dark mode's, flipped. Fill, gradient and effects match the
 * Marketing Icons file (below) value for value.
 *
 * Sizes and positions follow the Marketing Icons file (Figma, "Glass icon/",
 * node 394:3099): in a 64px frame, the glass icon's 68px grid sits at
 * (-7, 0) and the one behind it, 48px, at (19, -5) — both overflowing the
 * frame, as they do there. Nothing is clipped: the viewBox grows past the
 * frame to take in whatever of the two icons and the glass's shadow
 * overflows it (see `viewBoxOf`), as the set's own icons carry their bleed
 * ("General - Mail" is `-2 -8 74 74`).
 *
 * The output is the same Figma-export shape the set ships as — a
 * `foreignObject` blur and a `_dii_` filter group — so it goes through the
 * same portable-glass fix (src/figmaGlass.ts) as every other glass icon, and
 * every generated icon is the same size: the glyph always fills the same
 * front square.
 */

export type GlassTheme = 'dark' | 'light';

export interface GlassIconSpec {
  /** The frosted glass icon in front: a path on MingCute's 24px grid, or drawn shapes fitted onto it. */
  front: string | Layer;
  /** The gradient icon behind it, the same way. */
  back: string | Layer;
  /** Where each icon's ink actually lies on that grid; the whole grid when not measured. */
  frontBounds?: GlyphBounds;
  backBounds?: GlyphBounds;
  /** Which of the LAYOUTS; "Glass leads", the Figma frame, when not given. */
  layout?: LayoutName;
  /** The back on the left of the glass instead of the right. */
  mirror?: boolean;
}

/**
 * A layer drawn in its own coordinates — an existing icon's shapes, as
 * Figma exported them, each with its own transform if it had one — and how
 * they fit onto the 24px grid: grid = own × scale + (tx, ty).
 */
export interface Layer {
  paths: LayerPath[];
  toGrid: { scale: number; tx: number; ty: number };
}

export interface LayerPath {
  d: string;
  transform?: string;
  /** How the shape is drawn, as the original drew it: its fill rule, or its stroke's width and ends. */
  paint?: { fillRule?: 'evenodd' | 'nonzero'; stroke?: { width: number; linecap?: string; linejoin?: string } };
}

const layerOf = (l: string | Layer): Layer =>
  typeof l === 'string' ? { paths: [{ d: l }], toGrid: { scale: 1, tx: 0, ty: 0 } } : l;

/**
 * A layer's paths as markup, painted with `color`: onto the grid, then by
 * `placed` (a box's own placement) when given. Every path carries its whole
 * transform, since a clipPath may hold shapes but not groups. A stroked
 * shape is stroked in `color`; a filled one keeps its fill rule.
 */
const pathsOf = (l: Layer, color: string, extra = '', placed = '') =>
  l.paths
    .map((p) => {
      const t = `${placed ? `${placed} ` : ''}translate(${l.toGrid.tx} ${l.toGrid.ty}) scale(${l.toGrid.scale})${p.transform ? ` ${p.transform}` : ''}`;
      const s = p.paint?.stroke;
      const paint = s
        ? ` fill="none" stroke="${color}" stroke-width="${s.width}"${s.linecap ? ` stroke-linecap="${s.linecap}"` : ''}${s.linejoin ? ` stroke-linejoin="${s.linejoin}"` : ''}`
        : `${color ? ` fill="${color}"` : ''}${p.paint?.fillRule ? ` fill-rule="${p.paint.fillRule}" clip-rule="${p.paint.fillRule}"` : ''}`;
      return `<path transform="${t}" d="${p.d}"${paint}${extra}/>`;
    })
    .join('');

/** A glyph's bounding box on the 24px grid. */
export interface GlyphBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
const WHOLE_GRID: GlyphBounds = { x: 0, y: 0, width: 24, height: 24 };

/**
 * How far the glass's drop shadow reaches past its shape: an offset of 4
 * down, blurred by 2 (three deviations, 6, either way). Dark's shadow is the
 * larger of the two themes', so both share one viewBox.
 */
const SHADOW = { left: 6, right: 6, top: 2, bottom: 10 };

/** The frame, and each icon's box within it — MingCute's 24px grid scaled up. */
export const FRAME = 64;
export interface Placement {
  size: number;
  x: number;
  y: number;
}

export type LayoutName = 'glass' | 'equal' | 'gradient';

/**
 * Where the two icons sit in the 64px frame: each icon's 24px grid, scaled
 * to `size` and placed at (x, y). "Glass leads" is the Figma frame; the
 * others are read off the set itself — the median of its icons whose back
 * is about as big as the glass (Equal), or bigger (Gradient leads).
 */
export const LAYOUTS: Record<LayoutName, { label: string; front: Placement; back: Placement }> = {
  glass: { label: 'Glass leads', front: { size: 68, x: -7, y: 0 }, back: { size: 48, x: 19, y: -5 } },
  equal: { label: 'Equal', front: { size: 62, x: -5.5, y: 7 }, back: { size: 56.5, x: 13.5, y: -4 } },
  gradient: { label: 'Gradient leads', front: { size: 53, x: -4.5, y: 13.5 }, back: { size: 70, x: 0.5, y: -5 } },
};

/** The Figma frame's layout. */
export const FRONT = LAYOUTS.glass.front;
export const BACK = LAYOUTS.glass.back;

/**
 * An icon's two placements: its layout, mirrored left to right when the
 * back sits on the left. Only the places mirror, never the artwork.
 */
export function placementsOf(spec: Pick<GlassIconSpec, 'layout' | 'mirror'>): { front: Placement; back: Placement } {
  const l = LAYOUTS[spec.layout ?? 'glass'];
  if (!spec.mirror) return { front: l.front, back: l.back };
  const flip = (p: Placement) => ({ ...p, x: FRAME - p.x - p.size });
  return { front: flip(l.front), back: flip(l.back) };
}

/** The back icon's gradient, as the dark icons draw it. Light runs it in reverse. */
const DARK_STOPS = [
  ['#1514A4', 0],
  ['#0B5FFF', 0.485577],
  ['#47FFFC', 1],
] as const;
/**
 * Across the back icon's box, as fractions of it: top right to bottom left.
 * Both lines are read off the Marketing Icons file ("Glass icon/", node
 * 394:3099), the gradient's ends in its own 48px box.
 */
const DARK_LINE = { x1: 0.791, y1: 0.125, x2: 0.411, y2: 0.827 } as const;
/** Light's line starts bottom left, so the same stops put the cyan top right. */
const LIGHT_LINE = { x1: 0.315, y1: 0.889, x2: 0.849, y2: 0 } as const;

const THEME = {
  dark: {
    fill: '#70A1FF',
    fillOpacity: 0.3,
    stops: DARK_STOPS,
    line: DARK_LINE,
    /** Figma's background blur, which it writes as CSS blur(radius / 2). */
    bgBlur: 6,
    effects: `<feOffset dy="4"/><feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/><feGaussianBlur stdDeviation="3"/><feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="shape" result="effect2_innerShadow"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="2"/><feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="effect2_innerShadow" result="effect3_innerShadow"/>`,
  },
  light: {
    fill: '#99BCFF',
    fillOpacity: 0.5,
    /** The dark gradient, flipped: the same stops, run the other way. */
    stops: DARK_STOPS,
    line: LIGHT_LINE,
    bgBlur: 4,
    effects: `<feOffset dx="1.3"/><feGaussianBlur stdDeviation="0.65"/><feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.344262 0 0 0 0 1 0 0 0 0.7 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="1.5"/><feGaussianBlur stdDeviation="0.5"/><feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="shape" result="effect2_innerShadow"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="3"/><feGaussianBlur stdDeviation="2.5"/><feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 0.376471 0 0 0 0 0.623529 0 0 0 0 1 0 0 0 0.4 0"/>
<feBlend mode="normal" in2="effect2_innerShadow" result="effect3_innerShadow"/>`,
  },
} as const;

/**
 * The frame, grown to hold everything drawn: both icons' ink and the glass's
 * shadow. Kept square, so a square tile shows it undistorted.
 */
export function viewBoxOf(spec: GlassIconSpec): [number, number, number, number] {
  const at = placementsOf(spec);
  const ink = (box: Placement, b: GlyphBounds) => {
    const k = box.size / 24;
    return { x0: box.x + b.x * k, y0: box.y + b.y * k, x1: box.x + (b.x + b.width) * k, y1: box.y + (b.y + b.height) * k };
  };
  const f = ink(at.front, spec.frontBounds ?? WHOLE_GRID);
  const b = ink(at.back, spec.backBounds ?? WHOLE_GRID);
  const x0 = Math.floor(Math.min(0, f.x0 - SHADOW.left, b.x0));
  const y0 = Math.floor(Math.min(0, f.y0 - SHADOW.top, b.y0));
  const x1 = Math.ceil(Math.max(FRAME, f.x1 + SHADOW.right, b.x1));
  const y1 = Math.ceil(Math.max(FRAME, f.y1 + SHADOW.bottom, b.y1));
  const size = Math.max(x1 - x0, y1 - y0);
  // The short side grows evenly about its middle.
  return [x0 - (size - (x1 - x0)) / 2, y0 - (size - (y1 - y0)) / 2, size, size];
}

const place = (box: Placement) =>
  `translate(${box.x} ${box.y}) scale(${box.size / 24})`;

/** One theme of the icon, as a Figma-style glass SVG. */
export function makeGlassIcon(spec: GlassIconSpec, theme: GlassTheme): string {
  const t = THEME[theme];
  const { front: FRONT, back: BACK } = placementsOf(spec);
  const backLayer = layerOf(spec.back);
  const frontLayer = layerOf(spec.front);
  // The back: one square of gradient on the grid, cut to the back's shapes
  // by a mask — so the gradient runs across every piece the same way,
  // however each is placed, and strokes and fill rules hold (the
  // construction Figma's own light export uses).
  const back =
    `<g transform="${place(BACK)}"><rect x="-6" y="-6" width="36" height="36" fill="url(#gi_grad)" mask="url(#gi_backshape)"/></g>`;
  /** The front's paths, placed. */
  const front = (color: string, extra = '') => pathsOf(frontLayer, color, extra, place(FRONT));
  // The effect region Figma gives a glass shape: its box, and room for the shadow.
  const fx = FRONT.x - 6;
  const fy = FRONT.y - 6;
  const fw = FRONT.size + 14;
  const fh = FRONT.size + 14;
  // The gradient is on the back's 24px grid, the square's own space.
  const gx = (f: number) => 24 * f;
  const gy = (f: number) => 24 * f;
  const stops = t.stops
    .map(([c, o]) => `<stop${o ? ` offset="${o}"` : ''} stop-color="${c}"/>`)
    .join('');
  return (
    `<svg width="${FRAME}" height="${FRAME}" viewBox="${viewBoxOf(spec).join(' ')}" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    back +
    `<foreignObject x="${fx}" y="${fy}" width="${fw}" height="${fh}"><div xmlns="http://www.w3.org/1999/xhtml" ` +
    `style="backdrop-filter:blur(${t.bgBlur / 2}px);clip-path:url(#gi_bgclip);height:100%;width:100%"></div></foreignObject>` +
    `<g filter="url(#gi_dii)" data-figma-bg-blur-radius="${t.bgBlur}">` +
    front(t.fill, ` ${frontLayer.paths.some((p) => p.paint?.stroke) ? 'stroke-opacity' : 'fill-opacity'}="${t.fillOpacity}"`) +
    `</g>` +
    `<defs>` +
    `<filter id="gi_dii" x="${fx}" y="${fy}" width="${fw}" height="${fh}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feFlood flood-opacity="0" result="BackgroundImageFix"/>` +
    `<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>` +
    t.effects.replace(/\n/g, '') +
    `</filter>` +
    `<clipPath id="gi_bgclip" transform="translate(${-fx} ${-fy})">${front('')}</clipPath>` +
    `<mask id="gi_backshape" maskUnits="userSpaceOnUse" x="-24" y="-24" width="72" height="72">${pathsOf(backLayer, 'white')}</mask>` +
    `<linearGradient id="gi_grad" x1="${gx(t.line.x1)}" y1="${gy(t.line.y1)}" x2="${gx(t.line.x2)}" y2="${gy(t.line.y2)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>` +
    `</defs></svg>`
  );
}
