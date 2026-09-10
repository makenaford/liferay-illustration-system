import type { Box } from './bounds.ts';

/**
 * SMART ALIGNMENT GUIDES — Figma's red lines.
 *
 * While an element is dragged, its edges and centres are compared against
 * every sibling's, its container's content box, and the artboard. A match
 * inside the tolerance both draws a line and pulls the element onto it.
 *
 * The centre case is the one that is hard to see by eye and easy to get
 * wrong by a pixel, so centre matches are drawn differently from edge
 * matches rather than being folded in with them.
 */

export interface Guide {
  axis: 'x' | 'y';
  /** Where the line sits on its own axis. */
  at: number;
  /** The line's extent along the other axis. */
  from: number;
  to: number;
  kind: 'edge' | 'center';
}

export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** A labelled box, so a guide can say which target it matched. */
export interface Target {
  box: Box;
  /** The artboard and a container are weaker matches than a sibling. */
  weight?: number;
}

const lines = (b: Box, axis: 'x' | 'y') =>
  axis === 'x'
    ? ([
        [b.x, 'edge'],
        [b.x + b.width / 2, 'center'],
        [b.x + b.width, 'edge'],
      ] as const)
    : ([
        [b.y, 'edge'],
        [b.y + b.height / 2, 'center'],
        [b.y + b.height, 'edge'],
      ] as const);

/**
 * The best offset on one axis, plus every target that shares the winning
 * line so a run of aligned elements draws one guide through all of them.
 *
 * A centre match wins ties: when an element's left edge and its centre are
 * both a hair from a line, the centre is what the designer meant.
 */
function axisSnap(
  moving: Box,
  targets: Target[],
  tolerance: number,
  axis: 'x' | 'y',
): { delta: number; guides: Guide[] } | null {
  let best: { delta: number; at: number; kind: Guide['kind']; score: number } | null = null;

  for (const t of targets) {
    for (const [tv, tk] of lines(t.box, axis)) {
      for (const [mv, mk] of lines(moving, axis)) {
        const delta = tv - mv;
        if (Math.abs(delta) > tolerance) continue;
        // Prefer the closest line; among equals, prefer centre-to-centre,
        // then stronger targets.
        const score =
          Math.abs(delta) -
          (mk === 'center' && tk === 'center' ? tolerance / 2 : 0) +
          (t.weight ?? 0);
        if (!best || score < best.score) {
          best = { delta, at: tv, kind: mk === 'center' && tk === 'center' ? 'center' : 'edge', score };
        }
      }
    }
  }
  if (!best) return null;

  // Everything that lands on the winning line, so the guide spans them all.
  const at = best.at;
  const moved: Box =
    axis === 'x' ? { ...moving, x: moving.x + best.delta } : { ...moving, y: moving.y + best.delta };
  const on = [moved, ...targets.map((t) => t.box)].filter((b) =>
    lines(b, axis).some(([v]) => Math.abs(v - at) < 0.01),
  );

  const cross = (b: Box) =>
    axis === 'x' ? ([b.y, b.y + b.height] as const) : ([b.x, b.x + b.width] as const);
  const from = Math.min(...on.map((b) => cross(b)[0]));
  const to = Math.max(...on.map((b) => cross(b)[1]));

  return { delta: best.delta, guides: [{ axis, at, from, to, kind: best.kind }] };
}

/**
 * Snap `moving` onto whichever of `targets` it is nearly aligned with.
 *
 * Returns a zero offset and no guides when nothing is close, so the caller
 * can fall through to grid snapping.
 */
export function alignmentSnap(moving: Box, targets: Target[], tolerance: number): Snap {
  const x = axisSnap(moving, targets, tolerance, 'x');
  const y = axisSnap(moving, targets, tolerance, 'y');
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: [...(x?.guides ?? []), ...(y?.guides ?? [])],
  };
}

/**
 * Snap ONE edge onto a target line — what a resize needs, where only the
 * dragged edge moves and the opposite edge must stay put.
 *
 * Returns the value unchanged and no guide when nothing is close, so the
 * caller falls through to the grid exactly as a move does.
 */
export function edgeSnap(
  value: number,
  targets: Target[],
  tolerance: number,
  axis: 'x' | 'y',
  span: readonly [number, number],
): { value: number; guide: Guide | null } {
  let best: { at: number; kind: Guide['kind']; d: number; box: Box } | null = null;
  for (const t of targets) {
    for (const [tv, tk] of lines(t.box, axis)) {
      const d = Math.abs(tv - value) + (t.weight ?? 0);
      if (Math.abs(tv - value) > tolerance) continue;
      if (!best || d < best.d) best = { at: tv, kind: tk, d, box: t.box };
    }
  }
  if (!best) return { value, guide: null };

  const cross = (b: Box) =>
    axis === 'x' ? ([b.y, b.y + b.height] as const) : ([b.x, b.x + b.width] as const);
  const [c0, c1] = cross(best.box);
  return {
    value: best.at,
    guide: {
      axis,
      at: best.at,
      from: Math.min(c0, span[0]),
      to: Math.max(c1, span[1]),
      kind: best.kind,
    },
  };
}
