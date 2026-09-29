import type { Element } from '../src/document.ts';
import { GRID_MAX, gridOf, setGrid } from './dashboardGrid.ts';

type Container = Extract<Element, { type: 'card' | 'subCard' | 'group' }>;

/**
 * A dashboard's grid, as the table's cells are edited: a row per line with
 * its slot count, and a row added or taken off the end. Up to GRID_MAX of
 * each. The slots re-divide the dashboard on every change; see
 * editor/dashboardGrid.ts.
 */
export function GridEditor({ el, onReplace }: { el: Container; onReplace: (next: Element) => void }) {
  const grid = gridOf(el);
  const apply = (next: number[]) => onReplace(setGrid(el, next));
  return (
    <span className="series grid-data">
      {grid.map((n, r) => (
        <span key={r} className="series-count grid-row">
          <span className="grid-row-label">Row {r + 1}</span>
          <button type="button" className="mini" disabled={n <= 1} onClick={() => apply(grid.map((c, i) => (i === r ? c - 1 : c)))} title="One slot fewer in this row">
            −
          </button>
          <span>
            {n} slot{n === 1 ? '' : 's'}
          </span>
          <button type="button" className="mini" disabled={n >= GRID_MAX} onClick={() => apply(grid.map((c, i) => (i === r ? c + 1 : c)))} title="One slot more in this row">
            +
          </button>
        </span>
      ))}
      <span className="series-actions">
        <span className="series-count">
          <button type="button" className="mini" disabled={grid.length <= 1} onClick={() => apply(grid.slice(0, -1))} title="Remove the last row">
            −
          </button>
          <span>
            {grid.length} row{grid.length === 1 ? '' : 's'}
          </span>
          <button type="button" className="mini" disabled={grid.length >= GRID_MAX} onClick={() => apply([...grid, 1])} title="Add a row">
            +
          </button>
        </span>
      </span>
    </span>
  );
}
