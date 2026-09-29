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
  // An accent pill is brand blue in BOTH themes, so its label is the on-accent
  // colour in both. Leaving this to the text default meant light mode drew
  // near-black #262c37 on #0b5fff — it only looked right in dark mode, where
  // the default happens to be near-white.
  let textColor: string | undefined = tk.text.onAccent;
  const stroke: string | undefined = undefined;

  if (variant === 'glass') {
    fill = tk.surface.translucent;
    textColor = tk.text.primary;
  } else if (variant === 'success') {
    fill = tk.status.success;
    // Whichever ink reads better on the green: the set's dark text on the
    // bright dark-scheme green, white on the deeper light-scheme one.
    textColor = contrast(tk.status.onStatus, fill) >= contrast('#FFFFFF', fill) ? tk.status.onStatus : '#FFFFFF';
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

/** WCAG contrast between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
