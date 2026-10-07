import { h, text as textNode, type Ctx, type VNode } from '../vsvg.ts';
import { Text, textStyle, measureTextEl, type TypeRole } from './text.ts';
import { Surface } from './surface.ts';
import { IconTile } from './iconTile.ts';
import { iconArt } from '../icons.ts';
import type { SurfaceName, SurfaceSpec } from '../tokens.ts';

/** What leads a menu item: nothing, a checkbox, a radio, a small profile tile, or an icon. */
export type DropdownLead = 'none' | 'checkbox' | 'radio' | 'profile' | 'icon';

/** A profile tile's colours, from the chart palette — the Spaces menu's purple and yellow, and four more. */
export const PROFILE_COLORS = {
  purple: { line: '#5D00E5', fill: '#F6F0FF', ink: '#5D00E5' },
  yellow: { line: '#E5A600', fill: '#FFFBF0', ink: '#705100' },
  blue: { line: '#0B5FFF', fill: '#F0F5FF', ink: '#0B5FFF' },
  green: { line: '#287D3C', fill: '#EDF9F0', ink: '#287D3C' },
  red: { line: '#DA1414', fill: '#FEEFEF', ink: '#B00F0F' },
  teal: { line: '#0E8C8C', fill: '#EBF8F8', ink: '#0A6B6B' },
} as const;
export type ProfileColor = keyof typeof PROFILE_COLORS;

export interface DropdownItem {
  label: string;
  /** Defaults to `none`. */
  lead?: DropdownLead;
  /** A checkbox ticked, a radio chosen. */
  checked?: boolean;
  /** The row picked out: lifted, tinted, its label semibold. */
  selected?: boolean;
  /** A profile tile's letter. Defaults to the label's first. */
  initial?: string;
  /** A profile tile's colour. Defaults by position: purple, yellow, blue… */
  color?: ProfileColor;
  /** An icon key — see `iconArt`. */
  icon?: string;
}

/** Any card surface, or `white`: an opaque menu, as a product's own UI draws one. */
export type DropdownSurface = SurfaceName | 'white';

export interface DropdownProps {
  x: number;
  y: number;
  width: number;
  /** The header: what the menu chooses ("Spaces"). Without one, the menu is only its items. */
  label?: string;
  items: DropdownItem[];
  /** Closed, only the header shows. Defaults to open. */
  open?: boolean;
  /** Defaults to `white`. */
  surface?: DropdownSurface;
  /** The labels' type. Defaults to `bodySmall`. */
  role?: TypeRole;
  radius?: number;
}

/*
 * Measured off the Spaces menu (Japan Site hero images, Figma 284:3561),
 * drawn at 2.53x: rows 63 tall with 25 in from the side, a 38 tile, 13
 * between the tile and its label. Here the row follows the type: 28 tall at
 * the 12px default, the tile 16, the gaps 10 and 6.
 */
const PAD_X = 10;
const LEAD_GAP = 6;
const rowHeight = (role: TypeRole) => Math.round((textStyle({ role }).size * 2.33) / 2) * 2;
const leadSize = (role: TypeRole) => Math.round(textStyle({ role }).size * 1.33);

/**
 * The white menu: white frosted glass — near opaque, so it reads as a
 * product's own menu, with what is beneath blurred through it — a light
 * hairline, and a soft shadow inside the shadow limits.
 */
export const WHITE: SurfaceSpec = {
  fill: { angle: 180, stops: [{ color: '#FFFFFF', opacity: 0.85 }] },
  blur: 20,
  line: { angle: 180, stops: [{ color: '#E7E7ED', opacity: 1 }] },
  shadow: [{ dx: 0, dy: 2, blur: 8, color: '#272833', opacity: 0.08 }],
};

/**
 * The picked row: the Highlighted surface, lifted off the menu as the Spaces
 * menu draws it — light blue, standing `OVERHANG` past the menu's sides. Over the white
 * menu it is the fixed Highlighted over light, which is drawn for a light
 * ground in either theme; over glass, the theme's own Highlighted. It
 * frosts the menu beneath it — see the end of `Dropdown`.
 */
export const OVERHANG = 4;
/** `Primary L3` (#F0F5FF), the row's colour in the Spaces menu. */
const HIGHLIGHT_TINT = '#F0F5FF';
/** Translucent enough that its blur shows: over the white menu it still reads as the Figma's blue. */
const HIGHLIGHT_TINT_OPACITY = 0.75;
/** The row's background blur where its surface has none. */
const HIGHLIGHT_BLUR = 20;
export const highlightOf = (surface: DropdownSurface): SurfaceName =>
  surface === 'white' ? 'glass-highlighted-over-light' : 'glass-highlighted';

/** The menu's rows and its height — what the layout measures and the primitive draws. */
export function dropdownLayout(p: Pick<DropdownProps, 'label' | 'items' | 'open' | 'role'>) {
  const role = p.role ?? 'bodySmall';
  const row = rowHeight(role);
  const header = p.label?.trim() ? 1 : 0;
  const shown = p.open === false ? 0 : p.items.length;
  return { role, row, lead: leadSize(role), header, height: Math.max(row, (header + shown) * row) };
}

const DARK_INK = '#272833';

export function Dropdown(ctx: Ctx, props: DropdownProps): VNode {
  const { x, y, width, items } = props;
  const tk = ctx.tokens;
  const L = dropdownLayout(props);
  const { role, row, lead } = L;
  const surface = props.surface ?? 'white';
  const white = surface === 'white';
  const radius = props.radius ?? 6;
  // Dark type on the white menu in either theme; the theme's own on glass.
  const ink = white ? DARK_INK : tk.text.primary;
  const size = textStyle({ role }).size;
  const baseline = (top: number) => top + row / 2 + size * 0.355;

  const rows: (VNode | null)[] = [];
  let top = y;

  if (L.header) {
    const label = props.label ?? '';
    rows.push(Text(ctx, { x: x + PAD_X, y: baseline(top), role, weight: 'regular', content: label, color: ink }));
    // The chevron, down, as the Spaces menu shows it.
    const cx = x + width - PAD_X - 4;
    const cy = top + row / 2;
    const d = 1;
    rows.push(
      h('path', {
        d: `M${cx - 4} ${cy - 2 * d}L${cx} ${cy + 2 * d}L${cx + 4} ${cy - 2 * d}`,
        fill: 'none',
        stroke: ink,
        'stroke-opacity': 0.7,
        'stroke-width': 1.2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    top += row;
  }

  // The picked rows, drawn after the menu so they can frost it — see below.
  const lit: (() => VNode)[] = [];

  if (props.open !== false) {
    const order = Object.keys(PROFILE_COLORS) as ProfileColor[];
    let profiles = 0;
    items.forEach((item) => {
      const kind = item.lead ?? 'none';
      // The picked row lifts off the menu, past its sides — see `OVERHANG`.
      // The picked row is light blue on every menu, so its type is dark on every menu.
      const rowInk = item.selected ? DARK_INK : ink;
      const parts: (VNode | null)[] = [];
      let tx = x + PAD_X;
      const ly = top + (row - lead) / 2;
      if (kind !== 'none') {
        const color = kind === 'profile' ? (item.color ?? order[profiles++ % order.length]) : null;
        parts.push(leadMark(ctx, kind, item, tx, ly, lead, rowInk, color, white || !!item.selected));
        tx += lead + LEAD_GAP;
      }
      parts.push(
        Text(ctx, {
          x: tx,
          y: baseline(top),
          role,
          weight: item.selected ? 'semibold' : 'regular',
          content: item.label,
          color: rowInk,
        }),
      );
      const rowTop = top;
      if (item.selected) {
        const spec = tk.surfaces[highlightOf(surface)];
        lit.push(() =>
          Surface(ctx, {
            x: x - OVERHANG,
            y: rowTop,
            width: width + OVERHANG * 2,
            height: row,
            // A pill in a fully rounded menu; otherwise its own small corners.
            radius: radius >= row / 2 ? row / 2 : 4,
            // The Highlighted surface — its edge, glow, inner light and blur —
            // in the Spaces menu's light blue in place of its own wash.
            surface: { ...spec, blur: spec.blur || HIGHLIGHT_BLUR, fill: { angle: 180, stops: [{ color: HIGHLIGHT_TINT, opacity: HIGHLIGHT_TINT_OPACITY }] } },
            children: parts,
          }),
        );
      } else {
        rows.push(h('g', {}, parts));
      }
      top += row;
    });
  }

  const menu = Surface(ctx, {
    x,
    y,
    width,
    height: L.height,
    radius,
    surface: white ? WHITE : surface,
    children: rows,
  });
  if (!lit.length) return h('g', { 'data-el': `dropdown-${surface}` }, [menu]);

  /*
   * A picked row frosts the menu under it, not only what is under the menu:
   * its backdrop is what lies beneath the dropdown with the menu drawn over
   * it, by reference, so the menu is still drawn once. Where the row stands
   * past the menu's sides, that is what is beneath.
   */
  const menuId = ctx.uid('ddmenu');
  const under = ctx.backdropId;
  let rowsLit: VNode[];
  if (under) {
    const bd = ctx.uid('ddbd');
    ctx.defs.push(h('g', { id: bd }, [h('use', { href: `#${under}`, 'xlink:href': `#${under}` }), h('use', { href: `#${menuId}`, 'xlink:href': `#${menuId}` })]));
    ctx.backdropId = bd;
    rowsLit = lit.map((f) => f());
    ctx.backdropId = under;
  } else {
    rowsLit = lit.map((f) => f());
  }
  return h('g', { 'data-el': `dropdown-${surface}` }, [h('g', { id: menuId }, [menu]), ...rowsLit]);
}

function leadMark(
  ctx: Ctx,
  kind: DropdownLead,
  item: DropdownItem,
  x: number,
  y: number,
  s: number,
  ink: string,
  color: ProfileColor | null,
  onLight: boolean,
): VNode | null {
  const accent = ctx.tokens.accent.base;
  const cx = x + s / 2;
  const cy = y + s / 2;
  switch (kind) {
    case 'profile': {
      const c = PROFILE_COLORS[color ?? 'purple'];
      const letter = (item.initial || item.label.trim()[0] || '?').slice(0, 2).toUpperCase();
      const fs = Math.round(s * 0.5 * 10) / 10;
      return h('g', { 'data-el': 'dropdown-profile' }, [
        h('rect', { x: x + 0.35, y: y + 0.35, width: s - 0.7, height: s - 0.7, rx: s * 0.17, fill: c.fill, stroke: c.line, 'stroke-width': 0.7 }),
        textNode(
          'text',
          {
            x: cx,
            y: cy + fs * 0.355,
            'font-family': ctx.tokens.font.family,
            'font-size': fs,
            'font-weight': 600,
            'text-anchor': 'middle',
            fill: c.ink,
          },
          letter,
        ),
      ]);
    }
    case 'icon':
      return IconTile(ctx, { x, y, size: s, color: ink, icon: iconArt(item.icon ?? 'mc:dashboard_3') });
    case 'checkbox': {
      const r = s * 0.42;
      return item.checked
        ? h('g', {}, [
            h('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r * 0.4, fill: accent }),
            h('path', {
              d: `M${cx - r * 0.5} ${cy}l${r * 0.35} ${r * 0.38}l${r * 0.68} ${-r * 0.8}`,
              fill: 'none',
              stroke: '#FFFFFF',
              'stroke-width': Math.max(1.2, r * 0.28),
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
          ])
        : h('rect', {
            x: cx - r + 0.5, y: cy - r + 0.5, width: r * 2 - 1, height: r * 2 - 1, rx: r * 0.4,
            fill: onLight ? '#FFFFFF' : 'none', stroke: ink, 'stroke-opacity': 0.5, 'stroke-width': 1,
          });
    }
    case 'radio': {
      const r = s * 0.42;
      return item.checked
        ? h('g', {}, [
            h('circle', { cx, cy, r, fill: accent }),
            h('circle', { cx, cy, r: r * 0.4, fill: '#FFFFFF' }),
          ])
        : h('circle', { cx, cy, r: r - 0.5, fill: onLight ? '#FFFFFF' : 'none', stroke: ink, 'stroke-opacity': 0.5, 'stroke-width': 1 });
    }
    default:
      return null;
  }
}

/** The widest row, for a menu that should hug its labels. */
export function dropdownContentWidth(p: DropdownProps): number {
  const L = dropdownLayout(p);
  const w = (s: string, bold = false) => measureTextEl({ role: L.role, content: s, weight: bold ? 'semibold' : undefined }).width;
  const head = L.header ? w(p.label ?? '') + 8 + 6 : 0;
  const rows = p.items.map((i) => ((i.lead ?? 'none') === 'none' ? 0 : L.lead + LEAD_GAP) + w(i.label, i.selected));
  return Math.ceil(Math.max(head, ...rows, 0) + PAD_X * 2);
}
