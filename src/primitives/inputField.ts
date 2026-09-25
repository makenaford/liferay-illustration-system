import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, type TypeRole } from './text.ts';
import { ICONS } from '../icons.ts';
import { IconTile } from './iconTile.ts';

export interface InputFieldProps {
  x: number;
  y: number;
  width: number;
  height?: number;
  placeholder: string;
  icon?: string;
  radius?: number;
  role?: TypeRole;
}

/**
 * INPUT FIELD — a translucent field with a bright hairline, an inset shadow
 * from the top so it reads as pressed in, and a leading icon and a
 * regular-weight placeholder. Colours come from `component.input`, which
 * holds the per-theme values and where each came from.
 *
 * Layout follows the component too: 6px in from the left, the icon, 4px,
 * then the text. The icon is 16px at the component's 32px height and scales
 * down with shorter fields.
 */
export function InputField(ctx: Ctx, props: InputFieldProps): VNode {
  const { x, y, width, placeholder, icon } = props;
  const height = props.height ?? 28;
  const radius = props.radius ?? 6;
  const tk = ctx.tokens;
  const c = tk.component.input;
  const role: TypeRole = props.role ?? 'micro';
  const size = TYPE_ROLES[role].size;

  const hasIcon = Boolean(icon && ICONS[icon]);
  const pad = 6;
  const iconSize = Math.min(16, height - pad * 2);
  const textX = hasIcon ? x + pad + iconSize + 4 : x + pad + 2;

  /*
   * `inset 0 4px 4px rgba(0,0,0,.25)`: the field's own shape, offset down and
   * blurred, subtracted from itself, leaves the shadow along the top edge
   * inside the shape. Drawn from an opaque copy so the shadow's strength
   * does not depend on the fill's 20%.
   */
  const shadowId = ctx.uid('inputinset');
  ctx.defs.push(
    h(
      'filter',
      {
        id: shadowId,
        x: x - 4,
        y: y - 4,
        width: width + 8,
        height: height + 8,
        filterUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      },
      [
        h('feOffset', { in: 'SourceAlpha', dy: 4, result: 'off' }),
        h('feGaussianBlur', { in: 'off', stdDeviation: 2, result: 'blur' }),
        h('feComposite', { in: 'SourceAlpha', in2: 'blur', operator: 'arithmetic', k2: 1, k3: -1, result: 'rim' }),
        h('feFlood', { 'flood-color': '#000000', 'flood-opacity': c.shadowOpacity }),
        h('feComposite', { in2: 'rim', operator: 'in' }),
      ],
    ),
  );

  return h('g', { 'data-el': 'input' }, [
    h('rect', { x, y, width, height, rx: radius, fill: c.fill, 'fill-opacity': c.fillOpacity }),
    h('rect', { x, y, width, height, rx: radius, fill: '#000000', filter: `url(#${shadowId})` }),
    h('rect', {
      x: x + 0.5,
      y: y + 0.5,
      width: width - 1,
      height: height - 1,
      rx: Math.max(radius - 0.5, 0),
      stroke: c.line,
      'stroke-opacity': c.lineOpacity,
      fill: 'none',
    }),
    hasIcon
      ? IconTile(ctx, {
          x: x + pad,
          y: y + (height - iconSize) / 2,
          size: iconSize,
          icon: ICONS[icon!],
          color: c.ink,
        })
      : null,
    Text(ctx, {
      x: textX,
      y: y + height / 2 + size * 0.355,
      role,
      // Regular whatever the role's own weight: a placeholder is not a label.
      weight: 'regular',
      content: placeholder,
      color: c.ink,
    }),
  ]);
}
