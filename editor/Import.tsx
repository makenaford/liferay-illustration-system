import { useState } from 'react';
import { assetElement, pickFile, readAsset } from './pickFile.ts';
import { elementAt, getState } from './state.ts';
import { addAt, contentWidth, slotForSelection } from './insertion.ts';

/**
 * Bring an SVG or a raster into the document.
 *
 * SVGs are INLINED, not linked: parsed, sanitised, id-namespaced, and stored
 * as markup so the artwork scales, themes and exports as one file. Rasters
 * become data URIs for the same self-contained reason — with a warning past
 * half a megabyte, because embedding at that scale is exactly how the
 * original exports ended up at 21MB each.
 *
 * A file the user picked is untrusted input, so `importSvg` strips `<script>`
 * and inline event handlers before anything is inlined.
 */
export function ImportButton() {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const file = await pickFile();
      if (!file) return;
      const st = getState();
      // Into the card being worked in, sized to fit it — see `slotForSelection`.
      const slot = slotForSelection(st.doc, st.selected);
      const cw = contentWidth(st.doc, slot);
      const asset = await readAsset(file, cw ? Math.min(160, cw) : 160);

      const c = slot.parent ? (elementAt(st.doc, slot.parent) as { x: number; y: number }) : null;
      const art = st.doc.artboard ?? st.doc.canvas;
      const at = c
        ? { x: c.x + 12, y: c.y + 12 }
        : {
            x: Math.round(art.width / 2 - asset.size.width / 2),
            y: Math.round(art.height / 2 - asset.size.height / 2),
          };

      addAt(st.doc, slot, assetElement(asset, at));
      setNote(asset.note);
    } catch (err) {
      setNote(`Could not read that file — ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="importer">
      <button type="button" className="import-btn" disabled={busy} onClick={() => void onClick()}>
        {busy ? 'Reading…' : 'Import SVG or image…'}
      </button>
      {note && <p className="import-note">{note}</p>}
    </div>
  );
}
