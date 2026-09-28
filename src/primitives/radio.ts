import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES } from './text.ts';

export interface RadioProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  checked?: boolean;
}

/**
 * RADIO — one option of a choice, as a tile: the round button, then its
 * label ("Permit Type": Commercial, Residential, Structural). A row of them
 * is a radio group; one is checked.
 */
export function Radio(ctx: Ctx, props: RadioProps): VNode {
  const { x, y, width, height, label, checked } = props;
  const tk = ctx.tokens;
  const c = tk.component.input;
  const r = Math.min(6, height / 4);
  const cx = x + 10 + r;
  const cy = y + height / 2;
  const size = TYPE_ROLES.bodySmall.size;
  return h('g', { 'data-el': 'radio' }, [
    h('rect', { x, y, width, height, rx: 6, fill: tk.surface.translucent, 'fill-opacity': tk.surface.translucentOpacity * 2.5 }),
    h('rect', {
      x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, rx: 5.5,
      fill: 'none', stroke: c.line, 'stroke-opacity': c.lineOpacity,
    }),
    checked
      ? h('g', {}, [
          h('circle', { cx, cy, r, fill: '#FFFFFF' }),
          h('circle', { cx, cy, r: r * 0.62, fill: tk.accent.base }),
        ])
      : h('circle', { cx, cy, r: r - 0.5, fill: 'none', stroke: tk.text.primary, 'stroke-opacity': 0.7, 'stroke-width': 1 }),
    Text(ctx, {
      x: cx + r + 8,
      y: cy + size * 0.355,
      role: 'bodySmall',
      weight: 'semibold',
      content: label,
    }),
  ]);
}
