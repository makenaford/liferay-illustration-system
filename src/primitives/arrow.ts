import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface ArrowProps {
  x: number;
  /** Vertical centre. */
  y: number;
  width?: number;
  thickness?: number;
  direction?: 'right' | 'left' | 'up';
  tone?: 'primary' | 'accent';
}

/**
 * ARROW — the transition marker in the before/after composition.
 */
export function Arrow(ctx: Ctx, props: ArrowProps): VNode {
  const { x, y, direction = 'right', tone = 'primary' } = props;
  const w = props.width ?? 30;
  const t = props.thickness ?? 9;
  const tk = ctx.tokens;
  const color = tone === 'accent' ? tk.accent.base : tk.text.primary;

  const head = t * 1.6;
  const shaft = w - head;
  const half = t / 2;

  // Drawn pointing right, then mirrored/rotated by transform.
  const d =
    `M0 ${-half}` +
    `L${shaft} ${-half}` +
    `L${shaft} ${-head}` +
    `L${w} 0` +
    `L${shaft} ${head}` +
    `L${shaft} ${half}` +
    `L0 ${half}Z`;

  const rotate = direction === 'left' ? 180 : direction === 'up' ? -90 : 0;

  return h(
    'g',
    {
      transform: `translate(${x} ${y})${rotate ? ` rotate(${rotate})` : ''}`,
      'data-el': 'arrow',
    },
    [h('path', { d, fill: color })],
  );
}
