import { useState } from 'react';
import type { Element } from '../src/document.ts';
import { pickFile, readAsset } from './pickFile.ts';
import { commit, elementAt, getState, replaceAt } from './state.ts';
import { fitCanvasToImage, isWholeCanvasSlot } from './docs.ts';

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
      const box = el as Element & { width?: number; height?: number };
      const asset = await readAsset(file, 160);
      // Keep the box the designer already sized. A cover image keeps it whole —
      // it crops to fill, as the Mockup template's fixed-size images need; any
      // other re-derives its height from the new artwork, so it isn't stretched.
      const cover = asset.type === 'image' && ((el as { fit?: string }).fit ?? 'cover') === 'cover';
      const width = filled && box.width ? box.width : asset.size.width;
      const height =
        filled && cover && box.height ? box.height : Math.round(width * (asset.size.height / asset.size.width));

      // The image of a prebuilt mockup: the canvas takes the image's shape.
      const doc = getState().doc;
      const path = getState().selected;
      const natural = (asset.patch as { natural?: { width: number; height: number } }).natural;
      const target = path ? elementAt(doc, path) : null;
      const m = doc.mockup;
      const isSlot = !!m && target?.type === 'image' && target.x === m.x && target.y === m.y && target.width === m.width && target.height === m.height;
      if (asset.type === 'image' && natural && path && target && isSlot && isWholeCanvasSlot(doc)) {
        const filled = replaceAt(doc, path, { ...target, fit: 'cover', ...asset.patch } as Element);
        const next = fitCanvasToImage(filled, natural);
        commit(next);
        setNote(`${asset.note} · the canvas is now ${next.canvas.width} × ${next.canvas.height}, the image's shape`);
        return;
      }
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
