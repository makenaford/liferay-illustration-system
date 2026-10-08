import { cssAngleLine, Surface } from './surface.ts';
import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, typeStyle, type TypeRole } from './text.ts';
import { measureText } from '../fontMetrics.generated.ts';
import type { SurfaceName } from '../tokens.ts';
import { iconArt, type IconStyle } from '../icons.ts';
import { IconTile } from './iconTile.ts';

export interface ButtonProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /**
   * `solid` — brand fill, the primary action.
   * `outline` — hairline only, the secondary action.
   * `glass` — translucent, used for the large floating CTAs.
   * `gradient` — the three-stop accent sweep on hero buttons.
   */
  variant?: 'solid' | 'outline' | 'glass' | 'gradient' | 'muted';
  /** Fully rounded when omitted on tall buttons; otherwise a 4px radius. */
  radius?: number;
  icon?: string;
  iconStyle?: IconStyle;
  role?: TypeRole;
  /** Wrap the label onto two lines. */
  lines?: string[];
  /**
   * Content alignment. Discovered during the port: the segment headers are
   * left-aligned icon + label rows, while every CTA is centred. Without this
   * they'd have had to be two different primitives.
   */
  align?: 'center' | 'left';
  /** Left padding when `align` is `left`, and either side of a fitted label. */
  padding?: number;
  /** Any surface in the card set, drawn as a card draws it. Wins over `variant`. */
  surface?: SurfaceName;
}

/** The icon's size and the space it takes before the label. */
const iconBox = (height: number, hasIcon: boolean) => {
  const size = Math.min(height * 0.5, 16);
  return { size, pad: hasIcon ? size + 7 : 0 };
};

/**
 * The width a button needs for its label: the padding either side, the icon
 * and the widest line of text — what `fit` sets it to (see `resolveLayout`).
 */
export function buttonFitWidth(p: Pick<ButtonProps, 'label' | 'lines' | 'role' | 'padding' | 'height' | 'icon' | 'iconStyle'>): number {
  const st = typeStyle(p.role ?? 'subheading');
  const text = Math.max(...(p.lines ?? [p.label]).map((l) => measureText(l, st.size, st.weight)));
  const icon = iconBox(p.height, Boolean(iconArt(p.icon, p.iconStyle))).pad;
  return Math.round((text + icon + (p.padding ?? 12) * 2) * 2) / 2;
}

/** Surfaces a label reads on in white. Every other surface takes the primary text colour. */
const ON_ACCENT: ReadonlySet<SurfaceName> = new Set(['solid', 'gradient']);

/**
 * BUTTON SIZES — three steps, each a height, a type step and a padding that
 * belong together, set at once from the Inspector. Medium is the default
 * button. Any of the three can still be changed on its own afterwards; the
 * button is then a custom size.
 */
export const BUTTON_SIZES = {
  // Semibold steps all three, as the design system's buttons are set.
  small: { height: 24, role: 'smallHeading', padding: 8 },
  medium: { height: 32, role: 'bodySmall', padding: 12 },
  large: { height: 40, role: 'subheading', padding: 16 },
} as const satisfies Record<string, { height: number; role: TypeRole; padding: number }>;
export type ButtonSize = keyof typeof BUTTON_SIZES;

/** Which size a button is, if it is one of the three. */
export function buttonSizeOf(el: { height: number; role?: TypeRole; padding?: number }): ButtonSize | null {
  for (const [name, s] of Object.entries(BUTTON_SIZES) as [ButtonSize, (typeof BUTTON_SIZES)[ButtonSize]][]) {
    if (el.height === s.height && (el.role ?? 'subheading') === s.role && (el.padding ?? 12) === s.padding) return name;
  }
  return null;
}

/**
 * BUTTON — solid, outline, glass, and gradient variants.
 *
 * Separate from `Pill` on purpose: Pill is a *label* (a badge or tag), Button
 * is an *action*. They look similar today, and keeping them distinct means the
 * editor can offer the right props for each and the tokens can diverge later
 * without a migration.
 */
export function Button(ctx: Ctx, props: ButtonProps): VNode {
  const { x, y, width, height, label, variant = 'solid', icon } = props;
  const tk = ctx.tokens;
  const radius = props.radius ?? 4;
  const role: TypeRole = props.role ?? 'subheading';
  const size = TYPE_ROLES[role].size;

  const c = tk.component.button;
  let fill: string | undefined;
  let fillOpacity: number | undefined;
  let stroke: string | undefined;
  let strokeOpacity: number | undefined;
  let labelColor = tk.text.onAccent;
  /** An extra soft glow under outline buttons — `Glass Card/shadow`. */
  let ambient = false;

  if (variant === 'solid') {
    fill = tk.accent.base;
  } else if (variant === 'outline') {
    // `Components/Button Outline` — a vertical sheen that fades to nothing,
    // a solid brand hairline, and a 6px ambient glow underneath.
    const sheenId = ctx.uid('btnsheen');
    ctx.defs.push(
      h(
        'linearGradient',
        { id: sheenId, x1: x, y1: y, x2: x, y2: y + height, gradientUnits: 'userSpaceOnUse' },
        [
          h('stop', { 'stop-color': c.glassFrom }),
          h('stop', { offset: 1, 'stop-color': c.glassTo }),
        ],
      ),
    );
    fill = `url(#${sheenId})`;
    stroke = c.outlineLine;
    strokeOpacity = 1;
    labelColor = c.outlineText;
    ambient = true;
  } else if (variant === 'muted') {
    fill = tk.text.subtle;
    fillOpacity = tk.name === 'light' ? 0.22 : 0.5;
    labelColor = tk.text.primary;
  } else if (variant === 'glass') {
    // `Surfaces/Card BG/Translucent` — white at 10% in BOTH themes, with the
    // brand-tinted glass hairline carrying the edge in light.
    fill = tk.surface.translucent;
    fillOpacity = tk.surface.translucentOpacity * 2;
    stroke = tk.glass.lineFrom;
    strokeOpacity = tk.glass.lineFromOpacity;
    labelColor = tk.text.primary;
  } else {
    // The brand gradient — `Spotlight Cards` Gradient Blue: cyan into brand
    // blue at the CSS angle the design states, with a white hairline.
    const g = tk.brandGradient;
    const gradId = ctx.uid('btngrad');
    ctx.defs.push(
      h(
        'linearGradient',
        { id: gradId, ...cssAngleLine(g.angle, x, y, width, height), gradientUnits: 'userSpaceOnUse' },
        g.stops.map((st, i) =>
          h('stop', {
            offset: st.offset ?? i / Math.max(g.stops.length - 1, 1),
            'stop-color': st.color,
            ...(st.opacity !== undefined ? { 'stop-opacity': st.opacity } : {}),
          }),
        ),
      ),
    );
    fill = `url(#${gradId})`;
    stroke = g.line;
    strokeOpacity = 1;
  }

  let glowId: string | null = null;
  if (ambient) {
    glowId = ctx.uid('btnglow');
    ctx.defs.push(
      h(
        'filter',
        {
          id: glowId,
          x: x - 24,
          y: y - 24,
          width: width + 48,
          height: height + 48,
          filterUnits: 'userSpaceOnUse',
          'color-interpolation-filters': 'sRGB',
        },
        [h('feDropShadow', { dy: 0, stdDeviation: 3, 'flood-color': c.ambientGlow, 'flood-opacity': 1 })],
      ),
    );
  }

  const art = iconArt(icon, props.iconStyle);
  const hasIcon = Boolean(art);
  const { size: iconSize, pad: iconPad } = iconBox(height, hasIcon);
  if (props.surface) labelColor = ON_ACCENT.has(props.surface) ? tk.text.onAccent : tk.text.primary;

  const lines = props.lines ?? [label];
  const lineHeight = size * 1.18;
  const firstBaseline =
    y + height / 2 + size * 0.355 - ((lines.length - 1) * lineHeight) / 2;

  const align = props.align ?? 'center';
  const pad = props.padding ?? 12;
  const iconX =
    align === 'left'
      ? x + pad
      : x + (width - iconPad - measureText(lines[0], size, TYPE_ROLES[role].weight)) / 2;
  const labelX = align === 'left' ? x + pad + iconPad : x + width / 2 + iconPad / 2;
  const labelAnchor = align === 'left' ? 'start' : 'middle';

  const content = [
    hasIcon
      ? IconTile(ctx, {
          x: iconX,
          y: y + (height - iconSize) / 2,
          size: iconSize,
          icon: art,
          // On a filled button the icon reads on the fill; on an outline
          // button it takes Brand/Primary, the colour of the outline's glow.
          tone: props.surface
            ? ON_ACCENT.has(props.surface)
              ? 'onAccent'
              : 'primary'
            : variant === 'solid' || variant === 'gradient'
              ? 'onAccent'
              : variant === 'outline'
                ? 'accent'
                : 'primary',
        })
      : null,
    ...lines.map((line, i) =>
      Text(ctx, {
        x: labelX,
        y: firstBaseline + i * lineHeight,
        role,
        content: line,
        anchor: labelAnchor,
        color: labelColor,
      }),
    ),
  ];

  // A surface from the card set: drawn by the same primitive a card is.
  if (props.surface) {
    return h('g', { 'data-el': `button-${props.surface}` }, [
      Surface(ctx, { x, y, width, height, radius, surface: props.surface, children: content }),
    ]);
  }

  return h('g', { 'data-el': `button-${variant}` }, [
    glowId
      ? h('g', { filter: `url(#${glowId})` }, [
          h('rect', { x, y, width, height, rx: radius, fill: 'none', stroke: c.ambientGlow }),
        ])
      : null,
    h('rect', {
      x,
      y,
      width,
      height,
      rx: radius,
      fill,
      'fill-opacity': fillOpacity,
    }),
    stroke
      ? h('rect', {
          x: x + 0.5,
          y: y + 0.5,
          width: width - 1,
          height: height - 1,
          rx: Math.max(radius - 0.5, 0),
          stroke,
          'stroke-opacity': strokeOpacity,
          fill: 'none',
        })
      : null,
    ...content,
  ]);
}
