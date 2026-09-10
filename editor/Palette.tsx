import { appendTo, commit, elementAt, getState, setUI, useEditor } from './state.ts';
import { DEFAULTS, PALETTE, SCHEMA } from './schema.ts';
import type { Element } from '../src/document.ts';
import { ImportButton } from './Import.tsx';

/**
 * LIBRARY PALETTE — the only way to create anything.
 *
 * This is the "freeform placement, zero freeform creation" rule made concrete.
 * There is no rectangle tool, no pen, no colour picker anywhere in the editor:
 * if it isn't a primitive in the library, it cannot enter a document. That's
 * what makes every illustration themeable and on-brand by construction.
 */
export function Palette() {
  const selected = useEditor((s) => s.selected);
  const doc = useEditor((s) => s.doc);

  // Adding while a container is selected nests inside it.
  const sel = elementAt(doc, selected);
  const container =
    sel && (sel.type === 'card' || sel.type === 'subCard') ? selected : null;

  const add = (type: Element['type']) => {
    const st = getState();
    const el = DEFAULTS[type]();

    // Drop new elements near the middle of the canvas, or inside the
    // selected container, rather than always at the origin.
    const anchor = container ? elementAt(st.doc, container) : null;
    const base = anchor
      ? { x: (anchor as { x: number }).x + 12, y: (anchor as { y: number }).y + 24 }
      : { x: Math.round(st.doc.canvas.width / 2 - 60), y: Math.round(st.doc.canvas.height / 2 - 20) };

    const placed = place(el, base);
    const { doc: next, path } = appendTo(st.doc, container, placed);
    commit(next);
    setUI({ selected: path });
  };

  return (
    <div className="palette">
      {container && (
        <div className="palette-note">
          Adding into <strong>{SCHEMA[sel!.type].label}</strong>
        </div>
      )}
      <ImportButton />

      {PALETTE.map(({ group, types }) => (
        <div key={group} className="palette-group">
          <div className="palette-group-title">{group}</div>
          <div className="palette-items">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => add(t)}>
                {SCHEMA[t].label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function place(el: Element, at: { x: number; y: number }): Element {
  if (el.type === 'avatar') return { ...el, cx: at.x + 20, cy: at.y + 20 };
  if (el.type === 'connector') {
    return { ...el, from: [at.x, at.y], to: [at.x + 120, at.y + 80] };
  }
  return { ...el, x: at.x, y: at.y } as Element;
}
