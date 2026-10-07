import { useEffect, useRef, useState } from 'react';
import { assetElement, readAsset } from './pickFile.ts';
import { commit, elementAt, getState, setUI } from './state.ts';
import type { Element as DocElement } from '../src/document.ts';
import { contentWidth, insertAt, slotForDrop } from './insertion.ts';
import { resolveLayout } from '../src/autolayout.ts';
import { snap } from './grid.ts';
import { isComponentDrag, takeDrag } from './paletteDrag.ts';
import { fitCanvasToImage, isWholeCanvasSlot } from './docs.ts';

/**
 * DRAG AND DROP — files dropped on the canvas become elements.
 *
 * The same read, sanitise and embed path as the Import button (`readAsset`),
 * so a dropped SVG is inlined and id-namespaced and a dropped raster becomes
 * a data URI, with the same size warning. What drop adds is placement: the
 * artwork lands centred on the cursor, and a drop onto a card goes INTO it:
 * a free card keeps it where it was dropped, and an auto-layout card slots it
 * into its column or row at the position nearest the cursor, sized to fit
 * the card's content box (see `slotForDrop`).
 */

const ACCEPTED = /^image\/(svg\+xml|png|jpeg|webp|gif)$/;
const accepted = (f: File) => ACCEPTED.test(f.type) || /\.svg$/i.test(f.name);
const hasFiles = (e: DragEvent | React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function useFileDrop(stageRef: React.RefObject<HTMLDivElement | null>, zoom: number, snapStep: number) {
  const [dropping, setDropping] = useState(false);
  // A Library component over the canvas, rather than a file.
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = (text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 5000);
  };

  // A file dropped anywhere else in the window would make the browser open
  // it in place of the editor, taking unsaved work with it.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
      clearTimeout(noteTimer.current);
    };
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    if (isComponentDrag(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!placing) setPlacing(true);
      return;
    }
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dropping) setDropping(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Leaving for a child of the viewport is not leaving.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDropping(false);
      setPlacing(false);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    // A component dragged from the Library: into the container it was dropped on.
    if (isComponentDrag(e)) {
      e.preventDefault();
      setPlacing(false);
      const add = takeDrag();
      const rect = stageRef.current?.getBoundingClientRect();
      if (!add || !rect) return;
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)
        ?.closest('[data-path]')
        ?.getAttribute('data-path') ?? null;
      const doc = getState().doc;
      add(slotForDrop(doc, resolveLayout(doc), hit, { x: px, y: py }), { x: snap(px, snapStep), y: snap(py, snapStep) });
      return;
    }
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDropping(false);

    const files = Array.from(e.dataTransfer.files);
    const usable = files.filter(accepted);
    const skipped = files.length - usable.length;
    if (!usable.length) {
      flash('Only SVG, PNG, JPEG, WebP and GIF files can be dropped.');
      return;
    }

    // Where the cursor is, in artboard units — the stage is scaled by zoom.
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / zoom;
    const py = (e.clientY - rect.top) / zoom;

    const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)
      ?.closest('[data-path]')
      ?.getAttribute('data-path') ?? null;

    let doc = getState().doc;

    /*
     * The mockup's screenshot slot (`Doc.mockup`): a raster dropped inside it
     * — not onto a frame over it — fills it. It replaces the screenshot there,
     * cropped to fill from the centre, and the slot keeps its size
     * whatever the image's own; with no screenshot left, one is put back.
     */
    const m = doc.mockup;
    const onFrame = hit !== null && (() => {
      const el = elementAt(doc, hit);
      return !!el && el.type !== 'image';
    })();
    const raster = usable.find((f) => f.type !== 'image/svg+xml' && !/\.svg$/i.test(f.name));
    if (m && raster && !onFrame && px >= m.x && px <= m.x + m.width && py >= m.y && py <= m.y + m.height) {
      try {
        const asset = await readAsset(raster, 160, { width: m.width, height: m.height });
        const near = (a: number, b: number) => Math.abs(a - b) < 1;
        const at = doc.elements.findIndex(
          (el) => el.type === 'image' && near(el.x, m.x) && near(el.y, m.y) && near(el.width, m.width) && near(el.height, m.height),
        );
        const shot = { ...(at >= 0 ? doc.elements[at] : {}), type: 'image', ...m, fit: 'cover', ...asset.patch } as DocElement;
        const elements = at >= 0 ? doc.elements.map((el, i) => (i === at ? shot : el)) : [shot, ...doc.elements];
        // A prebuilt mockup: the canvas takes the image's shape, so nothing is cropped.
        const whole = isWholeCanvasSlot(doc);
        const natural = (asset.patch as { natural?: { width: number; height: number } }).natural;
        const next = whole && natural ? fitCanvasToImage({ ...doc, elements }, natural) : { ...doc, elements };
        commit(next);
        setUI({ selected: String(at >= 0 ? at : 0) });
        flash(
          whole
            ? `Mockup placed — the canvas is now ${next.canvas.width} × ${next.canvas.height}, the image's shape · ${asset.note}`
            : `Screenshot placed in the ${m.width} × ${m.height} slot, cropped to fill · ${asset.note}`,
        );
      } catch (err) {
        flash(`Could not read that file — ${(err as Error).message}`);
      }
      return;
    }

    const slot = slotForDrop(doc, resolveLayout(doc), hit, { x: px, y: py });
    const cw = contentWidth(doc, slot);
    let last: string | null = null;
    const notes: string[] = [];

    try {
      for (const [i, file] of usable.entries()) {
        const asset = await readAsset(file, cw ? Math.min(160, cw) : 160, undefined, true);
        // Several files fan out a little, so they do not land exactly stacked.
        const at = {
          x: snap(px - asset.size.width / 2 + i * 12, snapStep),
          y: snap(py - asset.size.height / 2 + i * 12, snapStep),
        };
        // In a flow, each next file goes after the previous one.
        const where = slot.index === undefined ? slot : { ...slot, index: slot.index + i };
        const next = insertAt(doc, where, assetElement(asset, at));
        doc = next.doc;
        last = next.path;
        notes.push(asset.note);
      }
    } catch (err) {
      notes.push(`Could not read a file — ${(err as Error).message}`);
    }

    // One commit, so a multi-file drop is one undo step.
    if (last) {
      commit(doc);
      setUI({ selected: last });
    }
    if (skipped) notes.push(`skipped ${skipped} unsupported file${skipped === 1 ? '' : 's'}`);
    flash(notes.join(' · '));
  };

  return { dropping, placing, note, handlers: { onDragOver, onDragLeave, onDrop: (e: React.DragEvent) => void onDrop(e) } };
}
