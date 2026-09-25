/**
 * GLASS ICON MAKER — two MingCute icons, made into one glass icon in the
 * house style, dark and light.
 *
 * The recipe is read off the existing glass icons (assets/glass-icons/, e.g.
 * "General - Mail"): a GRADIENT icon behind, up and to the right, and a
 * FROSTED GLASS icon in front, down and to the left — a translucent blue fill
 * with a drop shadow and two inner glows, over a background blur of the one
 * behind. Each theme has its own fill and effects, as there; light mode's
 * gradient is dark mode's, flipped.
 *
 * Sizes follow the house proportions: in an 80px frame, the glass icon is
 * 68px and the one behind it 48px.
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
}

/** The frame, and each icon's box within it — MingCute's 24px grid scaled up. */
export const FRAME = 80;
const FRONT = { size: 68, x: 0, y: FRAME - 68 };
const BACK = { size: 48, x: FRAME - 48, y: 0 };

/** The back icon's gradient, as the dark icons draw it. Light runs it in reverse. */
const DARK_STOPS = [
  ['#1514A4', 0],
  ['#0B5FFF', 0.485577],
  ['#47FFFC', 1],
] as const;
/** Across the back icon's box, as fractions of it: top right to bottom left. */
const DARK_LINE = { x1: 0.85, y1: 0, x2: 0.4, y2: 1 } as const;

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
    fillOpacity: 0.21,
    /** The dark gradient, flipped: the same stops, run the other way. */
    stops: DARK_STOPS,
    line: { x1: DARK_LINE.x2, y1: DARK_LINE.y2, x2: DARK_LINE.x1, y2: DARK_LINE.y1 },
    bgBlur: 4,
    effects: `<feOffset dx="1.3"/><feGaussianBlur stdDeviation="0.65"/><feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.344262 0 0 0 0 1 0 0 0 0.6 0"/>
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
  const gx = (f: number) => BACK.x + BACK.size * f;
  const gy = (f: number) => BACK.y + BACK.size * f;
  const stops = t.stops
    .map(([c, o]) => `<stop${o ? ` offset="${o}"` : ''} stop-color="${c}"/>`)
    .join('');
  return (
    `<svg width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}" fill="none" xmlns="http://www.w3.org/2000/svg">` +
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
