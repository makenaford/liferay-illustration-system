import { elementAt, getState, setUI, useEditor } from './state.ts';
import { DEFAULTS, PALETTE, SCHEMA } from './schema.ts';
import type { Element } from '../src/document.ts';
import { ImportButton } from './Import.tsx';
import { CARD_PRESETS, placePreset } from './cardPresets.ts';
import { addAt, contentWidth, slotForSelection, type Slot } from './insertion.ts';

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
  const tool = useEditor((s) => s.tool);

  // Adding goes into the card being worked in — see `slotForSelection`.
  const slot = slotForSelection(doc, selected);
  const container = slot.parent ? elementAt(doc, slot.parent) : null;

  const add = (make: () => Element, preset = false) => {
    const st = getState();
    const target: Slot = slotForSelection(st.doc, st.selected);
    const at = anchorFor(st.doc, target);
    let el = preset ? placePreset(make(), at) : place(make(), at);
    el = fitWidth(el, contentWidth(st.doc, target));
    addAt(st.doc, target, el);
  };

  return (
    <div className="palette">
      {container && (
        <div className="palette-note">
          Adding into <strong>{SCHEMA[container.type].label}</strong>
          {slot.index !== undefined && ', after the selection'}
        </div>
      )}
      <ImportButton />

      <div className="palette-group">
        <div className="palette-group-title">Starter cards</div>
        <div className="palette-items">
          {CARD_PRESETS.map((p) => (
            <button key={p.label} type="button" title={p.title} onClick={() => add(p.make, true)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {PALETTE.map(({ group, types }) => (
        <div key={group} className="palette-group">
          <div className="palette-group-title">{group}</div>
          <div className="palette-items">
            {types.map((t) => (
              t === 'connector' ? (
                // A connector is drawn, not dropped: this arms the tool, and
                // the next drag on the canvas makes one between two items.
                <button
                  key={t}
                  type="button"
                  className={tool === 'connector' ? 'on' : ''}
                  title="Drag from one item to another on the canvas (C)"
                  onClick={() => setUI({ tool: tool === 'connector' ? 'select' : 'connector' })}
                >
                  {SCHEMA[t].label}
                </button>
              ) : (
                <button key={t} type="button" onClick={() => add(DEFAULTS[t])}>
                  {SCHEMA[t].label}
                </button>
              )
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

/**
 * Where a new element starts. Inside an auto-layout container this is
 * overwritten by the flow; inside a free one it is just inside the corner;
 * at the top level it is the middle of the artboard.
 */
function anchorFor(doc: import('../src/document.ts').Doc, slot: Slot): { x: number; y: number } {
  const c = slot.parent ? (elementAt(doc, slot.parent) as { x?: number; y?: number } | null) : null;
  if (c && typeof c.x === 'number' && typeof c.y === 'number') return { x: c.x + 12, y: c.y + 12 };
  const art = doc.artboard ?? doc.canvas;
  return { x: Math.round(art.width / 2 - 60), y: Math.round(art.height / 2 - 20) };
}

/** Narrow anything wider than the container's content box to fit it. */
function fitWidth(el: Element, max: number | null): Element {
  const w = (el as { width?: number }).width;
  return max !== null && typeof w === 'number' && w > max ? ({ ...el, width: max } as Element) : el;
}
