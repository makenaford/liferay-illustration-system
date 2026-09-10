import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, typeStyle } from './text.ts';
import { measureText } from '../fontMetrics.generated.ts';

/** Inset either side of the label. */
const BADGE_PAD = 6;
/** Dot diameter plus its gap to the text. */
const DOT_SPACE = 3 + 3;

/** The width a badge needs for its label — exported so layout can measure it. */
export function badgeWidth(
  label: string,
  dot: boolean | undefined,
  tone: string | undefined,
): number {
  const st = typeStyle('micro', 'semibold');
  const hasDot = dot ?? (tone === 'success' || tone === 'info');
  return (
    Math.ceil(measureText(label, st.size, st.weight)) +
    BADGE_PAD * 2 +
    (hasDot ? DOT_SPACE : 0)
  );
}

export interface BadgeProps {
  x: number;
  y: number;
  /**
   * Omit to HUG the label.
   *
   * A badge is a label, and a label is as wide as its text — the design
   * system's `Label` hugs too. Pinning a number meant that changing "Active"
   * to "Syncing", or nudging the type scale, silently clipped it. Hugging
   * makes that class of bug impossible.
   */
  width?: number;
  height?: number;
  label: string;
  /** Semantic tone. `success` and `info` carry the status dot by default. */
  tone?: 'success' | 'info' | 'accent' | 'neutral';
  dot?: boolean;
  /**
   * How it's drawn, following the design system's own three treatments:
   *
   *   tonal    `Label Style=Filled`  — a flat tonal fill (the default)
   *   ring     `Chip State=Default`  — transparent with a 1px gradient ring
   *   gradient `Label Style=Gradient`— transparent with the BRAND ring
   *   glass    `Label Style=Glass`   — translucent fill, no hairline
   *
   * A *toned* badge (success, info) keeps the status colour and ignores this,
   * because the tone is the information.
   */
  variant?: 'tonal' | 'ring' | 'gradient' | 'glass';
}

/**
 * BADGE — the small outlined status pill. Appears 20+ times across the set
 * ("+14.2%", "Synced", "HIPAA", "Active").
 *
 * The tone colours are where light mode earns its keep: `#0FFF0F` at 5% fill
 * with a neon stroke works on near-black and is invisible on white, so the
 * token set swaps in a saturated equivalent rather than the same hex.
 */
export function Badge(ctx: Ctx, props: BadgeProps): VNode {
  const { x, y, label, tone = 'neutral', variant = 'tonal' } = props;
  const height = props.height ?? 13;
  const width = props.width ?? badgeWidth(label, props.dot, tone);
  const tk = ctx.tokens;
  const light = tk.name === 'light';
  const L = tk.component.label;
  const C = tk.component.chip;

  const toned = tone !== 'neutral';
  const toneColor =
    tone === 'success'
      ? tk.status.success
      : tone === 'info'
        ? tk.status.info
        : tk.accent.base;

  const dot = props.dot ?? (tone === 'success' || tone === 'info');
  const dotR = 1.5;
  const textX = dot ? x + 4 + dotR * 2 + 3 : x + width / 2;

  const rx = height / 2;
  const surfaces: (VNode | null)[] = [];
  let inkColor: string;

  /** A 1px gradient ring, drawn the way the design system draws all of them. */
  const ring = (from: string, to: string, deg: number) => {
    const id = ctx.uid('badgering');
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
    ctx.defs.push(
      h(
        'linearGradient',
        {
          id,
          x1: x + width / 2 - dx * half,
          y1: y + height / 2 - dy * half,
          x2: x + width / 2 + dx * half,
          y2: y + height / 2 + dy * half,
          gradientUnits: 'userSpaceOnUse',
        },
        [
          h('stop', { 'stop-color': from }),
          h('stop', { offset: 1, 'stop-color': to }),
        ],
      ),
    );
    return h('rect', {
      x: x + 0.5,
      y: y + 0.5,
      width: width - 1,
      height: height - 1,
      rx: rx - 0.5,
      stroke: `url(#${id})`,
      fill: 'none',
    });
  };

  if (toned) {
    // The status colour is the information, so it keeps its own tonal fill
    // and matching hairline regardless of variant.
    surfaces.push(
      h('rect', { x, y, width, height, rx, fill: toneColor, 'fill-opacity': light ? 0.1 : 0.05 }),
      h('rect', {
        x: x + 0.5,
        y: y + 0.5,
        width: width - 1,
        height: height - 1,
        rx: rx - 0.5,
        stroke: toneColor,
        'stroke-opacity': light ? 0.55 : 1,
        fill: 'none',
      }),
    );
    inkColor = toneColor;
  } else if (variant === 'ring') {
    // `Chip State=Default` — transparent, with the outline-line into
    // Primary Blue Accent hairline at 135deg.
    surfaces.push(ring(C.ringFrom, C.ringTo, 135));
    inkColor = tk.text.primary;
  } else if (variant === 'gradient') {
    // `Label Style=Gradient` — no fill, brand-to-accent ring corner to corner.
    surfaces.push(ring(L.ringFrom, L.ringTo, 135));
    inkColor = tk.text.primary;
  } else if (variant === 'glass') {
    surfaces.push(
      h('rect', {
        x, y, width, height, rx,
        fill: tk.surface.translucent,
        'fill-opacity': tk.surface.translucentOpacity,
      }),
    );
    inkColor = tk.text.primary;
  } else {
    // `Label Style=Filled` — the tonal fill, no hairline at all.
    surfaces.push(h('rect', { x, y, width, height, rx, fill: L.tonalBg }));
    inkColor = L.tonalText;
  }

  return h('g', { 'data-el': `badge-${toned ? tone : variant}` }, [
    ...surfaces,
    dot ? h('circle', { cx: x + 4 + dotR, cy: y + height / 2, r: dotR, fill: toneColor }) : null,
    Text(ctx, {
      x: textX,
      y: y + height / 2 + 2.2,
      role: 'micro',
      content: label,
      anchor: dot ? 'start' : 'middle',
      color: inkColor,
    }),
  ]);
}
