/**
 * RANDOM CHART LINES — a fresh, plausible series for a line chart.
 *
 * These charts are decorative, so the numbers do not matter but the story
 * does: an "Annual Growth" line that comes back falling reads as a different
 * illustration. So a regenerated line keeps what the old one said and only
 * changes how it got there:
 *
 *   - the same number of points, so markers and the x rhythm stay put
 *   - the same direction, start to end — rising stays rising
 *   - inside the chart's domain, with a margin so the stroke is never cut
 *     off by the plot box
 *
 * The walk itself is a drifting random walk: each step moves toward the end
 * value with some noise, and the noise shrinks near the ends so the line
 * starts and finishes where it said it would.
 */

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function regenerateSeries(data: number[], domain?: [number, number]): number[] {
  const n = Math.max(data.length, 2);
  const [lo, hi] = domain ?? [Math.min(...data, 0), Math.max(...data, 1)];
  const span = hi - lo || 1;
  // Keep clear of the plot edges; a point on the edge half-clips its marker.
  const min = lo + span * 0.06;
  const max = hi - span * 0.06;

  // Direction from the current line; a flat or unknown one picks at random.
  const first = data[0] ?? lo;
  const last = data[data.length - 1] ?? hi;
  const rising = last === first ? Math.random() < 0.7 : last > first;

  // Where it starts and ends, in the lower/upper bands of the range.
  const low = rand(min, min + (max - min) * 0.3);
  const high = rand(min + (max - min) * 0.65, max);
  const [start, end] = rising ? [low, high] : [high, low];

  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      v = start;
    } else if (i === n - 1) {
      v = end;
    } else {
      const remaining = n - 1 - i;
      const pull = (end - v) / (remaining + 1);
      // Widest in the middle of the line, calm at its ends.
      const edge = Math.min(i, remaining) / ((n - 1) / 2);
      const noise = rand(-1, 1) * span * 0.14 * (0.35 + 0.65 * edge);
      v = Math.min(max, Math.max(min, v + pull + noise));
    }
    out.push(v);
  }

  // Rounded to the precision the documents are written in.
  const places = span <= 1 ? 3 : span <= 10 ? 2 : 1;
  const f = 10 ** places;
  return out.map((x) => Math.round(x * f) / f);
}
