/**
 * DOCUMENT SCHEMA — what the editor saves and what the exporter reads.
 *
 * Design rules baked into these types:
 *   - Coordinates are freeform (designers can place anything anywhere), but
 *     `type` is a closed union, so nothing can be *created* outside the
 *     library. That is the "freeform placement, zero freeform creation" line.
 *   - No element carries a colour value. Every paint decision is a `tone`,
 *     `variant`, or `role` that resolves through tokens. There is deliberately
 *     no `fill: string` field anywhere in this file.
 *   - `children` on containers makes composition recursive, so a chart can sit
 *     in a card in a panel without new primitives.
 *
 * NOTE ON LAYOUT: this started with a `scene` union (SinglePanel / TwoUp /
 * HubSpoke / BeforeAfter). Porting all nine illustrations showed those aren't
 * different scenes at all — they're the same stage with a different number of
 * panels. So `panels` is just an array, and `layout` is descriptive metadata
 * for the editor's template picker rather than a renderer branch.
 */

import type { TypeRole, TypeWeight } from './primitives/text.ts';
import type { MeshName, SurfaceName } from './tokens.ts';

export type Tone = 'accent' | 'success' | 'info' | 'neutral' | 'muted' | 'subtle';

export interface PanelSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  sheen?: 'radial' | 'linear';
  surface?: SurfaceName;
  radius?: number;
  /**
   * Clip content: every top-level element whose centre sits inside the panel
   * is cut to the panel's shape, so a dashboard can run off the window's edge
   * the way a real screen would. Callouts — buttons, pills, badges, icons,
   * connectors, arrows and cursors — are left whole: they float over it.
   */
  clip?: boolean;
}

export interface TextEl extends LayoutChild {
  type: 'text';
  x: number;
  y: number;
  /** A step on the nine-step type scale. */
  role: TypeRole;
  content: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Overrides the step's default weight. */
  weight?: TypeWeight;
  /**
   * A semantic tone (`accent`, `muted`, …) or, as an override, any key in the
   * generated palette. Still a token either way — there is no hex field.
   */
  tone?: string;
  /** A line under the text, in its own colour. */
  underline?: boolean;
  /** A line through the text, in its own colour. */
  strikethrough?: boolean;
}

/**
 * AUTO LAYOUT — a container that positions its own children.
 *
 * When a card carries this, its children's `x`/`y` are computed rather than
 * read, so editing a string or a gap reflows everything inside. Modelled on
 * flexbox (and so on Figma's auto-layout, which is the same model) because
 * that is what a designer already has in their head.
 */
export interface LayoutSpec {
  direction: 'vertical' | 'horizontal';
  /** Space between children. Defaults to the `LAYOUT.gap` token. */
  gap?: number;
  /** One value, [y, x], or [top, right, bottom, left]. */
  padding?: number | [number, number] | [number, number, number, number];
  /**
   * Cross-axis placement. `stretch` fills the container's other dimension;
   * `baseline` (rows only) puts every child's first text baseline on one line.
   */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis distribution. */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** Shrink the container to its content on this axis. */
  hugWidth?: boolean;
  hugHeight?: boolean;
}

/** Per-child overrides, valid on any element inside a layout container. */
export interface LayoutChild {
  /** Share of the leftover main-axis space, flex-grow style. */
  grow?: number;
  /** Override the container's cross-axis alignment for this child. */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /**
   * Stable identity, for things that refer to this element — an attached
   * connector end. Paths change when anything is reordered or nested; this
   * does not. Set only when something needs it. See src/attach.ts.
   */
  uid?: string;
}

export interface CardEl extends LayoutChild {
  type: 'card';
  x: number;
  y: number;
  width: number;
  height: number;
  sheen?: 'radial' | 'linear';
  /** Which surface from the token set to draw. */
  surface?: SurfaceName;
  radius?: number;
  /** Turns this card into a reflowing container. */
  layout?: LayoutSpec;
  /** Clip content: children are cut to this container's shape. */
  clip?: boolean;
  children?: Element[];
}

/**
 * GROUP — a container with no appearance of its own.
 *
 * Auto-layout is a one-dimensional flow, so a two-dimensional arrangement is
 * expressed as flows nested inside flows: a column of rows. A group is the
 * intermediate that makes that possible without inventing a visual card that
 * a designer never asked for. It draws nothing; it only positions.
 */
export interface GroupEl extends LayoutChild {
  type: 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  layout?: LayoutSpec;
  /** Clip content: children are cut to this container's shape. */
  clip?: boolean;
  children?: Element[];
}

export interface SubCardEl extends LayoutChild {
  type: 'subCard';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  variant?: 'sheen' | 'flat' | 'sunken' | 'accent';
  /** Which surface from the token set to draw. Wins over `variant`. */
  surface?: SurfaceName;
  /** Turns this card into a reflowing container. */
  layout?: LayoutSpec;
  /** Clip content: children are cut to this container's shape. */
  clip?: boolean;
  children?: Element[];
}

export interface PillEl extends LayoutChild {
  type: 'pill';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  variant?: 'accent' | 'glass' | 'success';
}

export interface BadgeEl extends LayoutChild {
  type: 'badge';
  x: number;
  y: number;
  /** Omit to hug the label — see `badgeWidth`. */
  width?: number;
  height?: number;
  label: string;
  tone?: 'success' | 'info' | 'accent' | 'neutral';
  dot?: boolean;
  variant?: 'tonal' | 'ring' | 'gradient' | 'glass';
}

export interface ButtonEl extends LayoutChild {
  type: 'button';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  variant?: 'solid' | 'outline' | 'glass' | 'gradient' | 'muted';
  radius?: number;
  icon?: string;
  role?: TypeRole;
  lines?: string[];
  align?: 'center' | 'left';
  padding?: number;
}

export interface ToggleEl extends LayoutChild {
  type: 'toggle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  on: boolean;
}

export interface InputEl extends LayoutChild {
  type: 'input';
  x: number;
  y: number;
  width: number;
  height?: number;
  placeholder: string;
  icon?: string;
  radius?: number;
  role?: TypeRole;
}

export interface CursorEl extends LayoutChild {
  type: 'cursor';
  x: number;
  y: number;
  /** Width of the artwork's box, shadow included. Defaults to 86. */
  size?: number;
}

export interface ChatEl extends LayoutChild {
  type: 'chat';
  x: number;
  y: number;
  width: number;
  height?: number;
  /** `receiver`: glass, avatar leading. `sender`: blue, avatar trailing. */
  variant?: 'receiver' | 'sender';
  name: string;
  message: string;
  initials?: string;
  /** The avatar's photo — see `AvatarEl.href`. */
  avatarHref?: string;
}

export interface ChromeEl extends LayoutChild {
  type: 'chrome';
  x: number;
  y: number;
  radius?: number;
  gap?: number;
  title?: string;
}

export interface LineChartEl extends LayoutChild {
  type: 'lineChart';
  x: number;
  y: number;
  width: number;
  height: number;
  series: {
    data: number[];
    role?: 'primary' | 'secondary' | 'success';
    strokeWidth?: number;
  }[];
  gridLines?: number;
  domain?: [number, number];
  referenceLine?: number;
  /** A dot at every data point. */
  markers?: boolean;
  /** Axis labels under the plot — see `LineChartProps.labels`. */
  labels?: string[];
  labelGap?: number;
}

export interface BarChartEl extends LayoutChild {
  type: 'barChart';
  x: number;
  y: number;
  width: number;
  height: number;
  /** A single series. Ignored when `series` is set. */
  data?: number[];
  /** Two or more bars per category, drawn side by side — a comparison. */
  series?: { data: (number | null)[]; tone?: 'accent' | 'soft' }[];
  barRatio?: number;
  gradient?: boolean;
  gridLines?: number;
  /** The value the full height stands for; omit to scale to the tallest bar. */
  max?: number;
}

export interface ProgressEl extends LayoutChild {
  type: 'progress';
  x: number;
  y: number;
  width: number;
  value: number;
  height?: number;
  label?: string;
  labelGap?: number;
  tone?: 'accent' | 'info' | 'success';
}

export interface SkeletonEl extends LayoutChild {
  type: 'skeleton';
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface StatEl extends LayoutChild {
  type: 'stat';
  x: number;
  y: number;
  value: string;
  label?: string;
  labelPosition?: 'above' | 'below';
  valueRole?: TypeRole;
  labelRole?: TypeRole;
  anchor?: 'start' | 'middle' | 'end';
}

export interface IconEl extends LayoutChild {
  type: 'icon';
  x: number;
  y: number;
  size?: number;
  /** Key into `ICONS`. Omitted renders a visible placeholder. */
  icon?: string;
  /** A semantic tone or any palette key — see `TextEl.tone`. */
  tone?: string;
}

export interface IconGridEl extends LayoutChild {
  type: 'iconGrid';
  x: number;
  y: number;
  icons: (string | null)[];
  columns: number;
  size?: number;
  gapX?: number;
  gapY?: number;
  tone?: 'subtle' | 'accent' | 'primary' | 'soft';
}

export interface AvatarEl extends LayoutChild {
  type: 'avatar';
  cx: number;
  cy: number;
  r?: number;
  initials?: string;
  /**
   * The photo: an image URL, or an uploaded photo embedded as a small square
   * JPEG data URI (the editor crops and downsizes it — see AvatarPhotoField).
   */
  href?: string;
}

export interface ConnectorEl extends LayoutChild {
  type: 'connector';
  from: [number, number];
  to: [number, number];
  route?: 'hv' | 'vh' | 'straight';
  radius?: number;
  nodes?: boolean;
  fade?: boolean;
  /** A glass disc behind each end node. Defaults on wherever nodes are drawn. */
  rings?: boolean;
  /**
   * Ends attached to elements, by `uid`: the end follows that side of the
   * element as it moves. `auto` faces the connector's other end. See
   * src/attach.ts.
   */
  attach?: {
    from?: { uid: string; side: 'top' | 'right' | 'bottom' | 'left' | 'auto' };
    to?: { uid: string; side: 'top' | 'right' | 'bottom' | 'left' | 'auto' };
  };
}

/**
 * A plain straight line from (x, y) to (x + width, y + height). Height 0 is a
 * horizontal rule, width 0 a vertical one; anything else is a diagonal, which
 * is what dragging a corner in the editor gives you.
 */
export interface LineEl extends LayoutChild {
  type: 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  /** A semantic tone or any palette key — see `TextEl.tone`. */
  tone?: string;
  thickness?: number;
  /** Round the ends. */
  rounded?: boolean;
}

export interface ArrowEl extends LayoutChild {
  type: 'arrow';
  x: number;
  y: number;
  width?: number;
  thickness?: number;
  direction?: 'right' | 'left' | 'up';
  tone?: 'primary' | 'accent';
}

export interface MapEl extends LayoutChild {
  type: 'map';
  x: number;
  y: number;
  width: number;
  height: number;
  spacing?: number;
  dotRadius?: number;
  markers?: [number, number][];
}

export interface SpotIconEl extends LayoutChild {
  type: 'spotIcon';
  /**
   * Key into `GLASS_ICONS` — the design system's glass icon set, imported by
   * `npm run icons`. An unknown key renders a visible placeholder.
   */
  name: string;
  x: number;
  y: number;
  size?: number;
}

/**
 * A raster brought into the document.
 *
 * `href` is a URL or a data URI. A URL keeps the document small and is what
 * production should use; a data URI makes the illustration self-contained,
 * which is what an export needs. The editor writes data URIs and warns above
 * half a megabyte, because that is how the original exports ended up carrying
 * 33MB of base64.
 */
export interface ImageEl extends LayoutChild {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  /** `cover` crops to fill, `contain` fits inside. */
  fit?: 'cover' | 'contain';
  /** Rounded corners, clipped. */
  radius?: number;
  /** Shown to a screen reader and in the layers panel. */
  alt?: string;
}

/**
 * Imported vector artwork, inlined.
 *
 * Kept distinct from `image` because it is genuinely different: it scales
 * without loss, it themes if its source used `currentColor`, and its ids have
 * to be namespaced or it will fight every other gradient on the page.
 */
export interface SvgEl extends LayoutChild {
  type: 'svg';
  x: number;
  y: number;
  width: number;
  height: number;
  /** The source viewBox, so the artwork maps onto the box correctly. */
  viewBox: [number, number, number, number];
  /** Markup with `__NS__`-prefixed ids — see `importSvg`. */
  body: string;
  /** `contain` preserves the aspect ratio; `fill` stretches. */
  fit?: 'contain' | 'fill';
  alt?: string;
}

export type Element =
  | TextEl
  | CardEl
  | SubCardEl
  | GroupEl
  | PillEl
  | BadgeEl
  | ButtonEl
  | ToggleEl
  | InputEl
  | ChatEl
  | CursorEl
  | ChromeEl
  | LineChartEl
  | BarChartEl
  | ProgressEl
  | SkeletonEl
  | StatEl
  | IconEl
  | IconGridEl
  | AvatarEl
  | ConnectorEl
  | ArrowEl
  | LineEl
  | MapEl
  | SpotIconEl
  | ImageEl
  | SvgEl;

export interface Doc {
  id: string;
  name: string;
  /** Descriptive only — see the note at the top of this file. */
  layout: 'singlePanel' | 'twoUp' | 'hubSpoke' | 'beforeAfter' | 'dashboard' | 'bare';
  /** The size this document EXPORTS at — the SVG's viewBox. */
  canvas: { width: number; height: number };
  /**
   * The coordinate space the elements are authored in, when it differs from
   * the canvas.
   *
   * Every illustration in the set exports at one size so they drop into the
   * same slot, but two were drawn on larger artboards. Rewriting their
   * coordinates would mean rounding every one of them onto the grid and
   * losing the alignment those documents were just corrected to, so the
   * artboard is kept and the whole drawing is scaled to fit the canvas on
   * the way out — uniformly, and centred. Vector output, so nothing is lost.
   *
   * Absent means the two are the same, which is the normal case.
   */
  artboard?: { width: number; height: number };
  /**
   * A mesh background from the design system, in place of the theme's own
   * stage. Absent keeps the original: the blurred bloom in dark, the corner
   * mesh in light.
   */
  background?: MeshName;
  /**
   * Ambient blooms. One to three, often anchored off-canvas. `blur` matters a
   * lot — see the note on `Glow` in primitives/stage.ts.
   */
  glow?: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    blur?: number;
    opacity?: number;
  }[];
  /** Hero glass panels, drawn under `elements`. Empty for bare layouts. */
  panels?: PanelSpec[];
  elements: Element[];
}
