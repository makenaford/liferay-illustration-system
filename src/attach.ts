import type { ConnectorEl, Doc, Element } from './document.ts';
import { resolveLayout } from './autolayout.ts';
import { textBox } from './fontMetrics.generated.ts';
import { typeStyle } from './primitives/text.ts';
import { badgeWidth } from './primitives/badge.ts';

/**
 * ATTACHED CONNECTORS — ends that follow the items they join.
 *
 * A connector end can be attached to an element: `attach.from` / `attach.to`
 * name the element by its `uid` and say which side the end sits on. After
 * every edit, and before every render, `reattach` moves each attached end to
 * that side's midpoint wherever the element now is — so dragging a card,
 * resizing it, reflowing an auto-layout column or moving it into another
 * container all carry the connector with it.
 *
 * Elements are otherwise addressed by path, which changes when anything is
 * reordered or nested; a `uid` is what survives that. It is given to an
 * element only when a connector attaches to it, so documents gain one field
 * where it is needed and nowhere else.
 *
 * A side is either fixed (the end was aimed at that anchor) or `auto`: it
 * faces the other end, so the line stays tidy as things move.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function anchors(box: Box): Record<Side, [number, number]> {
  return {
    top: [box.x + box.width / 2, box.y],
    right: [box.x + box.width, box.y + box.height / 2],
    bottom: [box.x + box.width / 2, box.y + box.height],
    left: [box.x, box.y + box.height / 2],
  };
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The side of `box` whose anchor is closest to `other`. */
export function facingSide(box: Box, other: [number, number]): Side {
  const a = anchors(box);
  return (Object.keys(a) as Side[]).reduce((best, s) => (dist(a[s], other) < dist(a[best], other) ? s : best));
}

/**
 * The elbow that leaves `fromSide` and arrives at `toSide` squarely: `hv`
 * starts horizontal, `vh` vertical. The start side wins when both are known.
 */
export function routeFor(
  fromSide: Side | undefined,
  toSide: Side | undefined,
  current: 'hv' | 'vh' | 'straight' | undefined,
): 'hv' | 'vh' | 'straight' {
  const horizontal = (s: Side) => s === 'left' || s === 'right';
  if (fromSide) return horizontal(fromSide) ? 'hv' : 'vh';
  if (toSide) return horizontal(toSide) ? 'vh' : 'hv';
  return current ?? 'hv';
}

/**
 * An element's box from its own props — no DOM, so this runs in the Node
 * build as well as the editor. Text is measured with the same metrics the
 * layout uses. Elements with no box of their own (a stat block) return null,
 * and an end attached to one stays where it was last put.
 */
export function boxOf(el: Element): Box | null {
  switch (el.type) {
    case 'text': {
      const st = typeStyle(el.role, el.weight);
      const b = textBox(el.content, st.size, st.weight);
      const x = el.anchor === 'middle' ? el.x - b.width / 2 : el.anchor === 'end' ? el.x - b.width : el.x;
      return { x, y: el.y - b.baseline, width: b.width, height: b.height };
    }
    case 'avatar': {
      const r = el.r ?? 11.875;
      return { x: el.cx - r, y: el.cy - r, width: r * 2, height: r * 2 };
    }
    case 'connector':
      return null;
    case 'icon':
    case 'spotIcon': {
      const s = el.size ?? (el.type === 'icon' ? 20 : 48);
      return { x: el.x, y: el.y, width: s, height: s };
    }
    case 'progress':
      return { x: el.x, y: el.y, width: el.width, height: el.height ?? 3 };
    case 'skeleton':
      return { x: el.x, y: el.y, width: el.width, height: el.height ?? 8 };
    case 'badge':
      return { x: el.x, y: el.y, width: el.width ?? badgeWidth(el.label, el.dot, el.tone), height: el.height ?? 13 };
  }
  const b = el as unknown as Partial<Box>;
  return typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number'
    ? (b as Box)
    : null;
}

/** A fresh, collision-proof element id. */
export function newUid(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * A copy of `el` with every `uid` removed, for duplicate and paste: a copy is
 * a different element, and keeping the original's uid would let it steal the
 * original's connectors.
 */
export function withoutUids<T extends Element>(el: T): T {
  const { uid: _drop, ...rest } = el as T & { uid?: string };
  const kids = (rest as { children?: Element[] }).children;
  return (kids ? { ...rest, children: kids.map(withoutUids) } : rest) as T;
}

const round = (n: number) => Math.round(n * 100) / 100;
const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/**
 * Move every attached connector end to where its element now is. Returns
 * `doc` itself when nothing moved, so it is cheap to call after every edit.
 */
export function reattach(doc: Doc): Doc {
  if (!hasAttached(doc.elements)) return doc;

  // Boxes by uid, from the resolved tree so auto-placed items count where
  // they are drawn.
  const boxes = new Map<string, Box>();
  const collect = (els: Element[]) =>
    els.forEach((el) => {
      const uid = (el as { uid?: string }).uid;
      if (uid) {
        const b = boxOf(el);
        if (b) boxes.set(uid, b);
      }
      const kids = (el as { children?: Element[] }).children;
      if (kids) collect(kids);
    });
  collect(resolveLayout(doc).elements);

  let changed = false;
  const fix = (els: Element[]): Element[] =>
    els.map((el) => {
      const kids = (el as { children?: Element[] }).children;
      const next = kids ? ({ ...el, children: fix(kids) } as Element) : el;
      if (next.type !== 'connector' || !next.attach) return next;

      const c = next as ConnectorEl;
      const fromBox = c.attach?.from ? boxes.get(c.attach.from.uid) : undefined;
      const toBox = c.attach?.to ? boxes.get(c.attach.to.uid) : undefined;
      if (!fromBox && !toBox) return next;

      // Where each end is aiming: the other box's centre, or the free end.
      const centre = (b: Box): [number, number] => [b.x + b.width / 2, b.y + b.height / 2];
      const aimFrom = toBox ? centre(toBox) : c.to;
      const aimTo = fromBox ? centre(fromBox) : c.from;
      const fromSide = fromBox
        ? c.attach!.from!.side === 'auto' ? facingSide(fromBox, aimFrom) : c.attach!.from!.side
        : undefined;
      const toSide = toBox
        ? c.attach!.to!.side === 'auto' ? facingSide(toBox, aimTo) : c.attach!.to!.side
        : undefined;
      const pt = (b: Box, s: Side): [number, number] => anchors(b)[s].map(round) as [number, number];
      const from = fromBox && fromSide ? pt(fromBox, fromSide) : c.from;
      const to = toBox && toSide ? pt(toBox, toSide) : c.to;
      const route = routeFor(fromSide, toSide, c.route);

      if (same(from, c.from) && same(to, c.to) && route === c.route) return next;
      changed = true;
      return { ...c, from, to, route } as Element;
    });

  const elements = fix(doc.elements);
  return changed ? { ...doc, elements } : doc;
}

function hasAttached(els: Element[]): boolean {
  return els.some(
    (el) =>
      (el.type === 'connector' && !!el.attach) ||
      hasAttached((el as { children?: Element[] }).children ?? []),
  );
}
