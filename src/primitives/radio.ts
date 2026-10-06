import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES } from './text.ts';
import { Surface } from './surface.ts';
import type { SurfaceName } from '../tokens.ts';

export interface RadioProps {
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

/** Surfaces a label reads on in white. Every other surface takes the primary text colour. */
const ON_ACCENT: ReadonlySet<SurfaceName> = new Set(['solid', 'gradient']);

/**
 * RADIO — one option of a choice, as a tile: the round button, then its
 * label ("Permit Type": Commercial, Residential, Structural). A row of them
 * is a radio group; one is checked. As a `checkbox` the button is a rounded
 * square, ticked when checked — options that are picked independently.
 *
 * The tile is the field-like translucent one by default; with a `surface` it
 * is that card surface, drawn by the primitive that draws cards.
 */
export function Radio(ctx: Ctx, props: RadioProps): VNode {
  const { x, y, width, height, label, checked, surface } = props;
  const tk = ctx.tokens;
  const c = tk.component.input;
  const r = Math.min(6, height / 4);
  const cx = x + 10 + r;
  const cy = y + height / 2;
  const size = TYPE_ROLES.bodySmall.size;
  const onAccent = !!surface && ON_ACCENT.has(surface);
  // On a filled surface the control turns white so it holds against the fill.
  const mark = onAccent ? '#FFFFFF' : tk.accent.base;
  const ring = onAccent ? '#FFFFFF' : tk.text.primary;

  const control =
    props.control === 'checkbox'
      ? checked
        ? h('g', {}, [
            h('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r * 0.4, fill: mark }),
            h('path', {
              d: `M${cx - r * 0.5} ${cy}l${r * 0.35} ${r * 0.38}l${r * 0.68} ${-r * 0.8}`,
              fill: 'none',
              stroke: onAccent ? tk.accent.base : '#FFFFFF',
              'stroke-width': Math.max(1.2, r * 0.28),
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
          ])
        : h('rect', {
            x: cx - r + 0.5, y: cy - r + 0.5, width: r * 2 - 1, height: r * 2 - 1, rx: r * 0.4,
            fill: 'none', stroke: ring, 'stroke-opacity': 0.7, 'stroke-width': 1,
          })
      : checked
        ? h('g', {}, [
            h('circle', { cx, cy, r, fill: '#FFFFFF' }),
            h('circle', { cx, cy, r: r * 0.62, fill: tk.accent.base }),
          ])
        : h('circle', { cx, cy, r: r - 0.5, fill: 'none', stroke: ring, 'stroke-opacity': 0.7, 'stroke-width': 1 });

  const text = Text(ctx, {
    x: cx + r + 8,
    y: cy + size * 0.355,
    role: 'bodySmall',
    weight: 'semibold',
    content: label,
    ...(surface ? { color: onAccent ? tk.text.onAccent : tk.text.primary } : {}),
  });

  if (surface) {
    return h('g', { 'data-el': `radio-${surface}` }, [Surface(ctx, { x, y, width, height, radius: 6, surface, children: [control, text] })]);
  }

  return h('g', { 'data-el': 'radio' }, [
    h('rect', { x, y, width, height, rx: 6, fill: tk.surface.translucent, 'fill-opacity': tk.surface.translucentOpacity * 2.5 }),
    h('rect', {
      x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, rx: 5.5,
      fill: 'none', stroke: c.line, 'stroke-opacity': c.lineOpacity,
    }),
    control,
    text,
  ]);
}
