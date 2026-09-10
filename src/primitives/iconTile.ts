import { h, type Ctx, type VNode } from '../vsvg.ts';

export interface IconTileProps {
  x: number;
  y: number;
  size?: number;
  /** Icon from `ICONS`, scaled from its own authoring box to `size`. */
  icon?: { path: string; box: number };
  /** `subtle` matches the #8C96A9 placeholders left in the exports. */
  tone?: 'subtle' | 'accent' | 'primary' | 'onAccent' | 'soft';
  strokeIcon?: boolean;
}

/**
 * ICON TILE — a fixed-size slot for a glyph.
 *
 * The reference file literally contains two 20x20 `#8C96A9` rectangles acting
 * as unfilled icon placeholders, so this slot already exists in the design
 * language; it just wasn't named. Wire it to your icon set (Clay icons or
 * MingCute) and it becomes a picker in the editor.
 */
export function IconTile(ctx: Ctx, props: IconTileProps): VNode {
  const { x, y, size = 20, icon, tone = 'subtle', strokeIcon = true } = props;
  const tk = ctx.tokens;
  const color =
    tone === 'accent'
      ? tk.accent.base
      : tone === 'soft'
        ? tk.accent.soft
        : tone === 'primary'
          ? tk.text.primary
          : tone === 'onAccent'
            ? tk.text.onAccent
            : tk.text.subtle;

  if (!icon) {
    // Explicit placeholder — visible in the editor, flagged before export.
    return h('rect', {
      x,
      y,
      width: size,
      height: size,
      fill: color,
      'data-el': 'icon-placeholder',
    });
  }

  const s = size / icon.box;
  return h('g', { transform: `translate(${x} ${y}) scale(${s})`, 'data-el': 'icon' }, [
    h('path', {
      d: icon.path,
      stroke: strokeIcon ? color : undefined,
      fill: strokeIcon ? 'none' : color,
      'stroke-width': strokeIcon ? 1 / s : undefined,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ]);
}
