/**
 * GLASS ICON MAKER — a MingCute glyph, made into a glass icon in the house
 * style, dark and light, on the set's own 64px grid.
 *
 * The recipe is read off the existing glass icons (assets/glass-icons/, e.g.
 * "General - Mail"): a GRADIENT BACK shape set up and to the right, and the
 * glyph in front, down and to the left, as FROSTED GLASS — a translucent blue
 * fill with a drop shadow and two inner glows, over a background blur of the
 * back shape. Each theme has its own fill, gradient and effects, as there.
 *
 * The output is the same Figma-export shape the set ships as — a
 * `foreignObject` blur and a `_dii_` filter group — so it goes through the
 * same portable-glass fix (src/figmaGlass.ts) as every other glass icon, and
 * every generated icon is the same size: the glyph always fills the same
 * front square.
 */

export type GlassBack = 'square' | 'circle' | 'glyph';
export type GlassTheme = 'dark' | 'light';

export interface GlassIconSpec {
  /** The glyph in front, on MingCute's 24px grid. */
  front: string;
  /** The back shape: a rounded square, a circle, or the glyph itself (filled). */
  back: GlassBack;
  /** The filled glyph, for `back: 'glyph'`. Defaults to `front`. */
  backGlyph?: string;
}

/**
 * The glyph's 24px grid, mapped into the 64px icon. MingCute keeps about 2px
 * of its grid clear, so at 2.35 a glyph's own ink spans about 47px — the front
 * glass of the set's own icons (Mail's is 54 wide including its bleed).
 */
const SCALE = 2.35;
const FRONT_AT = [0, 7] as const;
const BACK_AT = [7.6, 0] as const;

const THEME = {
  dark: {
    fill: '#70A1FF',
    fillOpacity: 0.3,
    stops: [
      ['#1514A4', 0],
      ['#0B5FFF', 0.485577],
      ['#47FFFC', 1],
    ],
    line: { x1: 55.06, y1: 5.3, x2: 34.9, y2: 50 },
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
    stops: [
      ['#1514A4', 0],
      ['#0B5FFF', 0.442308],
      ['#0FFFFC', 1],
    ],
    line: { x1: 17.74, y1: 45.63, x2: 42.81, y2: 2.15 },
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

/** Back shapes, in the 64px icon's own coordinates — the up-and-right square. */
const BACKS: Record<Exclude<GlassBack, 'glyph'>, string> = {
  square: 'M22 2H52A10 10 0 0 1 62 12V42A10 10 0 0 1 52 52H22A10 10 0 0 1 12 42V12A10 10 0 0 1 22 2Z',
  circle: 'M37 2A25 25 0 1 1 37 52A25 25 0 1 1 37 2Z',
};

const place = ([x, y]: readonly [number, number]) => `translate(${x} ${y}) scale(${SCALE})`;

/** One theme of the icon, as a Figma-style glass SVG. */
export function makeGlassIcon(spec: GlassIconSpec, theme: GlassTheme): string {
  const t = THEME[theme];
  const back =
    spec.back === 'glyph'
      ? `<path transform="${place(BACK_AT)}" d="${spec.backGlyph ?? spec.front}" fill="url(#gi_grad)"/>`
      : `<path d="${BACKS[spec.back]}" fill="url(#gi_grad)"/>`;
  const front = `<path transform="${place(FRONT_AT)}" d="${spec.front}"`;
  // The effect region Figma gives a glass shape: its box, and room for the shadow.
  const fx = -6;
  const fy = 3;
  const fw = 72;
  const fh = 68;
  const stops = t.stops
    .map(([c, o]) => `<stop${o ? ` offset="${o}"` : ''} stop-color="${c}"/>`)
    .join('');
  return (
    `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">` +
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
    `<linearGradient id="gi_grad" x1="${t.line.x1}" y1="${t.line.y1}" x2="${t.line.x2}" y2="${t.line.y2}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>` +
    `</defs></svg>`
  );
}
