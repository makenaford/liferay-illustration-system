import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface SkeletonBarProps {
  x: number;
  y: number;
  width: number;
  height?: number;
}

/**
 * SKELETON BAR — a rounded placeholder block standing in for a line of text
 * that isn't meant to be read (the audit-log rows, the loading states).
 *
 * Worth having as its own primitive rather than a rect: it means "text we are
 * deliberately not showing", which is a design decision the editor should be
 * able to express directly.
 */
export function SkeletonBar(ctx: Ctx, props: SkeletonBarProps): VNode {
  const { x, y, width } = props;
  const height = props.height ?? 8;
  const light = ctx.tokens.name === 'light';

  return h('rect', {
    x,
    y,
    width,
    height,
    rx: height / 2,
    fill: light ? '#101828' : '#FFFFFF',
    'fill-opacity': light ? 0.09 : 0.1,
    'data-el': 'skeleton-bar',
  });
}
