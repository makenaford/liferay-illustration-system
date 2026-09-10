import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface ToggleProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  on: boolean;
}

/**
 * TOGGLE — the switch used in the segmentation overlay. Off uses the soft
 * accent; on uses the gradient sweep, matching the reference.
 */
export function Toggle(ctx: Ctx, props: ToggleProps): VNode {
  const { x, y, on } = props;
  const width = props.width ?? 42;
  const height = props.height ?? 13;
  const tk = ctx.tokens;

  const gradId = ctx.uid('toggle');
  const [c0, c1, c2] = tk.accent.gradient;
  ctx.defs.push(
    h(
      'linearGradient',
      { id: gradId, x1: x, y1: y, x2: x + width, y2: y + height, gradientUnits: 'userSpaceOnUse' },
      on
        ? [
            h('stop', { 'stop-color': c0 }),
            h('stop', { offset: 0.5, 'stop-color': c1 }),
            h('stop', { offset: 1, 'stop-color': c2 }),
          ]
        : [
            h('stop', { 'stop-color': tk.accent.soft }),
            h('stop', { offset: 1, 'stop-color': tk.accent.soft }),
          ],
    ),
  );

  const knobR = height / 2 - 0.8;
  const knobCx = on ? x + width - height / 2 : x + height / 2;

  return h('g', { 'data-el': `toggle-${on ? 'on' : 'off'}` }, [
    h('rect', { x, y, width, height, rx: height / 2, fill: `url(#${gradId})` }),
    h('circle', { cx: knobCx, cy: y + height / 2, r: knobR, fill: '#FFFFFF' }),
  ]);
}
