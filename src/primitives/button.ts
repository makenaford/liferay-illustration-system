import { cssAngleLine } from './surface.ts';
import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, type TypeRole } from './text.ts';
import { ICONS } from '../icons.ts';
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
  role?: TypeRole;
  /** Wrap the label onto two lines. */
  lines?: string[];
  /**
   * Content alignment. Discovered during the port: the segment headers are
   * left-aligned icon + label rows, while every CTA is centred. Without this
   * they'd have had to be two different primitives.
   */
  align?: 'center' | 'left';
  /** Left padding when `align` is `left`. */
  padding?: number;
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

  const iconSize = Math.min(height * 0.5, 16);
  const hasIcon = Boolean(icon && ICONS[icon]);
  const iconPad = hasIcon ? iconSize + 7 : 0;

  const lines = props.lines ?? [label];
  const lineHeight = size * 1.18;
  const firstBaseline =
    y + height / 2 + size * 0.355 - ((lines.length - 1) * lineHeight) / 2;

  const align = props.align ?? 'center';
  const pad = props.padding ?? 12;
  const iconX =
    align === 'left'
      ? x + pad
      : x + (width - iconPad - measure(lines[0], size)) / 2;
  const labelX = align === 'left' ? x + pad + iconPad : x + width / 2 + iconPad / 2;
  const labelAnchor = align === 'left' ? 'start' : 'middle';

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
    hasIcon
      ? IconTile(ctx, {
          x: iconX,
          y: y + (height - iconSize) / 2,
          size: iconSize,
          icon: ICONS[icon!],
          tone: variant === 'solid' || variant === 'gradient' ? 'onAccent' : 'primary',
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
  ]);
}

/** Rough advance width — good enough to centre an icon + label pair. */
function measure(s: string, size: number): number {
  return s.length * size * 0.52;
}
