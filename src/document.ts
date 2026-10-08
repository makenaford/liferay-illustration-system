import type { PieGradientName } from './primitives/pieChart.ts';
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
import type { TableColumn } from './primitives/table.ts';
import type { DropdownItem, DropdownSurface } from './primitives/dropdown.ts';
import type { Lang, Localized, Translations } from './translate.ts';
import type { IconStyle } from './icons.ts';

export type Tone = 'accent' | 'success' | 'info' | 'neutral' | 'muted' | 'subtle';

/**
 * Which ink a card's contents draw in. Glass shows what is behind it, so a
 * glass card over a white screenshot is light whatever the theme, and the
 * theme's white text vanishes on it: `dark` draws its contents in the light
 * theme's ink, `light` in the dark theme's. Omitted, they follow the theme.
 * The renderer cannot see a screenshot's pixels, so this is set by hand.
 */
export type Ink = 'dark' | 'light';

export interface PanelSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  sheen?: 'radial' | 'linear';
  /** Omitted, `glass-background` — see `PANEL_SURFACE`. */
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
  /** Small caps: capitals, semibold, letter-spaced 6%. */
  smallCaps?: boolean;
  /** Wrap onto more lines rather than run wider than this. */
  maxWidth?: number;
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
  /**
   * Overrides of the template's colours for this element and what is inside
   * it, as palette keys: `textColor` stands in for the theme's text inks
   * (primary, muted, subtle), `accentColor` for its accent — a button's fill,
   * a toggle, a connector. Omitted, the element follows its template.
   */
  textColor?: string;
  accentColor?: string;
  /** Share of the leftover main-axis space, flex-grow style. */
  grow?: number;
  /** Override the container's cross-axis alignment for this child. */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /**
   * Absolute position, as Figma has it: out of its auto-layout container's
   * flow — neither placed by it nor counted in its size — and kept where it
   * is set, moving with the container. A badge on a card's corner, a cursor
   * over a row. Still the container's child, so it is clipped and drawn in
   * its order. Ignored in a container laid out by hand, where every child is.
   */
  absolute?: boolean;
  /**
   * Connectors do not snap to this element or attach to it: a line drawn or
   * dragged over it passes it by. Its children still take connectors.
   */
  noConnect?: boolean;
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
  /** Corners at half the shorter side — 100%, a pill — whatever its size. Wins over `radius`. */
  rounded?: boolean;
  /** Turns this card into a reflowing container. */
  /**
   * The widest it may be. Its text wraps, and its buttons' labels, rather
   * than widening it — and a translation never grows it past this. A phone
   * sets its own width; see editor/cardPresets.ts.
   */
  maxWidth?: number;
  /**
   * A dashboard: slots per row, one count per row (up to four of each). Its
   * rows are the children marked `gridRow`; see editor/dashboardGrid.ts.
   */
  grid?: number[];
  /** A dashboard drawn regular (the default) or condensed — see src/density.ts. */
  density?: import('./density.ts').Density;
  /**
   * Without a layout: fit the card around its children on this axis, the
   * card padding outside them. With one, `layout.hugWidth` / `hugHeight`.
   */
  hugWidth?: boolean;
  hugHeight?: boolean;
  layout?: LayoutSpec;
  /** Clip content: children are cut to this container's shape. */
  clip?: boolean;
  /**
   * Retained for older documents. A top-level card's glass now always frosts
   * what is beneath it — the stage, the panels and every element drawn before
   * it — as real glass over a screenshot would.
   */
  frost?: 'content';
  /** Text on the card — see `Ink`. */
  ink?: Ink;
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
  /**
   * Without a layout: fit the box to the children on this axis, as a Figma
   * group does. With one, `layout.hugWidth` / `hugHeight` do this instead.
   */
  hugWidth?: boolean;
  hugHeight?: boolean;
  /**
   * The widest it may be. Its text wraps, and its buttons' labels, rather
   * than widening it — and a translation never grows it past this. A phone
   * sets its own width; see editor/cardPresets.ts.
   */
  maxWidth?: number;
  /**
   * A dashboard: slots per row, one count per row (up to four of each). Its
   * rows are the children marked `gridRow`; see editor/dashboardGrid.ts.
   */
  grid?: number[];
  /** A dashboard drawn regular (the default) or condensed — see src/density.ts. */
  density?: import('./density.ts').Density;
  /** A row of a dashboard's grid. */
  gridRow?: boolean;
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
  /** Corners at half the shorter side — 100%, a pill — whatever its size. Wins over `radius`. */
  rounded?: boolean;
  variant?: 'sheen' | 'flat' | 'sunken' | 'accent';
  /** Which surface from the token set to draw. Wins over `variant`. */
  surface?: SurfaceName;
  /** Turns this card into a reflowing container. */
  /**
   * The widest it may be. Its text wraps, and its buttons' labels, rather
   * than widening it — and a translation never grows it past this. A phone
   * sets its own width; see editor/cardPresets.ts.
   */
  maxWidth?: number;
  /**
   * A dashboard: slots per row, one count per row (up to four of each). Its
   * rows are the children marked `gridRow`; see editor/dashboardGrid.ts.
   */
  grid?: number[];
  /** A dashboard drawn regular (the default) or condensed — see src/density.ts. */
  density?: import('./density.ts').Density;
  /**
   * Without a layout: fit the card around its children on this axis, the
   * card padding outside them. With one, `layout.hugWidth` / `hugHeight`.
   */
  hugWidth?: boolean;
  hugHeight?: boolean;
  layout?: LayoutSpec;
  /** Clip content: children are cut to this container's shape. */
  clip?: boolean;
  /** Text on the card — see `Ink`. */
  ink?: Ink;
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
  tone?: 'success' | 'warning' | 'alert' | 'danger' | 'info' | 'accent' | 'neutral';
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
  /** Corners at half the shorter side — 100%, a pill — whatever its size. Wins over `radius`. */
  rounded?: boolean;
  icon?: string;
  /** Outline or filled, for a MingCute icon. Defaults to outline. */
  iconStyle?: IconStyle;
  role?: TypeRole;
  lines?: string[];
  align?: 'center' | 'left';
  padding?: number;
  /** Width set by the label: the padding either side, the icon and the text. */
  fit?: boolean;
  /** Any surface in the card set, drawn as a card draws it. Wins over `variant`. */
  surface?: SurfaceName;
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
  /** Outline or filled, for a MingCute icon. Defaults to outline. */
  iconStyle?: IconStyle;
  radius?: number;
  /** Corners at half the shorter side — 100%, a pill — whatever its size. Wins over `radius`. */
  rounded?: boolean;
  role?: TypeRole;
}

export interface CursorEl extends LayoutChild {
  type: 'cursor';
  x: number;
  y: number;
  /** Width of the artwork's box, shadow included. Defaults to 86. */
  size?: number;
  /** `arrow` (default) or `hand`, the drag hand. */
  variant?: 'arrow' | 'hand';
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
    /** A colour from the set. Omitted: Primary, then Purple — see `CHART_COLORS`. */
    color?: string;
    strokeWidth?: number;
    /** Fill under the line — an area chart. */
    area?: boolean;
  }[];
  gridLines?: number;
  domain?: [number, number];
  referenceLine?: number;
  /** A dot at every data point. */
  markers?: boolean;
  /** Axis labels under the plot — see `LineChartProps.labels`. */
  labels?: string[];
  labelGap?: number;
  /** Vertical labels, top to bottom, down the plot's left edge. See `valueAxisLabels`. */
  valueLabels?: string[];
  /** `smooth` (default) through the points, or `straight` point to point. */
  curve?: 'smooth' | 'straight';
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
  series?: { data: (number | null)[]; tone?: 'accent' | 'soft'; color?: string }[];
  barRatio?: number;
  gradient?: boolean;
  /** One colour for a single-series chart, in place of the gradient. */
  color?: string;
  gridLines?: number;
  /** The value the full height stands for; omit to scale to the tallest bar. */
  max?: number;
  /** Category labels, centred under each bar — see `axisLabels`. */
  labels?: string[];
  labelGap?: number;
  /** Vertical labels, top to bottom, down the plot's left edge. See `valueAxisLabels`. */
  valueLabels?: string[];
  /** A line over the bars, one value per slot, on its own scale. */
  line?: (number | null)[];
  /** The line's colour. Omitted: the text colour. */
  lineColor?: string;
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
  tone?: 'accent' | 'info' | 'success' | 'warning' | 'alert' | 'danger';
  /** A colour from the set; wins over `tone`. */
  color?: string;
}

/**
 * TABLE — a header over rows of cells. Its height follows from its rows, so it
 * has none of its own. See `Table` in src/primitives/table.ts.
 */
export interface TableEl extends LayoutChild {
  type: 'table';
  x: number;
  y: number;
  width: number;
  columns: TableColumn[];
  /** One array per row, a string per column. */
  rows: string[][];
  compact?: boolean;
  header?: boolean;
  dividers?: boolean;
  rowHeight?: number;
  /** A background behind the table, from the surface set — see `TableProps.surface`. */
  surface?: SurfaceName;
  /** Inset of the rows inside the background. Defaults 8. */
  padding?: number;
  /** The background's corner radius. Defaults 4. */
  radius?: number;
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
  /** The label in small caps. Defaults on. */
  labelSmallCaps?: boolean;
  anchor?: 'start' | 'middle' | 'end';
}

export interface IconEl extends LayoutChild {
  type: 'icon';
  x: number;
  y: number;
  size?: number;
  /** An icon key — see `iconArt`. Omitted renders a visible placeholder. */
  icon?: string;
  /** Outline or filled, for a MingCute icon. Defaults to outline. */
  iconStyle?: IconStyle;
  /** A semantic tone or any palette key — see `TextEl.tone`. */
  tone?: string;
}

export interface IconGridEl extends LayoutChild {
  type: 'iconGrid';
  x: number;
  y: number;
  icons: (string | null)[];
  /** Outline or filled, for MingCute icons. Defaults to outline. */
  iconStyle?: IconStyle;
  columns: number;
  size?: number;
  gapX?: number;
  gapY?: number;
  /** A semantic tone or any palette key — see `TextEl.tone`. */
  tone?: string;
  /** Each icon's own style, by position; a gap takes `iconStyle`. */
  styles?: (IconStyle | null)[];
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

/** One theme's artwork for a graphic: markup whose ids carry `__NS__`. */
export interface GraphicArt {
  viewBox: [number, number, number, number];
  body: string;
}

/**
 * A GRAPHIC — larger glass artwork (a rocket, a scene), placed at any size
 * and kept in proportion inside its box. Either a built-in one by `name`
 * (src/graphics.generated.ts), or one from the Marketing Assets library,
 * carried in `art` so the illustration draws anywhere without that library.
 */
export interface GraphicEl extends LayoutChild {
  type: 'graphic';
  x: number;
  y: number;
  width: number;
  height: number;
  /** A built-in graphic's key. */
  name?: string;
  /** A library graphic, embedded. Wins over `name`. */
  art?: { id: string; label: string; dark: GraphicArt; light: GraphicArt };
  /**
   * How strongly the glass frosts what is behind it — Figma's background
   * blur, in canvas px. Defaults to 12. 0 shows it clear.
   */
  blur?: number;
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
  /**
   * A glass icon from the Marketing Assets library — added there or made with
   * its Glass Icon Builder — carried in the document so it draws anywhere.
   * Wins over `name`.
   */
  art?: { id: string; label: string; category: string; dark: GraphicArt; light: GraphicArt };
  /**
   * Which artwork to draw, whatever the theme. Omitted, it follows the theme.
   * The mockups set the Dark icons on their light glass cards, in both.
   */
  variant?: 'dark' | 'light';
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
  /** The picture's own size, in px — recorded on upload, needed to place it by hand. */
  natural?: { width: number; height: number };
  /**
   * Which part of a `cover` picture shows: `x`, `y` 0 (its left / top edge)
   * to 1 (right / bottom), 0.5 centred; `zoom` 1 and up. See src/imageCrop.ts.
   */
  crop?: { x: number; y: number; zoom?: number };
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

/** Shares of a whole, as a pie or a ring. See `PieChart` in src/primitives/pieChart.ts. */
export interface PieChartEl extends LayoutChild {
  type: 'pieChart';
  x: number;
  y: number;
  width: number;
  height: number;
  values: number[];
  /**
   * `full`, a whole disc (default); `line`, a single ring; or `illustrative`,
   * one share as a gradient arc behind a frosted glass ring — the first value,
   * as a share of them all (or a percentage, alone). See `PieChart`.
   */
  style?: 'full' | 'line' | 'illustrative';
  /** The `illustrative` arc's gradient, by base colour. See `PIE_GRADIENTS`. */
  gradient?: PieGradientName;
  /** The one segment drawn as glass. Defaults to the last. */
  highlight?: number;
  /**
   * Each segment's fill, by position: a tone — a colour or a gradient from
   * the illustration set. A gap, or no list, takes `PIE_COLORS`.
   */
  colors?: (string | null)[];
  /** Retained for older documents: a hole makes it the `line` style. */
  hole?: number;
}

/** One option of a radio group, as a tile. */
export interface RadioEl extends LayoutChild {
  type: 'radio';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  checked?: boolean;
  /** The round button of a choice, or the square of a checkbox. Defaults to `radio`. */
  control?: 'radio' | 'checkbox';
  /** Any surface in the card set, drawn as a card draws it, in place of the default tile. */
  surface?: SurfaceName;
}

/**
 * A dropdown menu: a header with a chevron, and its items below while open,
 * each led by a checkbox, a radio, a small profile tile, an icon or nothing.
 * Its height follows its rows.
 */
export interface DropdownEl extends LayoutChild {
  type: 'dropdown';
  x: number;
  y: number;
  width: number;
  label?: string;
  items: DropdownItem[];
  open?: boolean;
  /** Any card surface, or `white` (the default). */
  surface?: DropdownSurface;
  role?: TypeRole;
  radius?: number;
  /** Corners at half the shorter side — 100%, a pill — whatever its size. Wins over `radius`. */
  rounded?: boolean;
}

/** A labelled input, filled in or waiting — `height` takes in the label. */
export interface FieldEl extends LayoutChild {
  type: 'field';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required?: boolean;
  value?: string;
  /** Several lines: a text area. */
  lines?: string[];
  placeholder?: string;
  role?: TypeRole;
}

export type Element =
  | TextEl
  | DropdownEl
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
  | TableEl
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
  | GraphicEl
  | ImageEl
  | SvgEl
  | PieChartEl
  | RadioEl
  | FieldEl;

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
   * The screenshot slot of a mockup illustration: where its product
   * screenshot goes, at a fixed size. The builder draws it as a guide, and
   * an image dropped inside it fills it — cropped to fill, from the centre —
   * whatever size the image arrives at. See editor/docs.ts `MOCKUP`.
   */
  mockup?: { x: number; y: number; width: number; height: number };
  /**
   * Where cards may go, when it is not the canvas less `LAYOUT.canvasInset`:
   * the builder's safe-area guide, which top-level cards snap to, and what
   * the audit checks them against. The Image base template sets it 12px in
   * from the canvas edge. See editor/docs.ts `MOCKUP`.
   */
  cardArea?: { x: number; y: number; width: number; height: number };
  /**
   * A mesh background from the design system, in place of the theme's own
   * stage. Absent keeps the original: the blurred bloom in dark, the corner
   * mesh in light. `none` draws no background at all — the canvas is
   * transparent, for an illustration placed over a page's own background.
   */
  background?: MeshName | 'none';
  /**
   * The second colour of the `duo` background, beside the primary blue: a
   * colour from the illustration set (see src/colors.ts). Defaults to Aqua.
   */
  backgroundAccent?: string;
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
  /**
   * The themes the illustration comes in: `dark` or `light` only, or `both`.
   * Omitted, both — unless its folder says otherwise. See src/themes.ts.
   */
  onlyTheme?: 'dark' | 'light' | 'both';
  /** Hero glass panels, drawn under `elements`. Empty for bare layouts. */
  panels?: PanelSpec[];
  /**
   * 2 once the panels have been moved to `glass-background` (see
   * src/migrate.ts), so a panel set to `glass-default` since stays so.
   */
  panelSurfaces?: 2;
  elements: Element[];
  /**
   * Translations of the copy, for translated exports only — the renderer
   * never reads this, so the illustration itself stays as written. Machine
   * drafts, made when the illustration is saved, sit here beside reviewed
   * ones; `machineTranslated` says which. See src/translate.ts.
   */
  translations?: Translations;
  /** Per language, the strings whose translation is a machine draft nobody has reviewed yet. */
  machineTranslated?: Partial<Record<Lang, string[]>>;
  /**
   * Per language, a version edited by hand and saved for everyone, shown and
   * downloaded in place of the automatic translation. See src/translate.ts.
   */
  localized?: Partial<Record<Lang, Localized>>;
}
