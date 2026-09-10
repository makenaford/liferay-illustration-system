import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, type TypeRole } from './text.ts';
import { ICONS } from '../icons.ts';
import { IconTile } from './iconTile.ts';
import { SubCard } from './subCard.ts';

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
 * INPUT FIELD — a sunken well with a leading icon and a placeholder.
 *
 * NOTE: the design system has no `Components/Input` token group and no input
 * rules in `components.module.css` — Mantine's defaults carry it. So this is
 * derived rather than transcribed: the recessed `sunken` surface, with the
 * outline button's hairline at reduced strength so a field reads as quieter
 * than a button. Worth tokenising in the design file; flagged in the README.
 */
export function InputField(ctx: Ctx, props: InputFieldProps): VNode {
  const { x, y, width, placeholder, icon } = props;
  const height = props.height ?? 28;
  const radius = props.radius ?? 6;
  const tk = ctx.tokens;
  const role: TypeRole = props.role ?? 'micro';

  const hasIcon = Boolean(icon && ICONS[icon]);
  const iconSize = Math.min(height * 0.42, 11);
  const textX = hasIcon ? x + 8 + iconSize + 5 : x + 9;

  return SubCard(ctx, {
    x,
    y,
    width,
    height,
    radius,
    variant: 'sunken',
    children: [
      // A field's edge is the button hairline, held back so it reads quieter.
      h('rect', {
        x: x + 0.5,
        y: y + 0.5,
        width: width - 1,
        height: height - 1,
        rx: Math.max(radius - 0.5, 0),
        stroke: tk.component.button.outlineLine,
        'stroke-opacity': tk.name === 'light' ? 0.28 : 0.22,
        fill: 'none',
      }),
      hasIcon
        ? IconTile(ctx, {
            x: x + 8,
            y: y + (height - iconSize) / 2,
            size: iconSize,
            icon: ICONS[icon!],
            tone: 'subtle',
          })
        : null,
      Text(ctx, {
        x: textX,
        y: y + height / 2 + 1.8,
        role,
        content: placeholder,
        color: tk.text.subtle,
      }),
    ],
  });
}
