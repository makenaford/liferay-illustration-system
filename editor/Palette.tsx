import { elementAt, getState, setUI, useEditor } from './state.ts';
import { DEFAULTS, PALETTE, SCHEMA } from './schema.ts';
import { useEffect, useState } from 'react';
import type { Element, GraphicArt } from '../src/document.ts';
import { GRAPHICS } from '../src/graphics.generated.ts';
import { libraryGraphics, type LibraryGraphic } from './graphicsLibrary.ts';
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
/** A graphic as an `<img>` source, for a palette tile. */
function thumb(art: GraphicArt): string {
  const body = art.body.replaceAll('__NS__', 'thumb-');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox.join(' ')}" fill="none">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A graphic element for a palette pick, sized to the artwork's own box. */
function graphicEl(art: GraphicArt, pick: { name?: string; art?: LibraryGraphic }): Element {
  const [, , w, h] = art.viewBox;
  const scale = Math.min(1, 160 / Math.max(w, h));
  return {
    type: 'graphic',
    x: 40,
    y: 40,
    width: Math.round(w * scale),
    height: Math.round(h * scale),
    ...(pick.name ? { name: pick.name } : {}),
    ...(pick.art ? { art: { id: pick.art.id, label: pick.art.label, dark: pick.art.dark, light: pick.art.light } } : {}),
  } as Element;
}

export function Palette() {
  const selected = useEditor((s) => s.selected);
  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.tool);
  const theme = useEditor((s) => s.theme);
  const [library, setLibrary] = useState<LibraryGraphic[]>([]);
  useEffect(() => {
    void libraryGraphics(true).then(setLibrary);
  }, []);

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

      {/* Graphics: larger glass artwork, placed whole. */}
      <div className="palette-group">
        <div className="palette-group-title">Graphics</div>
        <div className="palette-graphics">
          {Object.entries(GRAPHICS).map(([key, g]) => {
            const art = theme === 'light' ? g.light : g.dark;
            return (
              <button key={key} type="button" title={g.label} onClick={() => add(() => graphicEl(art, { name: key }))}>
                <img src={thumb(art)} alt="" />
                <span>{g.label}</span>
              </button>
            );
          })}
          {library.map((l) => {
            const art = theme === 'light' ? l.light : l.dark;
            return (
              <button key={l.id} type="button" title={`${l.label} — from Marketing Assets`} onClick={() => add(() => graphicEl(art, { art: l }))}>
                <img src={thumb(art)} alt="" />
                <span>{l.label}</span>
              </button>
            );
          })}
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
