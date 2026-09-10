import { useState } from 'react';
import type { Element } from '../src/document.ts';
import { pickFile, readAsset } from './pickFile.ts';

/**
 * The Inspector's file control for `image` and `svg` elements.
 *
 * Placing one of these from the Palette used to leave a dead placeholder —
 * the element existed but nothing in the UI could give it artwork. This is
 * the missing half: pick a file and the element takes it on.
 *
 * Picking a raster while an SVG element is selected (or the reverse) rewrites
 * the element's type and clears the props of the kind it no longer is, so a
 * swap can't leave stale markup behind an image.
 */
export function FileField({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = el as Element & { href?: string; body?: string; alt?: string };
  const filled = !!(current.href || current.body);

  const choose = async () => {
    setBusy(true);
    try {
      const file = await pickFile();
      if (!file) return;
      const asset = await readAsset(file);

      // Keep the box the designer already sized; re-derive height from the new
      // artwork's aspect so it does not arrive stretched.
      const box = el as Element & { width?: number; height?: number };
      const width = filled && box.width ? box.width : asset.size.width;
      const height = Math.round(width * (asset.size.height / asset.size.width));

      onPatch(
        asset.type === 'svg'
          ? { type: 'svg', href: undefined, fit: 'contain', width, height, ...asset.patch }
          : {
              type: 'image',
              body: undefined,
              viewBox: undefined,
              fit: (el as { fit?: string }).fit ?? 'cover',
              width,
              height,
              ...asset.patch,
            },
      );
      setNote(asset.note);
    } catch (err) {
      setNote(`Could not read that file — ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="file-field">
      <button type="button" className="import-btn" disabled={busy} onClick={() => void choose()}>
        {busy ? 'Reading…' : filled ? 'Replace file…' : 'Choose file…'}
      </button>
      {!filled && !note && <p className="import-note">Empty — pick an SVG or image.</p>}
      {note && <p className="import-note">{note}</p>}
    </div>
  );
}
