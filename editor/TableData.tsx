import type { TableEl } from '../src/document.ts';
import type { TableColumn } from '../src/primitives/table.ts';

/**
 * A table's cells, edited as a grid: the column names across the top, each
 * with its kind (text, or a progress bar), then a row of inputs per row.
 * Columns and rows are added and removed at the end, the way the charts'
 * point and bar counts are.
 */
export function TableEditor({ el, onPatch }: { el: TableEl; onPatch: (p: Record<string, unknown>) => void }) {
  const columns = el.columns ?? [];
  const rows = el.rows ?? [];
  const n = Math.max(columns.length, 1);
  const grid = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  const setColumn = (c: number, patch: Partial<TableColumn>) =>
    onPatch({ columns: columns.map((col, i) => (i === c ? { ...col, ...patch } : col)) });
  const setCell = (r: number, c: number, v: string) =>
    onPatch({ rows: rows.map((row, i) => (i === r ? columns.map((_, j) => (j === c ? v : (row[j] ?? ''))) : row)) });

  const addRow = () => {
    // A new row copies the last one's bar values, so a bar column never
    // arrives empty; its text cells start blank.
    const prev = rows.at(-1) ?? [];
    onPatch({ rows: [...rows, columns.map((col, c) => (col.kind === 'bar' ? (prev[c] ?? '0.5') : ''))] });
  };
  const addColumn = () =>
    onPatch({ columns: [...columns, { label: 'Column' }], rows: rows.map((row) => [...row, '']) });

  return (
    <span className="series table-data">
      <span className="table-grid" style={grid}>
        {columns.map((col, c) => (
          <span key={`h${c}`} className="table-head">
            <input
              type="text"
              value={col.label}
              aria-label={`Column ${c + 1} name`}
              onChange={(e) => setColumn(c, { label: e.target.value })}
            />
            <select
              value={col.kind ?? 'text'}
              aria-label={`Column ${c + 1} kind`}
              onChange={(e) => setColumn(c, { kind: e.target.value === 'bar' ? 'bar' : undefined })}
            >
              <option value="text">text</option>
              <option value="bar">bar</option>
            </select>
          </span>
        ))}
        {rows.map((row, r) =>
          columns.map((col, c) => (
            <input
              key={`${r}.${c}`}
              type="text"
              value={row[c] ?? ''}
              placeholder={col.kind === 'bar' ? '0–1 or %' : ''}
              aria-label={`Row ${r + 1}, ${col.label || `column ${c + 1}`}`}
              onChange={(e) => setCell(r, c, e.target.value)}
            />
          )),
        )}
      </span>
      <span className="series-actions">
        <span className="series-count">
          <button type="button" className="mini" disabled={rows.length <= 1} onClick={() => onPatch({ rows: rows.slice(0, -1) })} title="Remove the last row">
            −
          </button>
          <span>{rows.length} row{rows.length === 1 ? '' : 's'}</span>
          <button type="button" className="mini" onClick={addRow} title="Add a row">
            +
          </button>
        </span>
        <span className="series-count">
          <button
            type="button"
            className="mini"
            disabled={columns.length <= 1}
            onClick={() => onPatch({ columns: columns.slice(0, -1), rows: rows.map((row) => row.slice(0, columns.length - 1)) })}
            title="Remove the last column"
          >
            −
          </button>
          <span>{columns.length} column{columns.length === 1 ? '' : 's'}</span>
          <button type="button" className="mini" onClick={addColumn} title="Add a column">
            +
          </button>
        </span>
      </span>
    </span>
  );
}
