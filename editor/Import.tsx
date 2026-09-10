import { useState } from 'react';
import { assetElement, pickFile, readAsset } from './pickFile.ts';
import { appendTo, commit, elementAt, getState, isContainer, setUI } from './state.ts';

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
      const asset = await readAsset(file);

      const st = getState();
      const sel = elementAt(st.doc, st.selected);
      const into = isContainer(sel) ? st.selected : null;
      const anchor = into ? (sel as { x: number; y: number }) : null;
      const at = anchor
        ? { x: anchor.x + 12, y: anchor.y + 12 }
        : {
            x: Math.round(st.doc.canvas.width / 2 - asset.size.width / 2),
            y: Math.round(st.doc.canvas.height / 2 - asset.size.height / 2),
          };

      const { doc, path } = appendTo(st.doc, into, assetElement(asset, at));
      commit(doc);
      setUI({ selected: path });
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
