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
  /** The frosted glass icon in front, on MingCute's 24px grid. */
  front: string;
  /** The gradient icon behind it, on the same grid. */
  back: string;
  /** Where each icon's ink actually lies on that grid; the whole grid when not measured. */
  frontBounds?: GlyphBounds;
  backBounds?: GlyphBounds;
}

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
const FRONT = { size: 68, x: -7, y: 0 };
const BACK = { size: 48, x: 19, y: -5 };

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
  const ink = (box: typeof FRONT, b: GlyphBounds) => {
    const k = box.size / 24;
    return { x0: box.x + b.x * k, y0: box.y + b.y * k, x1: box.x + (b.x + b.width) * k, y1: box.y + (b.y + b.height) * k };
  };
  const f = ink(FRONT, spec.frontBounds ?? WHOLE_GRID);
  const b = ink(BACK, spec.backBounds ?? WHOLE_GRID);
  const x0 = Math.floor(Math.min(0, f.x0 - SHADOW.left, b.x0));
  const y0 = Math.floor(Math.min(0, f.y0 - SHADOW.top, b.y0));
  const x1 = Math.ceil(Math.max(FRAME, f.x1 + SHADOW.right, b.x1));
  const y1 = Math.ceil(Math.max(FRAME, f.y1 + SHADOW.bottom, b.y1));
  const size = Math.max(x1 - x0, y1 - y0);
  // The short side grows evenly about its middle.
  return [x0 - (size - (x1 - x0)) / 2, y0 - (size - (y1 - y0)) / 2, size, size];
}

const place = (box: { size: number; x: number; y: number }) =>
  `translate(${box.x} ${box.y}) scale(${box.size / 24})`;

/** One theme of the icon, as a Figma-style glass SVG. */
export function makeGlassIcon(spec: GlassIconSpec, theme: GlassTheme): string {
  const t = THEME[theme];
  const back = `<path transform="${place(BACK)}" d="${spec.back}" fill="url(#gi_grad)"/>`;
  const front = `<path transform="${place(FRONT)}" d="${spec.front}"`;
  // The effect region Figma gives a glass shape: its box, and room for the shadow.
  const fx = FRONT.x - 6;
  const fy = FRONT.y - 6;
  const fw = FRONT.size + 14;
  const fh = FRONT.size + 14;
  // The gradient is in the back path's own space (userSpaceOnUse takes the
  // path's transform), so its ends are on the icon's 24px grid.
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
    `${front} fill="${t.fill}" fill-opacity="${t.fillOpacity}"/></g>` +
    `<defs>` +
    `<filter id="gi_dii" x="${fx}" y="${fy}" width="${fw}" height="${fh}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feFlood flood-opacity="0" result="BackgroundImageFix"/>` +
    `<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>` +
    t.effects.replace(/\n/g, '') +
    `</filter>` +
    `<clipPath id="gi_bgclip" transform="translate(${-fx} ${-fy})">${front}/></clipPath>` +
    `<linearGradient id="gi_grad" x1="${gx(t.line.x1)}" y1="${gy(t.line.y1)}" x2="${gx(t.line.x2)}" y2="${gy(t.line.y2)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>` +
    `</defs></svg>`
  );
}
