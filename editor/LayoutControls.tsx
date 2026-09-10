import type { LayoutSpec } from '../src/document.ts';
import { SPACE } from '../src/tokens.ts';

/**
 * Figma-shaped layout controls.
 *
 * Three things a dropdown does badly and these do well:
 *
 *   - ALIGNMENT is a position, so it is picked on a 3x3 grid, not read from a
 *     list. `baseline` sits beside it as its own toggle, because it is a
 *     different KIND of alignment — it lines up the text, not the boxes —
 *     and only applies across a row.
 *   - GAP and PADDING are picked from the spacing scale far more often than
 *     they are typed, so the common steps are one click and the rest are
 *     still there.
 *   - PADDING is frequently asymmetric, so it splits into vertical and
 *     horizontal rather than forcing four numbers or one.
 */

const COMMON_GAPS = [0, 4, 8, 12, 16, 24] as const;

type Align3 = 'start' | 'center' | 'end';

const AXIS: Align3[] = ['start', 'center', 'end'];

/**
 * The 3x3 alignment pad.
 *
 * One cell is one pairing of main-axis and cross-axis placement, which is how
 * a designer thinks about it — "top left", not "justify: start, align: start".
 * Which axis is which flips with the direction, so the pad always reads as
 * physical position on the canvas rather than as flexbox vocabulary.
 */
export function AlignGrid({
  direction,
  align,
  justify,
  onAlign,
  onJustify,
}: {
  direction: LayoutSpec['direction'];
  align: NonNullable<LayoutSpec['align']>;
  justify: NonNullable<LayoutSpec['justify']>;
  onAlign: (v: NonNullable<LayoutSpec['align']>) => void;
  onJustify: (v: NonNullable<LayoutSpec['justify']>) => void;
}) {
  const horizontal = direction === 'horizontal';

  return (
    <div className="alignpad" role="group" aria-label="Alignment">
      {AXIS.flatMap((_, row) =>
        AXIS.map((__, col) => {
          const mainVal = horizontal ? AXIS[col] : AXIS[row];
          const crossVal = horizontal ? AXIS[row] : AXIS[col];
          // `between` and `baseline` live outside the pad, so neither lights
          // a cell — the pad shows only what it can actually set.
          const on = justify === mainVal && align === crossVal;
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className={`alignpad-cell${on ? ' on' : ''}`}
              aria-label={`${mainVal} ${crossVal}`}
              title={`main ${mainVal} · cross ${crossVal}`}
              onClick={() => {
                onJustify(mainVal);
                onAlign(crossVal);
              }}
            >
              <span className="alignpad-dot" />
            </button>
          );
        }),
      )}
    </div>
  );
}

export function GapPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const custom = !COMMON_GAPS.includes(value as (typeof COMMON_GAPS)[number]);
  return (
    <div className="steppick">
      <span className="field-label">{label}</span>
      <div className="steppick-row">
        {COMMON_GAPS.map((v) => (
          <button
            key={v}
            type="button"
            className={value === v ? 'on' : ''}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
        <select
          className={custom ? 'on' : ''}
          value={custom ? value : ''}
          onChange={(e) => e.target.value && onChange(Number(e.target.value))}
          title="Other steps on the spacing scale"
        >
          <option value="">…</option>
          {SPACE.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Padding as one value, or split into vertical and horizontal. */
export function PaddingPicker({
  value,
  onChange,
}: {
  value: LayoutSpec['padding'];
  onChange: (v: LayoutSpec['padding']) => void;
}) {
  const arr = Array.isArray(value) ? value : undefined;
  const v = arr ? arr[0] : ((value as number) ?? 12);
  const h = arr ? arr[1] : ((value as number) ?? 12);
  const split = arr !== undefined && v !== h;

  return (
    <div className="steppick">
      <div className="steppick-head">
        <span className="field-label">Padding</span>
        <button
          type="button"
          className={`mini${split ? ' on' : ''}`}
          title={split ? 'Use one value for all sides' : 'Split into vertical and horizontal'}
          onClick={() => onChange(split ? v : [v, h])}
        >
          {split ? 'linked' : 'split'}
        </button>
      </div>
      {split ? (
        <div className="steppick-pair">
          <label>
            <span>V</span>
            <select value={v} onChange={(e) => onChange([Number(e.target.value), h])}>
              {SPACE.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>H</span>
            <select value={h} onChange={(e) => onChange([v, Number(e.target.value)])}>
              {SPACE.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="steppick-row">
          {COMMON_GAPS.map((s) => (
            <button key={s} type="button" className={v === s ? 'on' : ''} onClick={() => onChange(s)}>
              {s}
            </button>
          ))}
          <select
            className={!COMMON_GAPS.includes(v as (typeof COMMON_GAPS)[number]) ? 'on' : ''}
            value={COMMON_GAPS.includes(v as (typeof COMMON_GAPS)[number]) ? '' : v}
            onChange={(e) => e.target.value && onChange(Number(e.target.value))}
          >
            <option value="">…</option>
            {SPACE.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
