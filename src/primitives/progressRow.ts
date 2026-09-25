import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text } from './text.ts';

export interface ProgressRowProps {
  x: number;
  y: number;
  width: number;
  /** 0–1. */
  value: number;
  height?: number;
  label?: string;
  /** Baseline offset of the label above the track. */
  labelGap?: number;
  tone?: 'accent' | 'info' | 'success' | 'warning' | 'alert' | 'danger';
}

/**
 * PROGRESS ROW — a 3px track with a filled portion, optionally labelled.
 *
 * The single most repeated element in the whole asset set: the engagement
 * lists, the stat-tile micro-bars, and the contract-price columns are all this.
 */
export function ProgressRow(ctx: Ctx, props: ProgressRowProps): VNode {
  const { x, y, width, value, label } = props;
  const height = props.height ?? 3;
  const tk = ctx.tokens;
  const light = tk.name === 'light';

  const fill = !props.tone || props.tone === 'accent' ? tk.accent.base : tk.status[props.tone];

  const trackId = ctx.uid('track');
  ctx.defs.push(
    h(
      'linearGradient',
      { id: trackId, x1: x, y1: y, x2: x + width, y2: y, gradientUnits: 'userSpaceOnUse' },
      [
        h('stop', { 'stop-color': tk.glass.lineFrom, 'stop-opacity': light ? 0.5 : 0.25 }),
        h('stop', { offset: 1, 'stop-color': tk.glass.lineFrom, 'stop-opacity': light ? 0.2 : 0.05 }),
      ],
    ),
  );

  return h('g', { 'data-el': 'progress-row' }, [
    label
      ? Text(ctx, {
          x,
          y: y - (props.labelGap ?? 5),
          role: 'micro',
          content: label,
          color: tk.text.muted,
        })
      : null,
    h('rect', {
      x,
      y,
      width,
      height,
      rx: height / 2,
      fill: tk.neutral.ink,
      'fill-opacity': light ? 0.08 : 0.1,
    }),
    h('rect', {
      x: x - 0.25,
      y: y - 0.25,
      width: width + 0.5,
      height: height + 0.5,
      rx: height / 2 + 0.25,
      stroke: `url(#${trackId})`,
      fill: 'none',
      'stroke-width': 0.5,
    }),
    h('rect', {
      x,
      y,
      width: Math.max(width * Math.min(Math.max(value, 0), 1), height),
      height,
      rx: height / 2,
      fill,
    }),
  ]);
}
