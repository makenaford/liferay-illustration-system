import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, measureTextEl, type TypeRole } from './text.ts';

export interface StatBlockProps {
  x: number;
  /** Baseline of the value. */
  y: number;
  value: string;
  label?: string;
  /** Label above or below the value. */
  labelPosition?: 'above' | 'below';
  /** Defaults to `display`, the scale's hero number. */
  valueRole?: TypeRole;
  labelRole?: TypeRole;
  /** The label in small caps — the set's `Small Caps` style. Defaults on. */
  labelSmallCaps?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  valueColor?: string;
}

/** Space between the value's line box and the label's. */
const GAP = 4;

/**
 * Where a stat's two lines go, from their own type: the one place a stat is
 * measured, so the renderer, auto-layout, the canvas's selection box and the
 * audit cannot disagree about it. Offsets are from the value's baseline,
 * which is the element's `y`.
 */
export function statLayout(p: Omit<StatBlockProps, 'x' | 'y' | 'valueColor'>) {
  const value = measureTextEl({ role: p.valueRole ?? 'display', content: p.value });
  const label = p.label
    ? measureTextEl({ role: p.labelRole ?? 'caption', content: p.label, smallCaps: p.labelSmallCaps ?? true })
    : null;
  const above = p.labelPosition === 'above';
  const descent = (b: { height: number; baseline: number }) => b.height - b.baseline;
  return {
    width: Math.max(value.width, label?.width ?? 0),
    height: value.height + (label ? GAP + label.height : 0),
    /** From the box's top down to the value's baseline. */
    baseline: label && above ? label.height + GAP + value.baseline : value.baseline,
    /** The label's baseline, from the value's. */
    labelOffset: !label ? 0 : above ? -(value.baseline + GAP + descent(label)) : descent(value) + GAP + label.baseline,
  };
}

/**
 * STAT BLOCK — a value with a supporting label. The most repeated composite in
 * the set ("12,847 / Total Connections", "99.9% / Uptime", "0 / Open
 * vulnerabilities", "15x"): the figure in the display step, its label in
 * small caps.
 */
export function StatBlock(ctx: Ctx, props: StatBlockProps): VNode {
  const { x, y, value, label, anchor = 'start' } = props;
  const L = statLayout(props);

  return h('g', { 'data-el': 'stat-block' }, [
    label
      ? Text(ctx, {
          x,
          y: y + L.labelOffset,
          role: props.labelRole ?? 'caption',
          content: label,
          anchor,
          smallCaps: props.labelSmallCaps ?? true,
        })
      : null,
    Text(ctx, { x, y, role: props.valueRole ?? 'display', content: value, anchor, color: props.valueColor }),
  ]);
}
