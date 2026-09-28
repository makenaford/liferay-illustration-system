import { useEffect, useState } from 'react';
import type { BarChartEl, Element, LineChartEl } from '../src/document.ts';
import { CHART_COLORS } from '../src/colors.ts';
import { TokenPicker } from './TokenPicker.tsx';
import { regenerateSeries } from './chartData.ts';
import { barRows, regenerateBars, resizeSeries, scaleOf, withBarRows, type BarRow } from './chartEdit.ts';

/**
 * CHART DATA EDITORS — the inspector half of chart editing. The canvas half
 * is the drag handles; both go through `chartEdit.ts`.
 *
 * One row per line (or per bar series): its colour, its values, redraw it at
 * random, remove it. Underneath, add or drop a point on every series at once,
 * so the series never fall out of step with each other.
 */

/**
 * A comma-separated value list that lets you type. Parsing on every keystroke
 * would throw away a half-typed "0." or "-", so the text is kept locally and
 * only a list that parses is sent up. A `-` (or an empty slot) is a gap,
 * where the chart allows one.
 */
function ValuesInput({
  values,
  allowGaps,
  onChange,
}: {
  values: (number | null)[];
  allowGaps: boolean;
  onChange: (v: (number | null)[]) => void;
}) {
  const shown = values.map((v) => (v === null ? '-' : String(v))).join(', ');
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const parse = (text: string): (number | null)[] | null => {
    const parts = text.split(',').map((p) => p.trim());
    const out: (number | null)[] = [];
    for (const p of parts) {
      if (p === '' || p === '-' || p === '—') {
        if (!allowGaps) return null;
        out.push(null);
        continue;
      }
      const n = Number(p);
      if (Number.isNaN(n)) return null;
      out.push(n);
    }
    return out.length ? out : null;
  };

  return (
    <input
      type="text"
      value={draft}
      title={allowGaps ? 'Comma-separated; use - for an empty slot' : 'Comma-separated values'}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = parse(e.target.value);
        if (next) onChange(next);
      }}
      onBlur={() => setDraft(shown)}
    />
  );
}

function CountButtons({
  count,
  unit,
  onResize,
}: {
  count: number;
  unit: 'point' | 'bar';
  onResize: (d: 1 | -1) => void;
}) {
  return (
    <span className="series-count">
      <button type="button" className="mini" disabled={count <= 1} onClick={() => onResize(-1)} title={`Remove the last ${unit} from every series`}>
        −
      </button>
      <span>{count} {unit}{count === 1 ? '' : 's'}</span>
      <button type="button" className="mini" onClick={() => onResize(1)} title={`Add a ${unit} to every series`}>
        +
      </button>
    </span>
  );
}

/**
 * A series' colour: any colour from the set, or none — which draws it in its
 * place in the data colours, Primary then Purple (`CHART_COLORS`).
 */
function SeriesColor({ value, index, onChange }: { value: string | undefined; index: number; onChange: (v: string | undefined) => void }) {
  return (
    <span className="series-color" title={value ? undefined : `Default: ${CHART_COLORS[index % CHART_COLORS.length].replace('base-', '')}`}>
      <TokenPicker value={value} onChange={onChange} colorsOnly />
    </span>
  );
}

type LineSeries = LineChartEl['series'][number];

export function LineSeriesEditor({ el, onChange }: { el: LineChartEl; onChange: (v: LineSeries[]) => void }) {
  const series = el.series ?? [];
  const domain = el.domain;
  const set = (i: number, patch: Partial<LineSeries>) =>
    onChange(series.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const count = Math.max(...series.map((s) => s.data.length), 0);

  return (
    <span className="series">
      {series.map((s, i) => (
        <span key={i} className="series-row">
          <SeriesColor
            value={s.color ?? (s.role === 'success' ? 'success' : undefined)}
            index={i}
            onChange={(color) => set(i, { color, role: undefined })}
          />
          <ValuesInput
            values={s.data}
            allowGaps={false}
            onChange={(v) => set(i, { data: v.map((n) => n ?? 0) })}
          />
          <button
            type="button"
            className={`mini${s.area ? ' on' : ''}`}
            aria-pressed={!!s.area}
            title="Fill under this line — an area chart"
            aria-label={`Area under line ${i + 1}`}
            onClick={() => set(i, { area: !s.area || undefined })}
          >
            ▤
          </button>
          <button
            type="button"
            className="mini"
            title="Draw this line again at random — same points, same direction"
            aria-label={`Regenerate line ${i + 1}`}
            onClick={() => set(i, { data: regenerateSeries(s.data, domain) })}
          >
            ↻
          </button>
          <button
            type="button"
            className="mini"
            disabled={series.length <= 1}
            title="Remove this line"
            aria-label={`Remove line ${i + 1}`}
            onClick={() => onChange(series.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </span>
      ))}
      <span className="series-actions">
        <CountButtons count={count} unit="point" onResize={(d) => onChange(resizeSeries(series, d) as LineSeries[])} />
        <button
          type="button"
          className="mini"
          onClick={() =>
            onChange([
              ...series,
              { data: regenerateSeries(new Array(Math.max(count, 3)).fill(0), domain) },
            ])
          }
        >
          + line
        </button>
        {series.length > 0 && (
          <button
            type="button"
            className="mini"
            title="Draw every line again at random"
            onClick={() => onChange(series.map((s) => ({ ...s, data: regenerateSeries(s.data, domain) })))}
          >
            ↻ all
          </button>
        )}
      </span>
      <span className="series-hint">Or drag the points on the canvas.</span>
    </span>
  );
}

export function BarSeriesEditor({ el, onPatch }: { el: BarChartEl; onPatch: (p: Record<string, unknown>) => void }) {
  const rows = barRows(el);
  const max = scaleOf(el as Element)?.hi ?? 1;
  const write = (next: BarRow[]) => {
    const out = withBarRows(el, next);
    onPatch({ data: out.data, series: out.series });
  };
  const set = (i: number, patch: Partial<BarRow>) => write(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const count = Math.max(...rows.map((r) => r.data.length), 0);
  const grouped = rows.length > 1 || !!el.series;

  return (
    <span className="series">
      {rows.map((r, i) => (
        <span key={i} className="series-row">
          {grouped && <SeriesColor value={r.color} index={i} onChange={(color) => set(i, { color, tone: undefined })} />}
          <ValuesInput values={r.data} allowGaps={grouped} onChange={(v) => set(i, { data: v })} />
          <button
            type="button"
            className="mini"
            title="New random heights — empty slots stay empty"
            aria-label={`Regenerate bars ${i + 1}`}
            onClick={() => set(i, { data: regenerateBars(r.data, max) })}
          >
            ↻
          </button>
          {grouped && (
            <button
              type="button"
              className="mini"
              disabled={rows.length <= 1}
              title="Remove this series"
              aria-label={`Remove series ${i + 1}`}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      <span className="series-actions">
        <CountButtons count={count} unit="bar" onResize={(d) => write(resizeSeries(rows, d))} />
        <button
          type="button"
          className="mini"
          title="Add a comparison series, drawn beside the first"
          onClick={() =>
            write([
              ...rows,
              { data: regenerateBars(new Array(Math.max(count, 1)).fill(0), max) },
            ])
          }
        >
          + series
        </button>
        <button
          type="button"
          className="mini"
          title="New random heights for every series"
          onClick={() => write(rows.map((r) => ({ ...r, data: regenerateBars(r.data, max) })))}
        >
          ↻ all
        </button>
      </span>
      <span className="series-hint">Or drag the bar tops on the canvas.</span>
    </span>
  );
}
