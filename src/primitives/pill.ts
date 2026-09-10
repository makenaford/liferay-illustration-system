import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, type TypeRole } from './text.ts';

export interface PillProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** `accent` = solid brand fill (a call to action); `glass` = subtle chip. */
  variant?: 'accent' | 'glass' | 'success';
  role?: TypeRole;
}

/**
 * PILL — button, badge, and status chip. One primitive, three variants.
 * Appears in every one of the nine reference illustrations.
 */
export function Pill(ctx: Ctx, props: PillProps): VNode {
  const { x, y, width, height, label, variant = 'accent' } = props;
  const tk = ctx.tokens;
  const role: TypeRole = props.role ?? (variant === 'accent' ? 'body' : 'bodySmall');

  // Follows `Components/Label`: a solid brand fill, the translucent glass
  // fill, or the status colour. No hairline on any of them — the design
  // system binds no stroke to the Label's filled or glass cells.
  let fill = tk.accent.base;
  let textColor: string | undefined;
  const stroke: string | undefined = undefined;

  if (variant === 'glass') {
    fill = tk.surface.translucent;
    textColor = tk.text.primary;
  } else if (variant === 'success') {
    fill = tk.status.success;
    textColor = tk.name === 'dark' ? '#070B13' : '#FFFFFF';
  }

  const size = TYPE_ROLES[role].size;

  return h('g', { 'data-el': `pill-${variant}` }, [
    h('rect', {
      x,
      y,
      width,
      height,
      rx: height / 2,
      fill,
      'fill-opacity': variant === 'glass' ? tk.surface.translucentOpacity : 1,
      stroke,
    }),
    Text(ctx, {
      x: x + width / 2,
      // Optical centring: cap height is ~0.71em, so half of that below middle.
      y: y + height / 2 + size * 0.355,
      role,
      content: label,
      anchor: 'middle',
      color: textColor,
    }),
  ]);
}
