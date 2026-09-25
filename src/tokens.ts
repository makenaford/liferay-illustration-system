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

const LIGHT_MESHES = meshes(L, MESH_LIGHT);

export interface ShadowLayer {
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
export type MeshName = 'corners' | 'bubble' | 'corner-bubble' | 'purple-aqua';

export const MESH_NAMES: { name: MeshName; label: string }[] = [
  { name: 'corners', label: 'Corners' },
  { name: 'bubble', label: 'Full bubble' },
  { name: 'corner-bubble', label: 'Corner bubble' },
  { name: 'purple-aqua', label: 'Purple & aqua' },
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
  /** CSS angle in degrees — 0 points up, increasing clockwise. */
  angle: number;
  stops: Stop[];
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
  /** Backdrop blur in CSS px. 0 or omitted means the surface is not glass. */
  blur?: number;
  /** Recessed surfaces darken instead of lifting; skips the frosted pane. */
  recessed?: boolean;
}

export type SurfaceName =
  | 'glass1'
  | 'glass2'
  | 'glass3'
  | 'highlighted'
  | 'gradient'
  | 'solid'
  | 'outline'
  | 'sunken';

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
 * a wide filter region on every card. At 20 the bleed still reads as
 * refraction and keeps some shape.
 */
const GLASS_BLUR = 20;
/** `Glass Step 02` — the same in both themes. */
const STEP_02 = { color: '#8C96A9', opacity: 0.03 };

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
    /** Nested tiles inside a card. No shadow: it is not floating, it is inset. */
    glass1: {
      // DS: 0.03 / 0.02, line 0.1 / 0.07
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.055 }, { color: STEP_02.color, opacity: 0.03 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.14 }, { color: '#FFFFFF', opacity: 0.09 }] },
      blur: GLASS_BLUR,
    },
    /** The default card — the design system's shipped glass, exactly. */
    glass2: {
      // DS: 0.055 / STEP_02.opacity, line 0.16 / 0.12
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.1 }, { color: STEP_02.color, opacity: 0.045 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.22 }, { color: '#FFFFFF', opacity: 0.15 }] },
      shadow: [
        { dy: 8, blur: 20, color: '#000000', opacity: 0.28 },
        { dy: 1, blur: 3, color: '#000000', opacity: 0.22 },
      ],
      litEdge: { color: '#FFFFFF', opacity: 0.1 },
      blur: GLASS_BLUR,
    },
    /** Floating over the composition — an overlay, a callout, a menu. */
    glass3: {
      // DS: 0.09 / 0.04, line 0.26 / 0.16
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.16 }, { color: STEP_02.color, opacity: 0.06 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.34 }, { color: '#FFFFFF', opacity: 0.2 }] },
      shadow: [
        { dy: 18, blur: 40, color: '#000000', opacity: 0.4 },
        { dy: 3, blur: 8, color: '#000000', opacity: 0.28 },
      ],
      litEdge: { color: '#FFFFFF', opacity: 0.18 },
      blur: GLASS_BLUR,
    },
    /**
     * The one card that matters more. Same glass, lit BLUE rather than
     * brighter — a blue cast shadow instead of a black one, and a blue lit
     * edge. Raising it by colour rather than by contrast keeps it the same
     * material as its neighbours while still pulling the eye.
     */
    highlighted: {
      fill: { angle: 60, stops: [{ color: '#70A2FF', opacity: 0.1 }, { color: STEP_02.color, opacity: 0.03 }] },
      line: { angle: 225, stops: [{ color: '#70A2FF', opacity: 0.5 }, { color: '#70A2FF', opacity: 0.2 }] },
      shadow: [
        { dy: 10, blur: 28, color: '#0B5FFF', opacity: 0.45 },
        { dy: 2, blur: 6, color: '#0B5FFF', opacity: 0.28 },
      ],
      litEdge: { color: '#70A2FF', opacity: 0.22 },
      blur: GLASS_BLUR,
    },
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
      shadow: [{ dy: 8, blur: 22, color: D('brand-primary-primary'), opacity: 0.3 }],
    },
    /** Opaque brand blue — a callout that is an action, not a container. */
    solid: {
      fill: { angle: 180, stops: [{ color: '#0B5FFF' }, { color: '#0B5FFF' }] },
      shadow: [{ dy: 8, blur: 22, color: '#0B5FFF', opacity: 0.35 }],
    },
    /** No fill at all — structure without weight. */
    outline: {
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.7 }, { color: '#70A2FF', opacity: 0.7 }] },
    },
    /** Cut INTO its parent: inputs, log rows, wells. */
    sunken: {
      fill: { angle: 180, stops: [{ color: '#000000', opacity: 0.16 }, { color: '#000000', opacity: 0.16 }] },
      line: { angle: 225, stops: [{ color: '#FFFFFF', opacity: 0.07 }, { color: '#FFFFFF', opacity: 0.04 }] },
      recessed: true,
    },
  },
  stage: {
    bg: D('surfaces-page-bg-base-default'),
    // Dark keeps the blurred-ellipse bloom the original artwork was drawn
    // with; the mesh is a light-canvas treatment.
    mesh: [],
    meshes: meshes(D),
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
      { dy: 8, blur: 20, color: '#000000', opacity: 0.28 },
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
    /** Nested tiles inside a card. No shadow: it is not floating, it is inset. */
    glass1: {
      /*
       * Light glass is a FROSTED WHITE CARD, not a tinted pane.
       *
       * Taken from node `792:13843` in the Marketing UI Assets Repo — the
       * Figma source for this very illustration. Its card fills white at 80%
       * into `#BFD5FF` at 21% behind a blue hairline at 20%, which renders as
       * a near-solid pale card. The tinted-glass reading here was a guess made
       * before that reference existed.
       */
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.55 }, { color: '#BFD5FF', opacity: 0.15 }] },
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.14 }, { color: '#0B5FFF', opacity: 0.1 }] },
      blur: GLASS_BLUR,
    },
    /** The default card — the design system's shipped glass, exactly. */
    glass2: {
      /** The reference card's own values: white 80% into `#BFD5FF` 21%. */
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.8 }, { color: '#BFD5FF', opacity: 0.21 }] },
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.2 }, { color: '#0B5FFF', opacity: 0.14 }] },
      shadow: [
        { dy: 8, blur: 20, color: INK, opacity: 0.08 },
        { dy: 1, blur: 3, color: INK, opacity: 0.06 },
      ],
      blur: GLASS_BLUR,
    },
    /** Floating over the composition — an overlay, a callout, a menu. */
    glass3: {
      fill: { angle: 60, stops: [{ color: '#FFFFFF', opacity: 0.92 }, { color: '#BFD5FF', opacity: 0.28 }] },
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.28 }, { color: '#0B5FFF', opacity: 0.18 }] },
      shadow: [
        { dy: 18, blur: 40, color: INK, opacity: 0.14 },
        { dy: 3, blur: 8, color: INK, opacity: 0.1 },
      ],
      blur: GLASS_BLUR,
    },
    /**
     * The one card that matters more. Same glass, lit BLUE rather than
     * brighter — a blue cast shadow instead of a black one, and a blue lit
     * edge. Raising it by colour rather than by contrast keeps it the same
     * material as its neighbours while still pulling the eye.
     */
    highlighted: {
      /*
       * Light mode's `highlighted` has to work harder than dark's.
       *
       * In dark, a blue cast shadow reads instantly against near-black. On a
       * near-white stage the same shadow is barely a tint, so the emphasis has
       * to come from the fill and the edge instead — this is the one card in
       * an illustration that is saying "look here", and at 22% fill with a 55%
       * edge it was not saying it loudly enough to survive being seen small.
       */
      fill: { angle: 60, stops: [{ color: '#ADC9FF', opacity: 0.42 }, { color: '#6FA0FF', opacity: 0.12 }] },
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.95 }, { color: '#0B5FFF', opacity: 0.5 }] },
      shadow: [
        { dy: 10, blur: 30, color: '#0B5FFF', opacity: 0.42 },
        { dy: 2, blur: 6, color: '#0B5FFF', opacity: 0.24 },
      ],
      blur: GLASS_BLUR,
    },
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
      shadow: [{ dy: 8, blur: 22, color: L('brand-primary-primary'), opacity: 0.22 }],
    },
    /** Opaque brand blue — a callout that is an action, not a container. */
    solid: {
      fill: { angle: 180, stops: [{ color: '#0B5FFF' }, { color: '#0B5FFF' }] },
      shadow: [{ dy: 8, blur: 22, color: '#0B5FFF', opacity: 0.24 }],
    },
    /** No fill at all — structure without weight. */
    outline: {
      line: { angle: 225, stops: [{ color: '#0B5FFF', opacity: 0.7 }, { color: '#0B5FFF', opacity: 0.45 }] },
    },
    /** Cut INTO its parent: inputs, log rows, wells. */
    sunken: {
      fill: { angle: 180, stops: [{ color: INK, opacity: 0.04 }, { color: INK, opacity: 0.04 }] },
      line: { angle: 225, stops: [{ color: INK, opacity: 0.1 }, { color: INK, opacity: 0.06 }] },
      recessed: true,
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
      { dy: 8, blur: 20, color: INK, opacity: 0.08 },
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
