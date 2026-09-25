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
  iconStyle?: IconStyle;
}

/**
 * ICON GRID — the row of tool glyphs in the "fragmented tools" panel.
 * A `null` entry renders the visible placeholder, so gaps stay obvious.
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
      IconTile(ctx, {
        x: x + (i % columns) * gapX,
        y: y + Math.floor(i / columns) * gapY,
        size,
        icon: iconArt(key, props.iconStyle),
        tone: props.tone ?? 'soft',
      }),
    ),
  );
}
