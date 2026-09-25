import type { Doc, Element } from '../src/document.ts';
import { boundsOf, type Box } from './bounds.ts';

/**
 * CONNECTOR SNAPPING — ends that land on the things they connect.
 *
 * Every item offers four anchors, the midpoints of its sides. An end dragged
 * near one snaps to it. An end dropped anywhere ON an item snaps to the side
 * that faces the connector's other end, which is almost always the side you
 * meant — so "drag from this card to that card" needs no aiming.
 *
 * Snapping also picks the elbow: a line should leave and arrive square to the
 * sides it touches, so an end on a left or right side runs horizontally there
 * and one on a top or bottom side runs vertically.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Target {
  path: string;
  box: Box;
}

export interface Snapped {
  point: [number, number];
  /** Set when the end is on an item. */
  target?: Target;
  side?: Side;
  /**
   * True when the end was dragged to a particular anchor, rather than
   * dropped on the item and given the side that faces the other end. Only
   * a facing side may be re-aimed when the other end moves.
   */
  exact?: boolean;
}

/** The side of `target` that faces `other`, as a snapped end. */
export function facing(target: Target, other: [number, number]): Snapped {
  const a = anchors(target.box);
  const side = (Object.keys(a) as Side[]).reduce((best, s) => (dist(a[s], other) < dist(a[best], other) ? s : best));
  return { point: a[side], target, side };
}

/** Everything a connector end can land on, measured as the selection box is. */
export function connectTargets(resolved: Doc, docEl: HTMLElement | null, exclude: string | null): Target[] {
  const out: Target[] = [];
  const walk = (els: Element[], prefix: string) =>
    els.forEach((el, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (path === exclude) return;
      // Connecting to a connector is never the intent; its box is the whole route.
      if (el.type !== 'connector') {
        const node = docEl?.querySelector<SVGGraphicsElement>(`[data-path="${path}"]`) ?? null;
        const box = boundsOf(el, node);
        if (box && box.width > 0 && box.height > 0) out.push({ path, box });
      }
      const kids = (el as { children?: Element[] }).children;
      if (kids) walk(kids, path);
    });
  walk(resolved.elements, '');
  return out;
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
const within = (p: [number, number], b: Box) =>
  p[0] >= b.x && p[0] <= b.x + b.width && p[1] >= b.y && p[1] <= b.y + b.height;

/** The item under a point: the smallest box containing it, which is the innermost. */
export function targetAt(point: [number, number], targets: Target[]): Target | null {
  let best: Target | null = null;
  for (const t of targets) {
    if (!within(point, t.box)) continue;
    if (!best || t.box.width * t.box.height < best.box.width * best.box.height) best = t;
  }
  return best;
}

/**
 * Where an end at `point` lands, given the connector's other end. `tol` is
 * the anchor snap distance in artboard units.
 */
export function snapEnd(point: [number, number], other: [number, number], targets: Target[], tol: number): Snapped {
  // 1. Close to an anchor: that anchor.
  let near: { t: Target; side: Side; p: [number, number]; d: number } | null = null;
  for (const t of targets) {
    for (const [side, p] of Object.entries(anchors(t.box)) as [Side, [number, number]][]) {
      const d = dist(point, p);
      if (d <= tol && (!near || d < near.d)) near = { t, side, p, d };
    }
  }
  if (near) return { point: near.p, target: near.t, side: near.side, exact: true };

  // 2. On an item: the side facing the other end.
  const on = targetAt(point, targets);
  if (on) return facing(on, other);

  // 3. Free.
  return { point };
}

/**
 * The elbow that leaves `fromSide` and arrives at `toSide` squarely. `hv`
 * starts horizontal, `vh` starts vertical; the start side wins when both are
 * known and disagree, since that is where the eye picks the line up.
 */
export function routeFor(
  fromSide: Side | undefined,
  toSide: Side | undefined,
  current: 'hv' | 'vh' | 'straight' | undefined,
): 'hv' | 'vh' | 'straight' {
  const horizontal = (s: Side) => s === 'left' || s === 'right';
  if (fromSide) return horizontal(fromSide) ? 'hv' : 'vh';
  // Only the end is known: arriving horizontally means the last leg is
  // horizontal, which is the `vh` route.
  if (toSide) return horizontal(toSide) ? 'vh' : 'hv';
  return current ?? 'hv';
}
