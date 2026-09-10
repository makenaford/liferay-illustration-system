import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, type TypeRole } from './text.ts';

export interface StatBlockProps {
  x: number;
  /** Baseline of the value. */
  y: number;
  value: string;
  label?: string;
  /** Label above or below the value. */
  labelPosition?: 'above' | 'below';
  valueRole?: TypeRole;
  labelRole?: TypeRole;
  anchor?: 'start' | 'middle' | 'end';
  valueColor?: string;
}

/**
 * STAT BLOCK — a value with a supporting label. The most repeated composite in
 * the set ("12,847 / Total Connections", "99.9% / Uptime", "0 / Open
 * vulnerabilities", "15x").
 */
export function StatBlock(ctx: Ctx, props: StatBlockProps): VNode {
  const {
    x,
    y,
    value,
    label,
    labelPosition = 'below',
    valueRole = 'title',
    labelRole = 'caption',
    anchor = 'start',
  } = props;

  const gap = labelPosition === 'above' ? -14 : 11;

  return h('g', { 'data-el': 'stat-block' }, [
    label
      ? Text(ctx, { x, y: y + gap, role: labelRole, content: label, anchor })
      : null,
    Text(ctx, { x, y, role: valueRole, content: value, anchor, color: props.valueColor }),
  ]);
}
