import type { Element } from '../src/document.ts';
import { LAYOUT } from '../src/tokens.ts';
import { snap } from './grid.ts';
import { movedDeep } from './geometry.ts';

/**
 * CARD LAYOUT — align, stack, distribute and equalise a card's children.
 *
 * The editor is single-selection, so rather than bolt on multi-select these
 * act on *a card and its direct children*: select the card, act on what's
 * inside it. That turns out to be the right unit anyway — "make this card's
 * contents line up" is the actual task, and it means the padding, the
 * alignment and the gaps all come from one place instead of being agreed
 * between three separately-selected elements.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A card's content box: its frame inset by the padding on all four sides. */
export function contentBox(card: Element, padding: number): Box | null {
  const c = card as Element & { x?: number; y?: number; width?: number; height?: number };
  if (
    typeof c.x !== 'number' || typeof c.y !== 'number' ||
    typeof c.width !== 'number' || typeof c.height !== 'number'
  ) {
    return null;
  }
  return {
    x: c.x + padding,
    y: c.y + padding,
    width: Math.max(c.width - padding * 2, 0),
    height: Math.max(c.height - padding * 2, 0),
  };
}

/** Where an element's own box sits, for elements that have one. */
function frameOf(el: Element): Box | null {
  if (el.type === 'avatar') {
    const r = el.r ?? 11.875;
    return { x: el.cx - r, y: el.cy - r, width: r * 2, height: r * 2 };
  }
  const e = el as Element & { x?: number; y?: number; width?: number; height?: number; size?: number };
  if (typeof e.x !== 'number' || typeof e.y !== 'number') return null;
  const w = e.width ?? e.size;
  const h = e.height ?? e.size;
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  return { x: e.x, y: e.y, width: w, height: h };
}

/**
 * Text has no frame in the document — its extent depends on the glyphs. So
 * alignment moves text by its anchor point and leaves the anchor semantics
 * alone: a `middle`-anchored string centres on the box's centre, an
 * `end`-anchored one sits on its right edge. Trying to measure it here would
 * mean carrying font metrics the document doesn't have.
 */
function isText(el: Element) {
  return el.type === 'text' || el.type === 'stat';
}

export type Align = 'left' | 'centre' | 'right';

export function alignChildren(card: Element, padding: number, align: Align): Element {
  const box = contentBox(card, padding);
  const kids = (card as { children?: Element[] }).children;
  if (!box || !kids?.length) return card;

  const children = kids.map((kid) => {
    if (isText(kid)) {
      const t = kid as Element & { x: number; anchor?: string };
      const target =
        align === 'left' ? box.x : align === 'right' ? box.x + box.width : box.x + box.width / 2;
      const anchor = align === 'left' ? undefined : align === 'right' ? 'end' : 'middle';
      return { ...t, x: target, anchor } as Element;
    }
    const f = frameOf(kid);
    if (!f) return kid;
    const target =
      align === 'left'
        ? box.x
        : align === 'right'
          ? box.x + box.width - f.width
          : box.x + (box.width - f.width) / 2;
    return movedDeep(kid, target - f.x, 0);
  });

  return { ...card, children } as Element;
}

/** Set every framed child to the full content width. */
export function equaliseWidth(card: Element, padding: number): Element {
  const box = contentBox(card, padding);
  const kids = (card as { children?: Element[] }).children;
  if (!box || !kids?.length) return card;

  const children = kids.map((kid) => {
    const k = kid as Element & { x?: number; width?: number };
    if (typeof k.width !== 'number' || typeof k.x !== 'number') return kid;
    return { ...kid, x: box.x, width: box.width } as Element;
  });
  return { ...card, children } as Element;
}

/**
 * Stack children down the content box with a fixed gap, in their current
 * order. Elements with no measurable height (text) get a line's worth.
 */
export function stackChildren(card: Element, padding: number, gap: number): Element {
  const box = contentBox(card, padding);
  const kids = (card as { children?: Element[] }).children;
  if (!box || !kids?.length) return card;

  let cursor = box.y;
  const children = kids.map((kid) => {
    const f = frameOf(kid);
    if (!f) {
      // Text: its `y` is a baseline, so place the baseline a line into the row.
      const t = kid as Element & { y: number };
      const line = 12;
      const next = { ...t, y: snap(cursor + line * 0.8, 1) } as Element;
      cursor += line + gap;
      return next;
    }
    const moved = movedDeep(kid, 0, cursor - f.y);
    cursor += f.height + gap;
    return moved;
  });
  return { ...card, children } as Element;
}

/** Keep sizes and order, but even out the vertical gaps between children. */
export function distributeChildren(card: Element, padding: number): Element {
  const box = contentBox(card, padding);
  const kids = (card as { children?: Element[] }).children;
  if (!box || !kids || kids.length < 3) return card;

  const framed = kids
    .map((kid, i) => ({ kid, i, f: frameOf(kid) }))
    .filter((e): e is { kid: Element; i: number; f: Box } => e.f !== null)
    .sort((a, b) => a.f.y - b.f.y);
  if (framed.length < 3) return card;

  const first = framed[0].f;
  const last = framed[framed.length - 1].f;
  const span = last.y + last.height - first.y;
  const used = framed.reduce((n, e) => n + e.f.height, 0);
  const gap = (span - used) / (framed.length - 1);

  const moves = new Map<number, number>();
  let cursor = first.y;
  for (const e of framed) {
    moves.set(e.i, cursor - e.f.y);
    cursor += e.f.height + gap;
  }

  const children = kids.map((kid, i) => {
    const dy = moves.get(i);
    return dy === undefined || Math.abs(dy) < 0.01 ? kid : movedDeep(kid, 0, dy);
  });
  return { ...card, children } as Element;
}

/** Inset the card's children to a new padding, preserving relative positions. */
export function repadChildren(
  card: Element,
  fromPadding: number,
  toPadding: number,
): Element {
  const kids = (card as { children?: Element[] }).children;
  if (!kids?.length || fromPadding === toPadding) return card;
  const d = toPadding - fromPadding;
  return { ...card, children: kids.map((k) => movedDeep(k, d, d)) } as Element;
}

export const DEFAULT_PADDING = LAYOUT.cardPadding;
export const DEFAULT_GAP = LAYOUT.gap;
