import { useRef, useState } from 'react';
import { dataUriBytes, importSvg, RASTER_WARN_BYTES } from '../src/importAsset.ts';
import { appendTo, commit, elementAt, getState, isContainer, setUI } from './state.ts';
import type { Element } from '../src/document.ts';

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
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const place = (make: (at: { x: number; y: number }) => Element, label: string) => {
    const st = getState();
    const sel = elementAt(st.doc, st.selected);
    const into = isContainer(sel) ? st.selected : null;
    const anchor = into ? (sel as { x: number; y: number }) : null;
    const at = anchor
      ? { x: anchor.x + 12, y: anchor.y + 12 }
      : {
          x: Math.round(st.doc.canvas.width / 2 - 60),
          y: Math.round(st.doc.canvas.height / 2 - 40),
        };
    const { doc, path } = appendTo(st.doc, into, make(at));
    commit(doc);
    setUI({ selected: path });
    setNote(label);
  };

  const onFile = async (file: File) => {
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

    if (isSvg) {
      const text = await file.text();
      const art = importSvg(text);
      const [, , vw, vh] = art.viewBox;
      // Land it at a sensible size: its own units, capped so a poster-sized
      // export does not arrive larger than the canvas.
      const cap = 160;
      const scale = Math.min(1, cap / Math.max(vw, vh));
      place(
        (at) => ({
          type: 'svg',
          x: at.x,
          y: at.y,
          width: Math.round(vw * scale),
          height: Math.round(vh * scale),
          viewBox: art.viewBox,
          body: art.body,
          alt: file.name.replace(/\.svg$/i, ''),
        }),
        `Imported ${file.name}${art.notes.length ? ` — ${art.notes.join('; ')}` : ''}`,
      );
      return;
    }

    const href = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

    // Natural size, so it does not arrive distorted.
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 120, h: 80 });
      img.src = href;
    });
    const cap = 200;
    const scale = Math.min(1, cap / Math.max(dims.w, dims.h));

    const bytes = dataUriBytes(href);
    const kb = Math.round(bytes / 1024);
    place(
      (at) => ({
        type: 'image',
        x: at.x,
        y: at.y,
        width: Math.round(dims.w * scale),
        height: Math.round(dims.h * scale),
        href,
        fit: 'cover',
        alt: file.name,
      }),
      bytes > RASTER_WARN_BYTES
        ? `Imported ${file.name} — ${kb} KB embedded. Large rasters bloat every export; consider a URL or an SVG.`
        : `Imported ${file.name} (${kb} KB)`,
    );
  };

  return (
    <div className="importer">
      <input
        ref={input}
        type="file"
        accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="import-btn" onClick={() => input.current?.click()}>
        Import SVG or image…
      </button>
      {note && <p className="import-note">{note}</p>}
    </div>
  );
}
