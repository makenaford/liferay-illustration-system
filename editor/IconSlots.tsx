import { useEffect, useRef } from 'react';
import type { Element } from '../src/document.ts';
import type { IconStyle } from '../src/icons.ts';
import { IconPicker } from './IconPicker.tsx';
import { setUI, useEditor } from './state.ts';

/**
 * AN ICON GRID'S ICONS — one row per icon: its picker, its own Outline /
 * Filled, and a remove. Clicking an icon on the canvas highlights its row
 * (see `EditorState.slot`), so a grid of twelve is edited by pointing.
 */
export function IconSlots({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const g = el as Extract<Element, { type: 'iconGrid' }>;
  const icons = g.icons ?? [];
  const fallback: IconStyle = g.iconStyle ?? 'line';
  const styleOf = (i: number): IconStyle => g.styles?.[i] ?? fallback;
  const slot = useEditor((s) => s.slot);
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (slot !== null) rows.current[slot]?.scrollIntoView({ block: 'nearest' });
  }, [slot]);

  /** Write both arrays together, so a style always stays with its icon. */
  const write = (nextIcons: (string | null)[], nextStyles: (IconStyle | null)[]) =>
    onPatch({ icons: nextIcons, styles: nextStyles.some((s) => s) ? nextStyles : undefined });
  const styles = icons.map((_, i) => g.styles?.[i] ?? null);

  return (
    <div className="slots">
      <div className="slots-head">
        <span>
          {icons.length} icon{icons.length === 1 ? '' : 's'}
        </span>
        <button type="button" className="mini" onClick={() => write(icons, icons.map(() => 'line'))}>
          All outline
        </button>
        <button type="button" className="mini" onClick={() => write(icons, icons.map(() => 'fill'))}>
          All filled
        </button>
      </div>
      {icons.map((key, i) => (
        <div
          key={i}
          ref={(n) => {
            rows.current[i] = n;
          }}
          className={`slot${slot === i ? ' on' : ''}`}
          onFocusCapture={() => setUI({ slot: i })}
        >
          <span className="slot-n">{i + 1}</span>
          <div className="slot-pick">
            <IconPicker
              value={key ?? undefined}
              style={styleOf(i)}
              onChange={(v) => write(icons.map((k, j) => (j === i ? v ?? null : k)), styles)}
            />
          </div>
          <div className="slot-style" role="group" aria-label={`Icon ${i + 1} style`}>
            {(['line', 'fill'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={styleOf(i) === st ? 'on' : ''}
                title={st === 'line' ? 'Outline' : 'Filled'}
                onClick={() => write(icons, styles.map((s, j) => (j === i ? st : s)))}
              >
                {st === 'line' ? 'Outline' : 'Filled'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="slot-x"
            aria-label={`Remove icon ${i + 1}`}
            title="Remove"
            onClick={() => {
              write(
                icons.filter((_, j) => j !== i),
                styles.filter((_, j) => j !== i),
              );
              setUI({ slot: null });
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="mini slots-add"
        onClick={() => {
          write([...icons, 'mc:star'], [...styles, null]);
          setUI({ slot: icons.length });
        }}
      >
        + Add icon
      </button>
    </div>
  );
}
