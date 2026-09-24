import type { BarChartEl, Element, LineChartEl } from '../src/document.ts';
import { barGeometry } from '../src/primitives/barChart.ts';
import { lineDomain } from '../src/primitives/lineChart.ts';

/**
 * CHART EDITING — the value maths behind the canvas handles and the data
 * editor, kept in one place so dragging a point and typing a number cannot
 * disagree about what a value means.
 */

export type BarTone = 'accent' | 'soft';
export interface BarRow {
  data: (number | null)[];
  tone?: BarTone;
}

/** A bar chart's series, whichever of `data` / `series` it is stored as. */
export function barRows(el: BarChartEl): BarRow[] {
  return el.series ?? [{ data: el.data ?? [] }];
}

/**
 * Write series back in the shape the chart already uses: a single untoned
 * series stays as plain `data`, so a simple chart is not rewritten into the
 * grouped form just because a value changed.
 */
export function withBarRows(el: BarChartEl, rows: BarRow[]): BarChartEl {
  if (rows.length === 1 && !el.series && !rows[0].tone) {
    return { ...el, data: rows[0].data.map((v) => v ?? 0), series: undefined };
  }
  return { ...el, data: undefined, series: rows };
}

/** Round to the precision that suits the scale: 0.001 on 0–1, 1 on 0–100. */
export function roundFor(span: number, v: number): number {
  const places = span <= 1 ? 3 : span <= 10 ? 2 : span <= 1000 ? 1 : 0;
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/**
 * The scale a drag is measured against, fixed at the start of the drag. A
 * chart without an explicit domain or max scales to its own data, so without
 * pinning, dragging the tallest bar would rescale every other bar under the
 * cursor and the handle would never keep up.
 */
export interface ChartScale {
  lo: number;
  hi: number;
}

export function scaleOf(el: Element): ChartScale | null {
  if (el.type === 'lineChart') {
    const [lo, hi] = lineDomain(el);
    return { lo, hi };
  }
  if (el.type === 'barChart') return { lo: 0, hi: barGeometry(el).max };
  return null;
}

/** The value at artboard y inside the chart's plot box, clamped to the scale. */
export function valueAt(el: LineChartEl | BarChartEl, scale: ChartScale, y: number): number {
  const t = (el.y + el.height - y) / (el.height || 1);
  const v = scale.lo + t * (scale.hi - scale.lo);
  return roundFor(scale.hi - scale.lo, Math.min(scale.hi, Math.max(scale.lo, v)));
}

/**
 * Set one value, and pin the scale that was in force so the rest of the chart
 * stays put: a line chart gets its `domain`, a bar chart its `max`.
 */
export function withValue(
  el: LineChartEl | BarChartEl,
  scale: ChartScale,
  series: number,
  index: number,
  value: number,
): Element {
  if (el.type === 'lineChart') {
    const next = el.series.map((s, i) =>
      i === series ? { ...s, data: s.data.map((v, j) => (j === index ? value : v)) } : s,
    );
    return { ...el, series: next, domain: el.domain ?? [scale.lo, scale.hi] };
  }
  const rows = barRows(el).map((r, i) =>
    i === series ? { ...r, data: r.data.map((v, j) => (j === index ? value : v)) } : r,
  );
  return { ...withBarRows(el, rows), max: el.max ?? scale.hi };
}

/** Random bar heights on the chart's scale; empty (null) slots stay empty. */
export function regenerateBars(data: (number | null)[], max: number): (number | null)[] {
  return data.map((v) =>
    v === null ? null : roundFor(max, max * (0.2 + Math.random() * 0.75)),
  );
}

/** Add or drop the last point/bar on every series, so they stay aligned. */
export function resizeSeries<T extends { data: (number | null)[] }>(rows: T[], delta: 1 | -1): T[] {
  return rows.map((r) => {
    if (delta < 0) return r.data.length > 1 ? { ...r, data: r.data.slice(0, -1) } : r;
    const last = r.data[r.data.length - 1];
    // A new point continues the line; a new bar copies its neighbour.
    return { ...r, data: [...r.data, last ?? 0] };
  });
}
