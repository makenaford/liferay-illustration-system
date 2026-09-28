import { COLORS as SET_COLORS, colorsDark as SET_DARK, colorsLight as SET_LIGHT, type IllustrationColor } from './colors.generated.ts';
import type { Grad, Tokens } from './tokens.ts';
import { paletteDark, paletteLight } from './palette.generated.ts';

/**
 * THE COLOURS A DESIGNER PICKS FROM — the illustration colour set, plus
 * gradients, behind one kind of name: a `tone` string on an element.
 *
 * A tone resolves, in order, as a semantic name (`primary`, `success`…,
 * see `render.ts`), a gradient here, a colour from the illustration set,
 * and last a key from the older Sites palette — kept only so documents
 * made before the illustration set still draw as they did.
 */

/**
 * Black and White: the two text inks the builder sets type in — light's text
 * colour and dark's — as colours to pick, the same in both themes. Where
 * `primary` follows the theme, these stay put: white text on a dark card in
 * a light illustration, say.
 */
const TEXT_INKS: IllustrationColor[] = [
  { key: 'text-black', label: 'Black', group: 'Text', light: '#262C37', dark: '#262C37' },
  { key: 'text-white', label: 'White', group: 'Text', light: '#F0F1F5', dark: '#F0F1F5' },
];
export const COLORS: IllustrationColor[] = [...TEXT_INKS, ...SET_COLORS];
const colorsLight: Record<string, string> = { ...SET_LIGHT, ...Object.fromEntries(TEXT_INKS.map((c) => [c.key, c.light])) };
const colorsDark: Record<string, string> = { ...SET_DARK, ...Object.fromEntries(TEXT_INKS.map((c) => [c.key, c.dark])) };

/** An illustration-set colour in one scheme, or undefined for another name. */
export function colorOf(key: string, scheme: 'light' | 'dark'): string | undefined {
  return (scheme === 'light' ? colorsLight : colorsDark)[key];
}

/** The same value in the illustration set, by key, for semantic tokens. */
export const setColor = (key: string) => {
  const light = colorsLight[key];
  const dark = colorsDark[key];
  if (!light || !dark) throw new Error(`No illustration colour "${key}"`);
  return { light, dark };
};

export interface GradientToken {
  key: string;
  label: string;
  /** The gradient in a scheme — a function of the tokens, so it can follow them. */
  of(tk: Tokens): Grad;
}

/**
 * Gradients a tone can name. `gradient-primary` runs the set's blues left to
 * right — `Primary Dark` into `Primary` into `Aqua`, at the cursor artwork's
 * 61% — so text and rules read along it; `gradient-brand` is the brand
 * gradient the buttons and pills already use.
 */
export const GRADIENTS: GradientToken[] = [
  {
    key: 'gradient-primary',
    label: 'Primary gradient',
    of: (tk) => {
      const c = tk.name === 'light' ? colorsLight : colorsDark;
      return {
        angle: 90,
        stops: [
          { color: c['primary-dark'], offset: 0 },
          { color: c['base-primary'], offset: 0.606 },
          { color: c['base-aqua'], offset: 1 },
        ],
      };
    },
  },
  {
    key: 'gradient-brand',
    label: 'Brand gradient',
    of: (tk) => ({ angle: tk.brandGradient.angle, stops: tk.brandGradient.stops }),
  },
];

export const gradientOf = (key: string) => GRADIENTS.find((g) => g.key === key);

/** A CSS preview of a gradient, for swatches in the editor. */
export function gradientCss(g: Grad): string {
  const stops = g.stops.map((s, i, all) => {
    const at = s.offset ?? (all.length > 1 ? i / (all.length - 1) : 0);
    return `${s.color} ${Math.round(at * 1000) / 10}%`;
  });
  return `linear-gradient(${g.angle}deg, ${stops.join(', ')})`;
}

/** Semantic tones, in the order a designer reaches for them. */
export const SEMANTIC = [
  'primary',
  'muted',
  'subtle',
  'onAccent',
  'accent',
  'accentSoft',
  'product',
  'success',
  'warning',
  'alert',
  'danger',
  'info',
] as const;

/** What a tone name paints with in a scheme: a colour, a gradient, or nothing. */
export type Paint = { color: string } | { gradient: Grad } | null;

export function paintOf(tk: Tokens, tone: string | undefined): Paint {
  if (!tone) return null;
  const semantic: Record<string, string> = {
    primary: tk.text.primary,
    muted: tk.text.muted,
    subtle: tk.text.subtle,
    onAccent: tk.text.onAccent,
    accent: tk.accent.base,
    accentSoft: tk.accent.soft,
    // `soft` is what icons called it before they took palette colours.
    soft: tk.accent.soft,
    product: tk.accent.product,
    success: tk.status.success,
    warning: tk.status.warning,
    alert: tk.status.alert,
    danger: tk.status.danger,
    info: tk.status.info,
  };
  if (semantic[tone]) return { color: semantic[tone] };
  const g = gradientOf(tone);
  if (g) return { gradient: g.of(tk) };
  const set = colorOf(tone, tk.name);
  if (set) return { color: set };
  // An older document's Sites-palette key: still drawn, no longer offered.
  const legacy = (tk.name === 'light' ? paletteLight : paletteDark) as Record<string, string>;
  return legacy[tone] ? { color: legacy[tone] } : null;
}

/**
 * DATA COLOURS — the order a chart's series take colours in when none is
 * chosen: Primary, then Purple, then round the rest of the set. A series can
 * pick any colour from the set instead.
 */
export const CHART_COLORS = ['base-primary', 'base-purple', 'base-cyan', 'base-pink', 'base-orange'] as const;

/** Series `i`'s colour: the one it chose, if that is a colour, or its place in `CHART_COLORS`. */
export function chartColor(tk: Tokens, i: number, choice?: string): string {
  if (choice?.startsWith('#')) return choice;
  const picked = paintOf(tk, choice);
  if (picked && 'color' in picked) return picked.color;
  return colorOf(CHART_COLORS[i % CHART_COLORS.length], tk.name)!;
}
