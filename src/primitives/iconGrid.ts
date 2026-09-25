import { h, type Ctx, type VNode } from '../vsvg.ts';
import { iconArt, type IconStyle } from '../icons.ts';
import { IconTile } from './iconTile.ts';

export interface IconGridProps {
  x: number;
  y: number;
  /** Icon keys, laid out left-to-right then wrapped. */
  icons: (string | null)[];
  columns: number;
  size?: number;
  gapX?: number;
  gapY?: number;
  tone?: 'subtle' | 'accent' | 'primary' | 'soft';
  /** A resolved colour for every icon, which wins over `tone`. */
  color?: string;
  /** The style for icons without their own — see `styles`. */
  iconStyle?: IconStyle;
  /** Each icon's own style, by position; a gap takes `iconStyle`. */
  styles?: (IconStyle | null)[];
  /**
   * Give each icon a clickable square, for the editor: an outline icon is
   * thin strokes, and a click between them would miss. Exports leave it out.
   */
  hitAreas?: boolean;
}

/**
 * ICON GRID — the row of tool glyphs in the "fragmented tools" panel.
 * A `null` entry renders the visible placeholder, so gaps stay obvious.
 * Each icon is its own slot (`data-slot`), so the editor can pick one out.
 */
export function IconGrid(ctx: Ctx, props: IconGridProps): VNode {
  const { x, y, icons, columns } = props;
  const size = props.size ?? 24;
  const gapX = props.gapX ?? 43;
  const gapY = props.gapY ?? 40;

  return h(
    'g',
    { 'data-el': 'icon-grid' },
    icons.map((key, i) =>
      h('g', { 'data-slot': i }, [
        props.hitAreas
          ? h('rect', {
              x: x + (i % columns) * gapX,
              y: y + Math.floor(i / columns) * gapY,
              width: size,
              height: size,
              fill: 'transparent',
            })
          : null,
        IconTile(ctx, {
          x: x + (i % columns) * gapX,
          y: y + Math.floor(i / columns) * gapY,
          size,
          icon: iconArt(key, props.styles?.[i] ?? props.iconStyle),
          tone: props.tone ?? 'soft',
          color: props.color,
        }),
      ]),
    ),
  );
}
