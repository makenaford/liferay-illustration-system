import { paletteDark, paletteLight, type PaletteKey } from './palette.generated.ts';
import { colorsDark, colorsLight } from './colors.generated.ts';

/** A colour from the illustration set (`colors.generated.ts`), in one scheme. */
const setL = (key: string) => colorsLight[key];
const setD = (key: string) => colorsDark[key];

/**
 * TOKENS — the SEMANTIC layer.
 *
 * Two layers, the same split the design system uses:
 *
 *   palette.generated.ts   the RAW palette, generated from the Figma token
 *                          export by `npm run tokens`. Never hand-edited.
 *   this file              what a stage, a card edge or a chart series is
 *                          MADE of, expressed as references into that palette.
 *
 * So a value here is either `p('brand-primary-primary')` — traceable straight
 * back to the design file — or a documented literal from the `Components/*`
 * group, which Figma has not exported yet and which the design system also
 * keeps as literals in `cssVariables.ts`. Those are the only hexes below, and
 * each one says where it came from.
 *
 * Sources, for auditing:
 *
 *   tokens/figma/color.*.tokens.json                 -> palette.generated.ts
 *   tokens/figma/{spacing,radius}.tokens.json        -> SPACE / RADIUS below
 *   src/theme/cssVariables.ts                        the glass + component recipes
 *   src/theme/components.module.css  `.cardRoot[data-surface='glass']`
 *
 * THE GLASS RECIPE, as the site draws it:
 *   fill      linear-gradient(60deg,  Glass Step 01 0%,  Glass Step 02 100%)
 *   hairline  linear-gradient(225deg, Glass Line 01 1%,  Glass Line 02 92%)  1px
 *   blur      backdrop-filter: blur(50px)      (Figma BACKGROUND_BLUR 100)
 *   elevation inset 0 1px 0 lit-edge, then a two-layer cast shadow
 *
 * The correction this encodes: light-mode glass is *translucent*, exactly like
 * dark — `Surfaces/Card BG/Translucent` is white at 10% in BOTH themes. What
 * changes between themes is the tint and the elevation cue, not the material:
 * light tints the sheen and the hairline blue and leans on a real cast shadow;
 * dark tints them white and raises the card with a lit top edge instead.
 */

/** Palette accessor, bound per scheme. Fails loudly on a renamed token. */
function palette(scheme: 'light' | 'dark') {
  const table = scheme === 'light' ? paletteLight : paletteDark;
  return (key: PaletteKey): string => {
    const value = (table as Record<string, string>)[key];
    if (!value) throw new Error(`Unknown palette token: ${key}`);
    return value;
  };
}

const L = palette('light');
const D = palette('dark');

/**
 * How a scheme draws its meshes. Light spreads every bloom wider and paints
 * it fainter, so the tint reaches further across the paper without any one
 * corner reading as a colour. Dark draws them as transcribed.
 */
interface MeshTreatment {
  /** Multiplies each bloom's radii. */
  spread: number;
  /** Multiplies each bloom's opacity. */
  strength: number;
}

const MESH_AS_DRAWN: MeshTreatment = { spread: 1, strength: 1 };
const MESH_LIGHT: MeshTreatment = { spread: 1.4, strength: 0.6 };

/**
 * The design-system meshes, in one scheme's colours. See `MeshName`.
 * `corners` keeps its low bloom at the 0.22 the light stage already shipped
 * with rather than the card's 0.16, so it doubles as the light default.
 */
function meshes(
  P: (key: PaletteKey) => string,
  { spread, strength }: MeshTreatment = MESH_AS_DRAWN,
): Record<MeshName, MeshBloom[]> {
  const treat = (blooms: MeshBloom[]) =>
    blooms.map((b) => ({ ...b, rx: b.rx * spread, ry: b.ry * spread, opacity: b.opacity * strength }));
  const all: Record<MeshName, MeshBloom[]> = {
    /*
     * Circles behind the illustration: a wide primary glow and a brighter,
     * tighter one inside it, both centred. Radii run 1.5 to 1 on y, the
     * canvas's own 560 x 372, so the blooms read as circles, not ovals.
     */
    centered: [
      { x: 0.5, y: 0.52, rx: 0.62, ry: 0.93, color: P('brand-primary-primary'), opacity: 0.3, fade: 0.72 },
      { x: 0.5, y: 0.52, rx: 0.3, ry: 0.45, color: P('brand-primary-lighten-1'), opacity: 0.34, fade: 0.66 },
    ],
    duo: duoBlooms(P('brand-primary-primary'), P('accent-aqua')),
    corners: [
      { x: 0, y: 0, rx: 0.7, ry: 1.3, color: P('brand-primary-primary'), opacity: 0.34, fade: 0.7 },
      { x: 1, y: 0, rx: 0.6, ry: 1.2, color: P('brand-primary-lighten-1'), opacity: 0.26, fade: 0.68 },
      { x: 0.88, y: 1.1, rx: 0.8, ry: 0.9, color: P('brand-primary-primary'), opacity: 0.22, fade: 0.74 },
    ],
    bubble: [
      { x: 0.5, y: 0.34, rx: 0.6, ry: 0.6, color: P('brand-primary-primary'), opacity: 0.45, fade: 0.62 },
      { x: 0.24, y: 0.12, rx: 0.44, ry: 0.44, color: P('accent-product-accent'), opacity: 0.28, fade: 0.66 },
    ],
    'corner-bubble': [
      { x: 0.82, y: 0.08, rx: 0.58, ry: 0.62, color: P('brand-primary-primary'), opacity: 0.48, fade: 0.6 },
      { x: 0.96, y: 0.4, rx: 0.4, ry: 0.4, color: P('accent-product-accent'), opacity: 0.26, fade: 0.68 },
    ],
    // Purple from the top left, aqua answering from the bottom right, and a
    // fainter purple across the top so the two meet in the middle, not a seam.
    'purple-aqua': [
      { x: 0, y: 0, rx: 0.7, ry: 1.1, color: P('accent-purple'), opacity: 0.3, fade: 0.7 },
      { x: 1, y: 1, rx: 0.7, ry: 1.1, color: P('accent-aqua'), opacity: 0.3, fade: 0.7 },
      { x: 0.7, y: -0.1, rx: 0.5, ry: 0.7, color: P('accent-purple'), opacity: 0.14, fade: 0.74 },
    ],
  };
  return Object.fromEntries(
    Object.entries(all).map(([k, v]) => [k, treat(v)]),
  ) as Record<MeshName, MeshBloom[]>;
}

/**
 * Two colours: the brand's primary blue from the top left, a chosen accent
 * answering from the bottom right, and a fainter blue across the top so the
 * two meet in the middle rather than at a seam.
 */
function duoBlooms(primary: string, accent: string): MeshBloom[] {
  return [
    { x: 0, y: 0, rx: 0.7, ry: 1.1, color: primary, opacity: 0.34, fade: 0.7 },
    { x: 1, y: 1, rx: 0.7, ry: 1.1, color: accent, opacity: 0.32, fade: 0.7 },
    { x: 0.7, y: -0.1, rx: 0.5, ry: 0.7, color: primary, opacity: 0.14, fade: 0.74 },
  ];
}

/** The two-colour mesh with a given accent, as a scheme draws it. */
function duo(P: (key: PaletteKey) => string, t: MeshTreatment) {
  return (accent: string) =>
    duoBlooms(P('brand-primary-primary'), accent).map((b) => ({
      ...b,
      rx: b.rx * t.spread,
      ry: b.ry * t.spread,
      opacity: b.opacity * t.strength,
    }));
}

const LIGHT_MESHES = meshes(L, MESH_LIGHT);

/**
 * Dark's meshes as transcribed — except `corners`, whose three blooms are
 * drawn 1.5x stronger. Spread over three corners at 22–34%, it read paler
 * than `centered`, whose two blooms stack in the middle: measured on the
 * dark stage, the strongest 5% of its pixels reached a chroma of 61 against
 * centered's 87. At 1.5x they reach 85, so the two backgrounds are the same
 * blue where each is bluest.
 */
const DARK_CORNERS_STRENGTH = 1.5;
const DARK_MESHES = (() => {
  const all = meshes(D);
  return { ...all, corners: all.corners.map((b) => ({ ...b, opacity: b.opacity * DARK_CORNERS_STRENGTH })) };
})();

export interface ShadowLayer {
  /** Horizontal offset; omitted, straight down. */
  dx?: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

/**
 * One bloom of a mesh background, in the same terms as the CSS it comes from:
 * `radial-gradient(<rx> <ry> at <x> <y>, <color> <opacity> 0%, transparent
 * <fade>)`. All four geometry values are fractions of the canvas, so a mesh
 * scales with the artboard instead of being re-placed per size.
 */
export interface MeshBloom {
  /** Centre, as a fraction of canvas width/height. May sit outside 0-1. */
  x: number;
  y: number;
  /** Radii, as a fraction of canvas width/height. */
  rx: number;
  ry: number;
  color: string;
  opacity: number;
  /** Where the bloom reaches transparent, as a fraction of its radius. */
  fade: number;
}

/**
 * The mesh backgrounds a document can choose, all three transcribed from the
 * design system at its own percentages:
 *
 *   corners        the `highlighted` card (`[data-tone='blue']`) — colour in
 *                  the corners, a clean middle for copy
 *   bubble         the hero's `Type=Full Bubble` — one bloom centred a little
 *                  above the middle, answered by violet from the top left
 *   corner-bubble  the hero's `Type=Corner Bubble` — the same light pushed
 *                  into the top right
 *   purple-aqua    not from the design system: `Accent/Purple` and
 *                  `Accent/Aqua` from opposite corners
 *
 * The CSS is identical in both schemes; only the variables it reads change,
 * which is what `meshes()` reproduces.
 */
export type MeshName = 'corners' | 'centered' | 'duo' | 'bubble' | 'corner-bubble' | 'purple-aqua';

/**
 * The backgrounds a designer chooses from. `bubble`, `corner-bubble` and
 * `purple-aqua` are no longer offered, but documents that chose one still
 * draw it.
 */
export const MESH_NAMES: { name: MeshName; label: string }[] = [
  { name: 'corners', label: 'Corners' },
  { name: 'centered', label: 'Centered' },
  { name: 'duo', label: 'Two colors' },
];

/** A gradient stop, as a colour plus optional alpha and position. */
export interface Stop {
  color: string;
  opacity?: number;
  /** 0-1 along the gradient line. Defaults to even distribution. */
  offset?: number;
}

/** A gradient expressed the way CSS states it: an angle and its stops. */
export interface Grad {
  /** CSS angle in degrees — 0 points up, increasing clockwise. Unused by a radial gradient. */
  angle: number;
  stops: Stop[];
  /**
   * Makes it a CSS `radial-gradient(<rx> <ry> at <cx> <cy>, …)`, every value a
   * fraction of the box: an ellipse `rx` of its width by `ry` of its height,
   * centred at (`cx`, `cy`).
   */
  radial?: { cx: number; cy: number; rx: number; ry: number };
}

/**
 * A SURFACE — everything that makes a card look the way it does, as data.
 *
 * Replaces the hard-coded recipes that used to live inside `GlassPanel` and
 * `SubCard`. Both now render whichever spec they are handed, so adding a
 * surface is a token entry rather than a new branch in a primitive, and the
 * whole set can be compared side by side in one file.
 */
export interface SurfaceSpec {
  /** Omit for no fill at all — the `outline` surface. */
  fill?: Grad;
  /** The 1px edge. */
  line?: Grad & { width?: number };
  /** Cast shadow, outermost layer first. */
  shadow?: ShadowLayer[];
  /** `inset 0 1px 0` — how a raised surface catches light on a dark canvas. */
  litEdge?: { color: string; opacity: number };
  /**
   * Inset shadows, CSS `box-shadow: inset` — light falling inside the card
   * from its top edge, softer and deeper than `litEdge`. Outermost first.
   */
  inset?: ShadowLayer[];
  /** Backdrop blur in CSS px. 0 or omitted means the surface is not glass. */
  blur?: number;
  /**
   * How much of the blur covers what is beneath, 0–1. Omitted, it is frosted
   * right over; below 1, the glass is see-through, what is beneath showing
   * sharp under the blur. See `backdropPane`.
   */
  blurOpacity?: number;
  /** Recessed surfaces darken instead of lifting; skips the frosted pane. */
  recessed?: boolean;
}

/** What a hero panel draws when it names no surface. */
export const PANEL_SURFACE = 'glass-background';

export type SurfaceName =
  | 'glass-background'
  | 'glass-default'
  | 'glass-blue'
  | 'sunken'
  | 'glass-highlighted'
  | 'glass-highlighted-over-dark'
  | 'glass-highlighted-over-light'
  | 'gradient'
  | 'solid'
  | 'outline';

/**
 * THE GLASS SET — the five surfaces a card can take, every one of them glass
 * (a frosted pane over what is behind). `gradient`, `solid` and `outline` are
 * not glass and are for buttons and controls only.
 */
export const GLASS_SURFACES = ['glass-background', 'glass-default', 'glass-blue', 'sunken', 'glass-highlighted'] as const;
export type GlassSurface = (typeof GLASS_SURFACES)[number];
/**
 * The Figma highlighted pair, kept as they are drawn there (985:15154 and
 * 985:14729): each draws its own recipe in either theme and with either
 * text, where Highlighted follows what the card sits over.
 */
export const FIXED_SURFACES = ['glass-highlighted-over-dark', 'glass-highlighted-over-light'] as const;
/** What the builder calls each one. */
export const SURFACE_LABELS: Record<SurfaceName, string> = {
  'glass-background': 'Background',
  'glass-default': 'Flat',
  'glass-blue': 'Blue tinted',
  sunken: 'Sunken',
  'glass-highlighted': 'Highlighted',
  'glass-highlighted-over-dark': 'Highlighted over dark',
  'glass-highlighted-over-light': 'Highlighted over light',
  gradient: 'Gradient',
  solid: 'Solid',
  outline: 'Outline',
};

export interface Tokens {
  name: 'dark' | 'light';

  /** The surface set. See `SurfaceSpec`. */
  surfaces: Record<SurfaceName, SurfaceSpec>;

  stage: {
    /** `Surfaces/Page BG base/Default`. */
    bg: string;
    /**
     * Corner mesh. Transcribed from the design system's `highlighted` card
     * (`components.module.css`, `[data-tone='blue']`), which is the same
     * treatment at card scale: the corners carry the colour and the middle
     * stays clean, so copy can sit on it. Empty means "no mesh".
     */
    mesh: MeshBloom[];
    /** The meshes a document can opt into with `Doc.background`. */
    meshes: Record<MeshName, MeshBloom[]>;
    /** `duo` with the document's own accent colour. See `Doc.backgroundAccent`. */
    duo: (accent: string) => MeshBloom[];
    /** Ambient bloom, from `Components/Gradient Card`. */
    washColor: string;
    washOpacity: number;
    glowColor: string;
    glowOpacity: number;
    glowBlur: number;
  };

  /** The glass card. See the recipe in this file's header. */
  glass: {
    /** `Components/Glass Card/Glass Step 01` — the 60° gradient's first stop. */
    fillFrom: string;
    fillFromOpacity: number;
    /** `Glass Step 02` — identical in both themes. */
    fillTo: string;
    fillToOpacity: number;
    /** `Components/Glass Line/01` — the 225° hairline's first stop. */
    lineFrom: string;
    lineFromOpacity: number;
    /** `Glass Line/02`. */
    lineTo: string;
    lineToOpacity: number;
    /** The lit top edge that raises glass on dark. Zero opacity in light. */
    litEdge: string;
    litEdgeOpacity: number;
    /** Two-layer cast shadow, outermost first. */
    shadow: ShadowLayer[];
    /** CSS blur radius; an SVG `stdDeviation` is half this. */
    backdropBlur: number;
  };

  /** The other three card surfaces the site draws. */
  surface: {
    /** `Surfaces/Card BG/Grey` — the opaque `static` card. */
    grey: string;
    /** `Surfaces/Card BG/Blue` — the tinted card. */
    blue: string;
    blueOpacity: number;
    /** `Surfaces/Card BG/Translucent` — white at 10%, both themes. */
    translucent: string;
    translucentOpacity: number;
    /** `card-static-line` — a third the strength of glass's hairline. */
    staticLine: string;
    staticLineOpacity: number;
  };

  accent: {
    /** `Brand/Primary/Primary`. */
    base: string;
    /** `Accent/Primary Blue Accent`. */
    soft: string;
    /** Hero glyph sweep: indigo, brand blue, aqua. */
    gradient: [string, string, string];
    /** `Accent/Product Accent` — the purple. */
    product: string;
  };

  /**
   * The semantic statuses. Success, warning, alert and danger follow the
   * illustration colour set's Green, Yellow, Orange and Red — the same value
   * in both schemes, as the set defines them. Info is the older `Accent/Aqua`.
   */
  status: {
    success: string;
    warning: string;
    alert: string;
    danger: string;
    info: string;
    /**
     * Text drawn ON a filled status chip. Every status colour is light
     * enough that white text on it fails contrast, so this is dark in both
     * schemes, while `text.onAccent` (on the much darker brand blue) is not.
     */
    onStatus: string;
  };

  /**
   * The scheme's neutral "ink" — the single colour every decorative neutral
   * tint is drawn from at low opacity: skeleton bars, progress tracks, chart
   * grid lines, the `static` card's hairline, and light mode's cast shadows.
   *
   * It is one token because those things must agree; when they were eight
   * separate literals they drifted, and `#101828` in particular is not in the
   * palette at all — it is light mode's shadow ink, which the primitives were
   * copying by hand.
   */
  neutral: {
    ink: string;
    /** Sits on a saturated fill (a toggle knob on the accent gradient). */
    onFill: string;
  };

  text: {
    /** `Surfaces/Text/Primary`. */
    primary: string;
    /** `Surfaces/Text/Secondary`. */
    muted: string;
    /** `Surfaces/Text/Tertiary`. */
    subtle: string;
    onAccent: string;
  };

  chart: {
    primary: string;
    /**
     * The second series in a comparison chart. Far enough from `secondary`
     * to read as a different thing at bar width — `accent/soft` is only one
     * step off the primary in light mode and the two bars merge.
     */
    compare: string;
    secondary: string;
    gridLine: string;
    gridLineOpacity: number;
    /** The line chart's own rules — see `lineChart`. The bar chart keeps `gridLine`. */
    lineGridLine: string;
    lineGridLineOpacity: number;
  };

  /**
   * The brand gradient on buttons and action pills — the `Spotlight Cards`
   * "Gradient Blue" fill in the Marketing UI Assets file (node 210:16284):
   * cyan into `Brand/Primary` at 218°, the cyan held to 17.7% and the blue
   * reached by 47.9%, so most of the pill is solid brand blue with the cyan
   * lighting its top-right corner. A 1px white hairline edges it.
   *
   * The cyan, #1CDDFF, is the Figma value itself: it is not a step of the
   * generated palette (`Accent/Aqua` is #00E0DC), so it is written here with
   * its source rather than rounded to a neighbour.
   *
   * This replaced a blue-into-purple pair taken from `GradientText`; the
   * illustrations' own component library is the closer authority for them.
   * Kept separate from `accent.gradient`, which paints data (chart bars,
   * connectors) rather than brand moments.
   */
  brandGradient: Grad & { line: string };

  /**
   * Component recipes, transcribed from `componentTokens()` in the design
   * system's `src/theme/cssVariables.ts`. These are the `Components/*` Figma
   * group, which is the one colour group still absent from `tokens/figma/` —
   * so they are literals there too, and are mirrored here the same way.
   */
  component: {
    button: {
      /** `Components/Button Outline/text`. */
      outlineText: string;
      /** `Components/Button Outline/line-stp-01`. */
      outlineLine: string;
      /** `bg-step-01` / `-02` — the two stops of the outline button's sheen. */
      glassFrom: string;
      glassTo: string;
      /** `Components/Glass Card/shadow` — the 6px ambient glow. */
      ambientGlow: string;
    };
    label: {
      /** `Components/Label/lab-tonal-bg` / `-text`. */
      tonalBg: string;
      tonalText: string;
      /** The gradient variant is a RING, not a fill: transparent inside. */
      ringFrom: string;
      ringTo: string;
    };
    /**
     * The input field. Both themes share radius 6, a 1px hairline at 20%
     * and an `inset 0 4px 4px` black 25% shadow, with regular-weight text.
     *
     * Light is the `Input` component in the Marketing UI Assets file (node
     * 472:16567): white at 20%, a Brand/Primary hairline, ink in
     * `surfaces-text-secondary` (#363E4C). Dark is black at 6% under a white hairline, with light ink.
     */
    /**
     * The chat bubble — the `Chat Bubble` component in the Marketing UI
     * Assets file (node 268:5169). Dark is the file: the receiver white at 20%
     * under a white 20% hairline, the sender `Blue Light` (#70A2FF) at 20%
     * under the same at 20%, white ink. The file has no light version.
     */
    chat: {
      receiverFill: string;
      receiverFillOpacity: number;
      receiverLine: string;
      receiverLineOpacity: number;
      senderFill: string;
      senderFillOpacity: number;
      senderLine: string;
      senderLineOpacity: number;
      /** Name and message. */
      ink: string;
    };
    input: {
      fill: string;
      fillOpacity: number;
      line: string;
      lineOpacity: number;
      /** Opacity of the black inset shadow. */
      shadowOpacity: number;
      /** Icon and placeholder. */
      ink: string;
    };
    /**
     * The glass disc behind each end of a connector — the Marketing UI
     * Assets connector (node 255:4661): a 23.75px circle under the end dot,
     * so the line reads as plugged in rather than stopping in mid-air.
     */
    connector: { haloFill: string; haloFillOpacity: number; haloLine: string; haloLineOpacity: number };
    chip: {
      /** `Button Outline/line-stp-01` into `Accent/Primary Blue Accent`. */
      ringFrom: string;
      ringTo: string;
      /** Selected chips take `Surfaces/Card BG/Blue`, and lose the ring. */
      selectedBg: string;
      selectedBgOpacity: number;
    };
  };

  radius: { panel: number; card: number; pill: number };

  font: {
    family: string;
    weightRegular: number;
    weightSemibold: number;
    weightBold: number;
  };
}

/**
 * CONFIRMED against the design system: `src/theme/theme.ts` sets exactly this
 * stack. Previously a guess, because the Figma exports had every string
 * outlined to paths and the typeface was undetectable.
 */
/**
 * Light mode's neutral ink. Not a palette token — it is the colour the design
 * system's own light shadows and hairlines are specified in, so it lives here
 * as one named constant rather than as a literal in nine places.
 */
const INK = '#101828';

/** `Spotlight Cards` Gradient Blue's cyan — see `Tokens.brandGradient`. */
const BRAND_CYAN = '#1CDDFF';

const FONT_FAMILY =
  '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const font = {
  family: FONT_FAMILY,
  weightRegular: 400,
  weightSemibold: 600,
  weightBold: 700,
};

/** `.cardRoot[data-align]` draws 8; `radius.tokens.json` calls the set 9. */
const radius = { panel: 8, card: 8, pill: 999 };

/**
 * The backdrop blur, in CSS px — `backdropPane` halves it for the Gaussian
 * sigma, so this is 10 in SVG terms.
 *
 * The design system ships `--sds-glass-blur: 50px`, and 50 is right over a
 * live page, where the blur is destroying real detail behind the card. Over an
 * illustration's smooth stage there is no detail to destroy, so a 50px blur
 * only softened the glow bleeding through the pane into an even wash and cost
 * a wide filter region on every card. Now that glass frosts what is really
 * beneath it — screenshots, photos — there is detail to soften, and 28
 * softens it enough for text without smearing the card into a haze.
 */
const GLASS_BLUR = 28;

/**
 * How far any cast shadow may reach past its card: offset plus blur, in px.
 * Matches the 20px a card keeps from the canvas edge (the Image base card
 * guide), so no shadow is clipped there. Every `shadow` below stays within it.
 */
export const SHADOW_REACH = 20;

/** The most any cast shadow is blurred, in px — kept tight so a shadow reads as a contact glow, not a haze. */
export const SHADOW_BLUR_MAX = 10;

/**
 * GLASS HIGHLIGHTED — the one card that matters more, and glass over a
 * screenshot: the Mockup template's panels. Two of them, named for what they
 * sit over, from the `surface test` section of the Marketing UI Assets Repo.
 * Both are `Blank Card`s drawn at 1.694x; the values here are at 1x (the
 * file's 84.7px blur is 50, its 3px inner shadow 1.8).
 *
 *   over light  985:14729 — a DARKENING wash: a radial from near the
 *               top-left, black 20% to `#0B5FFF` 20%
 *   over dark   985:15154 — a LIGHTENING wash: the same radial, white 20%
 *               to `#ADC9FF` 20%
 *
 * Shared: a white hairline that fades out a third of the way along its
 * 159° axis and back in (100% → 0 → 100%), so it catches light at two
 * opposite corners; a white 45% inner shadow 1.8px down with a 1.8px blur;
 * a 50px backdrop blur; and a blue glow cast 2px down and right, 10px blur,
 * `#0B5FFF` at 50% — set on both by the design team in place of the file's
 * original glow, which was switched off.
 *
 * Each draws the same in either theme — a card over a white screenshot on
 * a dark stage still wants `over-light`. `glass-highlighted` is whichever
 * suits the theme: over dark in dark, over light in light.
 *
 * Figma's radial is a tilted ellipse; this is its axis-aligned extent.
 */
const HIGHLIGHTED_BLUR = 50;
const highlightedSpec = (from: { color: string; opacity: number }, to: { color: string; opacity: number }): SurfaceSpec => ({
  fill: { angle: 0, radial: { cx: 0.219, cy: 0.175, rx: 1.163, ry: 0.846 }, stops: [from, to] },
  line: {
    angle: 159,
    stops: [
      { color: '#FFFFFF', opacity: 1, offset: 0 },
      { color: '#FFFFFF', opacity: 0, offset: 0.33 },
      { color: '#FFFFFF', opacity: 1, offset: 1 },
    ],
  },
  // A blue glow, down and right: 2px / 2px, 10px blur, `#0B5FFF` at 50%.
  // Figma's spread is off on the card, and an SVG drop shadow has none.
  shadow: [{ dx: 2, dy: 2, blur: 10, color: '#0B5FFF', opacity: 0.5 }],
  inset: [{ dy: 1.8, blur: 1.8, color: '#FFFFFF', opacity: 0.45 }],
  blur: HIGHLIGHTED_BLUR,
});
const HIGHLIGHTED = {
  overLight: highlightedSpec({ color: '#000000', opacity: 0.2 }, { color: '#0B5FFF', opacity: 0.2 }),
  overDark: highlightedSpec({ color: '#FFFFFF', opacity: 0.2 }, { color: '#ADC9FF', opacity: 0.2 }),
};
/** `Glass Step 02` — the same in both themes. */
const STEP_02 = { color: '#8C96A9', opacity: 0.03 };

/**
 * GLASS BACKGROUND — the large pane a composition sits on, and every hero
 * panel's default.
 *
 * LIGHT is FROSTED WHITE, chosen from the Glass Background Studies over the
 * Figma pane (905:19573: white 30% to 15%, a 20% blue hairline, a faint blue
 * glow), which read as a faint tint the cards sank into. Much whiter, it
 * gives what sits on it something to stand off:
 *
 *   - fill white 62% to 38%, from the top centre to just right of the
 *     bottom centre (171° across the box), as the file's runs
 *   - a hairline from white at the top to `#0B5FFF` 25% at the bottom, and
 *     a white lit top edge
 *   - a soft white inset glow, 60%, 3px down with a 6px blur
 *   - a two-layer lift: navy 10%, 14px down with a 36px blur, and a blue
 *     10% contact shadow, 2px down with a 6px blur
 *   - `GLASS_BLUR`, like the rest of the glass
 *
 * DARK is its own design (Figma 905:19993), not the light one dimmed: a
 * faint white wash from the top-right corner, white 20% to 5% on a 40% layer
 * — 8% to 2% as drawn — under a white hairline fading from 24% to 12%
 * across the same corner. No inset glow and no shadow: the file's is black
 * 13% with no offset and no blur, which lies wholly under the pane and draws
 * nothing. Its 11.2px Figma blur is drawn at `GLASS_BLUR`. Figma's radial is
 * a tilted ellipse; this is its axis-aligned extent.
 */
/**
 * The light glass set's radial, from near the top-left corner: centre at
 * (20.3, 2.9) of the 146 x 73 rectangle, reaching 197 x 77 px.
 */
const LIGHT_GLASS_RADIAL = { cx: 0.139, cy: 0.039, rx: 1.35, ry: 1.05 };
/**
 * The light glass set's hairline. Figma draws it `#0B5FFF` at 40%; drawn
 * that way here it read as a heavy blue rule round every card — stronger
 * than the file shows it, over a pale stage with no frost to soften it — so
 * it is halved. One value for all three, so the set stays one material.
 */
const LIGHT_GLASS_LINE = { angle: 180, stops: [{ color: '#0B5FFF', opacity: 0.2 }, { color: '#0B5FFF', opacity: 0.2 }] };
const glassBackground = {
  light: {
    fill: { angle: 171, stops: [{ color: '#FFFFFF', opacity: 0.62 }, { color: '#FFFFFF', opacity: 0.38 }] },
    line: { angle: 180, stops: [{ color: '#FFFFFF', opacity: 1 }, { color: '#0B5FFF', opacity: 0.25 }] },
    litEdge: { color: '#FFFFFF', opacity: 1 },
    // Was 14px down / 36px blur — cut to SHADOW_REACH, then to SHADOW_BLUR_MAX.
    shadow: [
      { dy: 4, blur: 10, color: '#0B2E7A', opacity: 0.1 },
      { dy: 2, blur: 6, color: '#0B5FFF', opacity: 0.1 },
    ],
    inset: [{ dy: 3, blur: 6, color: '#FFFFFF', opacity: 0.6 }],
    blur: GLASS_BLUR,
  },
  dark: {
    fill: {
      angle: 0,
      radial: { cx: 1, cy: 0.02, rx: 1.31, ry: 1.51 },
      stops: [{ color: '#FFFFFF', opacity: 0.08 }, { color: '#FFFFFF', opacity: 0.02 }],
    },
    line: { angle: 199, stops: [{ color: '#FFFFFF', opacity: 0.24 }, { color: '#FFFFFF', opacity: 0.12 }] },
    blur: GLASS_BLUR,
  },
} satisfies Record<'light' | 'dark', SurfaceSpec>;

export const dark: Tokens = {
  name: 'dark',
  /**
   * THE SURFACE SET — three glass elevations plus five specials.
   *
   * The three glass steps differ only in how much light they catch: fill
   * opacity, hairline strength, shadow depth and lit edge all rise together,
   * because that is what reads as "further forward" rather than "different
   * material". The colours are still `Glass Step 01/02` and `Glass Line 01/02`
   * from the design system, and 01/03 still step down and up from 02.
   *
   * THE OPACITIES ARE NOT THE DESIGN SYSTEM'S, and that is deliberate.
   *
   * The shipped values (`glass2` at 5.5% fill in dark, 10% in light) are for a
   * `backdrop-filter` sitting over a live web page — photography, a hero
   * video, a busy grid. There the blur has something to chew on and 5.5% of
   * white is plenty. An illustration's stage is a smooth gradient: blurring it
   * is very nearly a no-op, so at the shipped opacity the card had nothing to
   * catch and read as a faint rectangle rather than as glass.
   *
   * These are roughly 1.8x the shipped fills with the hairlines raised to
   * match. The originals are kept beside each value so the divergence is one
   * edit to undo, not an archaeology problem.
   */
  surfaces: {
    /** Basic: the everyday card — and a tile nested inside one. No shadow. Was glass1 (and glass2). */
    'glass-default': {
      // DS: 0.03 / 0.02, line 0.1 / 0.07. The line was raised to 0.14 / 0.09,
      // then halved with the rest of the glass hairlines, which drew too strong.
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.07 }, { color: STEP_02.color, opacity: 0.035 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.07 }, { color: '#FFFFFF', opacity: 0.045 }] },
      blur: GLASS_BLUR,
    },
    /** Blue tinted: the flat card washed in brand blue, white text on it. */
    'glass-blue': {
      fill: { angle: 60, stops: [{ color: '#3B7BFF', opacity: 0.28 }, { color: '#0B5FFF', opacity: 0.14 }] },
      line: { angle: 225, stops: [{ color: '#9EC0FF', opacity: 0.3 }, { color: '#FFFFFF', opacity: 0.08 }] },
      blur: GLASS_BLUR,
    },
    /** Highlighted: the one card that matters more, raised. See HIGHLIGHTED. */
    'glass-highlighted': HIGHLIGHTED.overDark,
    'glass-highlighted-over-dark': HIGHLIGHTED.overDark,
    'glass-highlighted-over-light': HIGHLIGHTED.overLight,
    /** Glass background: the large pane a composition sits on — see GLASS BACKGROUND. */
    'glass-background': glassBackground.dark,
    /**
     * `Blue Gradient` — sampled from the Figma style, not invented.
     *
     * Node 268:7322 in the Marketing UI Assets Repo (the "0 OPEN
     * VULNERABILITIES" card). Reading the render back: it holds `#0b5fff` —
     * `Brand/Primary` exactly — for the first ~35% of the axis, then ramps to
     * `#17aff1`, which is `Accent/Cyan`. So the gradient is two existing
     * tokens, and both ends are bound to them rather than to the sampled
     * hexes.
     *
     * SOLID, not translucent: it is a fill, not glass, so there is no
     * backdrop blur and no hairline. That is the whole difference from the
     * glass surfaces, and it is why the card reads as a block of colour.
     */
    gradient: {
      fill: {
        angle: 70,
        stops: [
          { color: D('brand-primary-primary'), offset: 0.35 },
          { color: D('accent-cyan'), offset: 1 },
        ],
      },
      shadow: [{ dy: 4, blur: 10, color: D('brand-primary-primary'), opacity: 0.3 }],
    },
    /** Opaque brand blue — a callout that is an action, not a container. */
    solid: {
      fill: { angle: 180, stops: [{ color: '#0B5FFF' }, { color: '#0B5FFF' }] },
      shadow: [{ dy: 4, blur: 10, color: '#0B5FFF', opacity: 0.35 }],
    },
    /** No fill at all — structure without weight. */
    outline: {
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.7 }, { color: '#70A2FF', opacity: 0.7 }] },
    },
    /** Sunken: cut INTO its parent — inputs, log rows, wells. Glass too: it frosts what is behind it. */
    sunken: {
      fill: { angle: 180, stops: [{ color: '#000000', opacity: 0.22 }, { color: '#000000', opacity: 0.18 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.07 }, { color: '#FFFFFF', opacity: 0.04 }] },
      inset: [{ dy: 1, blur: 3, color: '#000000', opacity: 0.35 }],
      blur: GLASS_BLUR,
    },
  },
  stage: {
    bg: D('surfaces-page-bg-base-default'),
    // Dark keeps the blurred-ellipse bloom the original artwork was drawn
    // with; the mesh is a light-canvas treatment.
    mesh: [],
    meshes: DARK_MESHES,
    duo: duo(D, MESH_AS_DRAWN),
    washColor: D('components-gradient-card-blue'),
    washOpacity: 0.28,
    glowColor: D('components-gradient-card-blue'),
    glowOpacity: 0.55,
    glowBlur: 100,
  },
  glass: {
    fillFrom: '#FFFFFF',
    fillFromOpacity: 0.055,
    fillTo: STEP_02.color,
    fillToOpacity: STEP_02.opacity,
    lineFrom: '#FFFFFF',
    lineFromOpacity: 0.16,
    lineTo: '#FFFFFF',
    lineToOpacity: 0.12,
    litEdge: '#FFFFFF',
    litEdgeOpacity: 0.1,
    shadow: [
      { dy: 4, blur: 10, color: '#000000', opacity: 0.28 },
      { dy: 1, blur: 3, color: '#000000', opacity: 0.22 },
    ],
    backdropBlur: GLASS_BLUR,
  },
  surface: {
    grey: D('surfaces-card-bg-grey'),
    blue: D('brand-primary-lighten-2'),
    blueOpacity: 0.05,
    translucent: '#FFFFFF',
    translucentOpacity: 0.1,
    staticLine: '#FFFFFF',
    staticLineOpacity: 0.05,
  },
  accent: {
    base: D('brand-primary-primary'),
    soft: D('accent-primary-blue-accent'),
    gradient: [
      D('components-gradient-card-blue'),
      D('brand-primary-primary'),
      D('accent-aqua'),
    ],
    product: D('accent-product-accent'),
  },
  status: {
    success: setD('base-green'),
    warning: setD('base-yellow'),
    alert: setD('base-orange'),
    danger: setD('base-red'),
    info: D('accent-aqua'),
    onStatus: D('neutral-00'),
  },
  neutral: {
    // Dark tints are white at low alpha — `Action/Neutral/Default`, which is
    // #FFFFFF in both schemes, is that colour by name.
    ink: D('action-neutral-default'),
    onFill: D('action-neutral-default'),
  },

  text: {
    primary: D('surfaces-text-primary'),
    muted: D('surfaces-text-secondary'),
    subtle: D('surfaces-text-tertiary'),
    onAccent: D('action-neutral-inverted'),
  },
  chart: {
    primary: '#FFFFFF',
    secondary: D('brand-primary-primary'),
    compare: D('brand-primary-lighten-3'),
    // `Neutral/02`, solid. In dark it is the step just above the card, so the
    // rules sit behind the data rather than competing with a white series.
    gridLine: D('neutral-02'),
    gridLineOpacity: 1,
    // White at 30%: lighter than the bar chart's rules, so a line chart's
    // grid reads through the glass it sits on.
    lineGridLine: '#FFFFFF',
    lineGridLineOpacity: 0.3,
  },
  brandGradient: {
    angle: 218,
    stops: [
      { color: BRAND_CYAN, offset: 0.177 },
      { color: D('brand-primary-primary'), offset: 0.479 },
    ],
    line: '#FFFFFF',
  },
  component: {
    button: {
      outlineText: D('surfaces-text-primary'),
      outlineLine: 'rgba(255, 255, 255, 0.7)',
      glassFrom: 'rgba(255, 255, 255, 0.1)',
      glassTo: 'rgba(255, 255, 255, 0)',
      ambientGlow: 'rgba(0, 0, 0, 0.08)',
    },
    // Dark: black at 6% under a white hairline at 20%, the same inset
    // shadow. On a fill that dark the ink has to be light, so the icon and
    // placeholder take the muted text colour a placeholder normally has.
    chat: {
      receiverFill: '#FFFFFF',
      receiverFillOpacity: 0.2,
      receiverLine: '#FFFFFF',
      receiverLineOpacity: 0.2,
      senderFill: D('accent-primary-blue-accent'),
      senderFillOpacity: 0.2,
      senderLine: D('accent-primary-blue-accent'),
      senderLineOpacity: 0.2,
      ink: '#FFFFFF',
    },
    input: {
      fill: '#000000',
      fillOpacity: 0.06,
      line: '#FFFFFF',
      lineOpacity: 0.2,
      shadowOpacity: 0.25,
      ink: D('surfaces-text-secondary'),
    },
    label: {
      tonalBg: D('neutral-02'),
      tonalText: D('action-neutral-inverted'),
      ringFrom: D('brand-primary-primary'),
      ringTo: D('accent-product-accent'),
    },
    connector: { haloFill: '#FFFFFF', haloFillOpacity: 0.08, haloLine: '#FFFFFF', haloLineOpacity: 0.12 },
    chip: {
      ringFrom: 'rgba(255, 255, 255, 0.7)',
      ringTo: D('accent-primary-blue-accent'),
      selectedBg: D('brand-primary-lighten-2'),
      selectedBgOpacity: 0.05,
    },
  },
  radius,
  font,
};

/**
 * LIGHT — the same material, not an inversion.
 *
 * `Glass Step 01` goes from white-at-5.5% to `#ADC9FF`-at-10%: the sheen picks
 * up the brand blue instead of plain white, which is what keeps a translucent
 * card from reading as grey haze on a pale ground. `Glass Line` goes blue too
 * (`rgba(111,160,255,·)`), and the lit top edge drops to nothing because on a
 * light canvas the cast shadow is what says "this is raised".
 */
export const light: Tokens = {
  name: 'light',
  /**
   * THE SURFACE SET — three glass elevations plus five specials.
   *
   * The three glass steps differ only in how much light they catch: fill
   * opacity, hairline strength, shadow depth and lit edge all rise together,
   * because that is what reads as "further forward" rather than "different
   * material". The colours are still `Glass Step 01/02` and `Glass Line 01/02`
   * from the design system, and 01/03 still step down and up from 02.
   *
   * THE OPACITIES ARE NOT THE DESIGN SYSTEM'S, and that is deliberate.
   *
   * The shipped values (`glass2` at 5.5% fill in dark, 10% in light) are for a
   * `backdrop-filter` sitting over a live web page — photography, a hero
   * video, a busy grid. There the blur has something to chew on and 5.5% of
   * white is plenty. An illustration's stage is a smooth gradient: blurring it
   * is very nearly a no-op, so at the shipped opacity the card had nothing to
   * catch and read as a faint rectangle rather than as glass.
   *
   * These are roughly 1.8x the shipped fills with the hairlines raised to
   * match. The originals are kept beside each value so the divergence is one
   * edit to undo, not an archaeology problem.
   */
  surfaces: {
    /** Basic: the everyday card — and a tile nested inside one. No shadow. Was glass1 (and glass2). */
    /*
     * THE LIGHT GLASS SET — the named rectangles of Figma 905:19528 (the
     * light Drive Conversions board), one per surface. Default and elevated
     * share a `#0B5FFF` hairline (Figma's 40%, drawn at 20% — see LIGHT_GLASS_LINE),
     * 1px-down, 8px inset glow; they differ in fill and lift. Highlighted is
     * no longer from this board — see HIGHLIGHTED.
     *
     * The blur is NOT the file's. Figma draws the set at 17.5px, and the
     * glass background at 4px (light) and 20px (dark); drawn that way the
     * cards lost the frost that makes them read as glass. They keep the
     * blurs the set had before: `GLASS_BLUR` for default, elevated and the
     * background.
     *
     *   default      barely tinted: a `#0B5FFF` radial, 2% at the top-left
     *                corner to 5%, and a BLUE inset glow at 10%. No shadow.
     *   elevated     the same fill, a WHITE inset glow at 10%, and the
     *                faintest contact shadow, black 3%, 1px right and down.
     *
     * Figma's `1px 1px 2px 1px` shadows have a 1px spread, which an SVG drop
     * shadow cannot; elevated folds it into the blur. Figma's radial is a tilted
     * ellipse; this is its axis-aligned extent. The rectangles' 4px corners
     * are the card's radius, not the surface's, so they are not set here.
     *
     * Was: default `#99BCFF` 21% flat behind a `#0053F0` 10% hairline;
     * elevated white 92% into `#BFD5FF`; highlighted white glass from this
     * board (905:19981, a white 60% to 30% radial and a blue contact
     * shadow), and before that `Glass Card- Light` (665:26612).
     */
    'glass-default': {
      fill: { angle: 0, radial: LIGHT_GLASS_RADIAL, stops: [{ color: '#0B5FFF', opacity: 0.02 }, { color: '#0B5FFF', opacity: 0.05 }] },
      line: LIGHT_GLASS_LINE,
      inset: [{ dy: 1, blur: 8, color: '#0B5FFF', opacity: 0.1 }],
      blur: GLASS_BLUR,
    },
    /** Blue tinted: white glass fading into blue — Figma 905:20194, the old highlighted-blue. */
    'glass-blue': {
      fill: { angle: 0, radial: LIGHT_GLASS_RADIAL, stops: [{ color: '#FFFFFF', opacity: 0.5 }, { color: '#99BCFF', opacity: 0.65 }] },
      line: LIGHT_GLASS_LINE,
      inset: [{ dy: 1, blur: 8, color: '#FFFFFF', opacity: 0.1 }],
      blur: GLASS_BLUR,
    },
    /**
     * Highlighted, as the light theme draws it: the over-light card's edge,
     * glow and blur, its wash white 20% into `#99BCFF` 65% — set in the Glass
     * Surface Styles file (1:164) in place of the over-light card's darkening
     * black-into-blue. The fixed over-light surface keeps that one.
     */
    'glass-highlighted': {
      ...HIGHLIGHTED.overLight,
      fill: { ...HIGHLIGHTED.overLight.fill!, stops: [{ color: '#FFFFFF', opacity: 0.2 }, { color: '#99BCFF', opacity: 0.65 }] },
    },
    'glass-highlighted-over-dark': HIGHLIGHTED.overDark,
    'glass-highlighted-over-light': HIGHLIGHTED.overLight,
    /** Glass background: the large pane a composition sits on — see GLASS BACKGROUND. */
    'glass-background': glassBackground.light,
    /**
     * The same `Blue Gradient`, on the light canvas.
     *
     * Both stops stay bound to their tokens, so light picks up its own
     * `Accent/Cyan` (`#0e98e2`, a deeper cyan that holds against a pale
     * ground) while `Brand/Primary` is shared across both themes.
     */
    gradient: {
      fill: {
        angle: 70,
        stops: [
          { color: L('brand-primary-primary'), offset: 0.35 },
          { color: L('accent-cyan'), offset: 1 },
        ],
      },
      shadow: [{ dy: 4, blur: 10, color: L('brand-primary-primary'), opacity: 0.22 }],
    },
    /** Opaque brand blue — a callout that is an action, not a container. */
    solid: {
      fill: { angle: 180, stops: [{ color: '#0B5FFF' }, { color: '#0B5FFF' }] },
      shadow: [{ dy: 4, blur: 10, color: '#0B5FFF', opacity: 0.24 }],
    },
    /** No fill at all — structure without weight. */
    outline: {
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.7 }, { color: '#0B5FFF', opacity: 0.45 }] },
    },
    /** Sunken: cut INTO its parent — inputs, log rows, wells. Glass too: it frosts what is behind it. */
    // A brand-blue well, deepening downward, under a blue edge fading to light
    // blue — set in the Glass Surface Styles file (1:160).
    sunken: {
      fill: { angle: 180, stops: [{ color: '#0B5FFF', opacity: 0.05 }, { color: '#0B5FFF', opacity: 0.1 }] },
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.2 }, { color: '#99BCFF', opacity: 0.2 }] },
      inset: [{ dy: 1, blur: 3, color: INK, opacity: 0.12 }],
      blur: GLASS_BLUR,
    },
  },
  stage: {
    bg: L('surfaces-page-bg-base-default'),
    /*
     * `Brand/Primary` from the leading corner, `Lighten 1` answering from the
     * trailing top, and a wider, fainter `Brand/Primary` rising from the
     * bottom edge where they meet — the design system's own three-bloom mesh,
     * at the same percentages, spread and softened by `MESH_LIGHT`. None
     * reaches full strength and none has an edge, so what changes across the
     * canvas is the tint, not the colour.
     */
    mesh: LIGHT_MESHES.corners,
    meshes: LIGHT_MESHES,
    duo: duo(L, MESH_LIGHT),
    // The wash is folded into the mesh; the per-document glow stays, quieter,
    // so a composition can still put light where it needs it.
    washColor: L('components-gradient-card-blue'),
    washOpacity: 0,
    glowColor: L('components-gradient-card-blue'),
    glowOpacity: 0.3,
    glowBlur: 100,
  },
  glass: {
    fillFrom: L('components-gradient-card-blue'),
    fillFromOpacity: 0.1,
    fillTo: STEP_02.color,
    fillToOpacity: STEP_02.opacity,
    lineFrom: '#6FA0FF',
    lineFromOpacity: 0.6,
    lineTo: '#6FA0FF',
    lineToOpacity: 0.4,
    // Light takes nothing here — its own shadow does the work.
    litEdge: '#FFFFFF',
    litEdgeOpacity: 0,
    shadow: [
      { dy: 4, blur: 10, color: INK, opacity: 0.08 },
      { dy: 1, blur: 3, color: INK, opacity: 0.06 },
    ],
    backdropBlur: GLASS_BLUR,
  },
  surface: {
    grey: L('surfaces-card-bg-grey'),
    blue: '#E8EEFB', // `Card BG/Blue`'s own hex; the token carries its 25% alpha separately.
    blueOpacity: 0.25,
    translucent: '#FFFFFF',
    translucentOpacity: 0.1,
    staticLine: INK,
    staticLineOpacity: 0.06,
  },
  accent: {
    base: L('brand-primary-primary'),
    soft: L('brand-primary-lighten-1'),
    gradient: [
      L('brand-primary-darken-4'),
      L('brand-primary-primary'),
      L('accent-aqua'),
    ],
    product: L('accent-product-accent'),
  },
  status: {
    success: setL('base-green'),
    warning: setL('base-yellow'),
    alert: setL('base-orange'),
    danger: setL('base-red'),
    info: L('accent-aqua'),
    // The set's own text colour — dark on every status fill.
    onStatus: setL('text'),
  },
  neutral: {
    ink: INK,
    onFill: L('action-neutral-default'),
  },

  text: {
    primary: L('surfaces-text-primary'),
    muted: L('surfaces-text-secondary'),
    subtle: L('surfaces-text-tertiary'),
    onAccent: L('action-neutral-inverted'),
  },
  chart: {
    primary: L('surfaces-text-primary'),
    secondary: L('brand-primary-primary'),
    compare: L('brand-primary-lighten-3'),
    gridLine: L('neutral-02'),
    gridLineOpacity: 1,
    // Unchanged from the bar chart's: white rules would vanish on a pale card.
    lineGridLine: L('neutral-02'),
    lineGridLineOpacity: 1,
  },
  brandGradient: {
    angle: 218,
    stops: [
      { color: BRAND_CYAN, offset: 0.177 },
      { color: L('brand-primary-primary'), offset: 0.479 },
    ],
    line: '#FFFFFF',
  },
  component: {
    button: {
      // `Action/Link/Default Link` = `Brand/Primary/Darken/2`.
      outlineText: L('action-link-default-link'),
      outlineLine: L('accent-primary-blue-accent'),
      glassFrom: 'rgba(187, 210, 255, 0.15)',
      glassTo: 'rgba(187, 210, 255, 0)',
      ambientGlow: 'rgba(173, 201, 255, 0.2)',
    },
    // Light: white at 20% under a Brand/Primary hairline at 20%. The light
    // spec's 6.815 / 4.543 are this recipe drawn at 1.136×, so radius and
    // shadow are kept at 6 / 4 like dark.
    // Light is derived, as the file has none: white at 20% vanishes on a light
    // stage, so the receiver is white at 70% under a faint Brand/Primary
    // hairline, and the sender a Brand/Primary tint, with dark ink.
    chat: {
      receiverFill: '#FFFFFF',
      receiverFillOpacity: 0.7,
      receiverLine: L('brand-primary-primary'),
      receiverLineOpacity: 0.15,
      senderFill: L('brand-primary-primary'),
      senderFillOpacity: 0.12,
      senderLine: L('brand-primary-primary'),
      senderLineOpacity: 0.25,
      ink: L('surfaces-text-primary'),
    },
    input: {
      fill: '#FFFFFF',
      fillOpacity: 0.2,
      line: L('brand-primary-primary'),
      lineOpacity: 0.2,
      shadowOpacity: 0.25,
      ink: L('surfaces-text-secondary'),
    },
    label: {
      // `Brand/Primary/Lighten/5` under `Brand/Primary/Darken/5`.
      tonalBg: L('brand-primary-lighten-5'),
      tonalText: L('brand-primary-darken-5'),
      ringFrom: L('brand-primary-primary'),
      ringTo: L('accent-product-accent'),
    },
    // White reads on a dark card and vanishes on a pale one, so light fills
    // the disc more and edges it in the brand blue.
    connector: { haloFill: '#FFFFFF', haloFillOpacity: 0.7, haloLine: L('brand-primary-primary'), haloLineOpacity: 0.18 },
    chip: {
      ringFrom: L('accent-primary-blue-accent'),
      ringTo: L('accent-primary-blue-accent'),
      selectedBg: '#E8EEFB',
      selectedBgOpacity: 0.25,
    },
  },
  radius,
  font,
};

export const themes = { dark, light };
export type ThemeName = keyof typeof themes;

/**
 * SPACING — `tokens/figma/spacing.tokens.json`, verbatim.
 *
 * The scale's base unit is 2, with a 4 rhythm above 12. Theme-independent, so
 * it sits outside the token sets rather than being duplicated in both.
 */
export const SPACE = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80] as const;

/** `tokens/figma/radius.tokens.json`. */
export const RADIUS = {
  xsm: 2,
  small: 4,
  medium: 8,
  large: 16,
  xlg: 24,
  round: 1000,
} as const;

/**
 * LAYOUT — the illustration-scale defaults.
 *
 * The site's cards pad at 20 and gap at 16-20, but an illustration is a
 * *depiction* of an interface at roughly 60% of life size: the nine reference
 * files pad their tiles at 12 and gap them at 8, which are the same scale two
 * steps down. Those are the defaults here, and both are on the token scale, so
 * a designer who wants the site's own 20/16 just picks them.
 */
export const LAYOUT = {
  /** Inset from a card's edge to its content box. */
  cardPadding: 12,
  /** Space between stacked siblings. */
  gap: 8,
  /** Tighter gap, for label/value pairs and dense rows. */
  gapTight: 4,
  /**
   * Minimum clear space between the drawing and the exported edge, in export
   * pixels. Measured after an `artboard` is scaled into the canvas, because
   * that is the edge a page actually crops against. Glows are exempt: they
   * are meant to bleed.
   */
  canvasInset: 20,
  /** The snap grid. Half the 8-step, so 2, 4, 6 and 12 all land on it. */
  grid: 2,
  /** Offered in the editor's snap control. */
  gridSteps: [1, 2, 4, 8] as const,
} as const;

/** Nearest value on the spacing scale — used when normalising documents. */
export function nearestSpace(n: number): number {
  return SPACE.reduce((best, v) =>
    Math.abs(v - n) < Math.abs(best - n) ? v : best,
  );
}

/*
 * WHICH RECIPE A CARD DRAWS — by the ground it sits on and the colour of its
 * text. Each theme's `surfaces` are its own default pairing: dark draws white
 * text over a dark ground, light dark text over a light one. A card that
 * switches its text (`ink`), or says what it sits over (`over`) — a white
 * screenshot in a dark illustration — takes one of the other two:
 *
 *                 white text                    dark text
 *   dark ground   dark.surfaces                 GLASS_BRIGHT (white glass)
 *   light ground  GLASS_ON_LIGHT (dark glass)   light.surfaces
 *
 * GLASS_ON_LIGHT is tinted until white text on it reads at 4.5:1 over a near-
 * white ground: about 56% of near-black, 65% of navy. Brand blue alone needs
 * 92%, which is a solid block rather than glass, so its blue is navy-blue.
 */
const ON_LIGHT_LINE = { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.35 }, { color: '#FFFFFF', opacity: 0.1 }] };
export const GLASS_ON_LIGHT: Record<GlassSurface, SurfaceSpec> = {
  'glass-background': {
    fill: { angle: 0, radial: { cx: 1, cy: 0.02, rx: 1.31, ry: 1.51 }, stops: [{ color: '#0A1633', opacity: 0.66 }, { color: '#0A1633', opacity: 0.6 }] },
    line: { angle: 199, stops: [{ color: '#FFFFFF', opacity: 0.4 }, { color: '#FFFFFF', opacity: 0.12 }] },
    shadow: [{ dy: 4, blur: 10, color: '#0B2E7A', opacity: 0.16 }],
    blur: GLASS_BLUR,
  },
  'glass-default': {
    fill: { angle: 60, stops: [{ color: '#0A1633', opacity: 0.66 }, { color: '#070B13', opacity: 0.62 }] },
    line: ON_LIGHT_LINE,
    blur: GLASS_BLUR,
  },
  'glass-blue': {
    fill: { angle: 60, stops: [{ color: '#0B3A9A', opacity: 0.74 }, { color: '#0B2E7A', opacity: 0.7 }] },
    line: { angle: 225, stops: [{ color: '#9EC0FF', opacity: 0.5 }, { color: '#FFFFFF', opacity: 0.12 }] },
    blur: GLASS_BLUR,
  },
  sunken: {
    fill: { angle: 180, stops: [{ color: '#070B13', opacity: 0.74 }, { color: '#070B13', opacity: 0.7 }] },
    line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.12 }, { color: '#FFFFFF', opacity: 0.06 }] },
    inset: [{ dy: 1, blur: 3, color: '#000000', opacity: 0.4 }],
    blur: GLASS_BLUR,
  },
  // The over-light card, its darkening wash strong enough to carry white text.
  'glass-highlighted': {
    ...HIGHLIGHTED.overLight,
    fill: { ...HIGHLIGHTED.overLight.fill!, stops: [{ color: '#070B13', opacity: 0.62 }, { color: '#0B2E7A', opacity: 0.68 }] },
  },
};

const BRIGHT_LINE = { angle: 180, stops: [{ color: '#FFFFFF', opacity: 0.9 }, { color: '#0B5FFF', opacity: 0.25 }] };
/** White glass for dark text over a dark ground. */
export const GLASS_BRIGHT: Record<GlassSurface, SurfaceSpec> = {
  'glass-background': { ...glassBackground.light, fill: { angle: 171, stops: [{ color: '#FFFFFF', opacity: 0.88 }, { color: '#FFFFFF', opacity: 0.8 }] } },
  'glass-default': { fill: { angle: 171, stops: [{ color: '#FFFFFF', opacity: 0.86 }, { color: '#F4F7FD', opacity: 0.8 }] }, line: BRIGHT_LINE, blur: GLASS_BLUR },
  'glass-blue': { fill: { angle: 171, stops: [{ color: '#FFFFFF', opacity: 0.86 }, { color: '#C7DAFF', opacity: 0.84 }] }, line: BRIGHT_LINE, blur: GLASS_BLUR },
  sunken: {
    fill: { angle: 180, stops: [{ color: '#E9EEF7', opacity: 0.86 }, { color: '#E9EEF7', opacity: 0.82 }] },
    line: { angle: 225, stops: [{ color: INK, opacity: 0.12 }, { color: INK, opacity: 0.06 }] },
    inset: [{ dy: 1, blur: 3, color: INK, opacity: 0.14 }],
    blur: GLASS_BLUR,
  },
  'glass-highlighted': {
    ...HIGHLIGHTED.overDark,
    fill: { ...HIGHLIGHTED.overDark.fill!, stops: [{ color: '#FFFFFF', opacity: 0.9 }, { color: '#DCE8FF', opacity: 0.84 }] },
  },
};

const isGlass = (s: SurfaceName): s is GlassSurface => (GLASS_SURFACES as readonly string[]).includes(s);

/**
 * The recipe a surface draws with, for a card over `ground` with `ink` text.
 * The theme's own pairing returns its `surfaces` entry, so nothing changes
 * for a card that sets neither. The non-glass surfaces, and the fixed
 * highlighted pair, have one recipe a theme.
 */
export function surfaceRecipe(tokens: Tokens, name: SurfaceName, ground: 'dark' | 'light', ink: 'dark' | 'light'): SurfaceSpec {
  const own = tokens.surfaces[name] ?? tokens.surfaces['glass-default'];
  if (!isGlass(name)) return own;
  if (ground === 'dark') return ink === 'light' ? dark.surfaces[name] : GLASS_BRIGHT[name];
  return ink === 'dark' ? light.surfaces[name] : GLASS_ON_LIGHT[name];
}
