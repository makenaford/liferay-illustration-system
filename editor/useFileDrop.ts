import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../src/document.ts';
import { assetElement, readAsset } from './pickFile.ts';
import { appendTo, commit, elementAt, getState, isContainer, parentOf, setUI } from './state.ts';
import { snap } from './grid.ts';

/**
 * DRAG AND DROP — files dropped on the canvas become elements.
 *
 * The same read, sanitise and embed path as the Import button (`readAsset`),
 * so a dropped SVG is inlined and id-namespaced and a dropped raster becomes
 * a data URI, with the same size warning. What drop adds is placement: the
 * artwork lands centred on the cursor, and a drop onto a freely-positioned
 * card or group goes INTO it, so it moves with that card afterwards.
 *
 * Auto-layout containers are skipped on purpose. Their children's positions
 * are computed, so a drop into one would jump to the end of its flow — away
 * from the cursor, and usually out through the bottom of a fixed-height card.
 */

const ACCEPTED = /^image\/(svg\+xml|png|jpeg|webp|gif)$/;
const accepted = (f: File) => ACCEPTED.test(f.type) || /\.svg$/i.test(f.name);
const hasFiles = (e: DragEvent | React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * The innermost freely-positioned container at a path, walking up from the
 * element hit. Stops at the first auto-layout container: anything inside one
 * is positioned by it, so the drop goes to that container's own parent level.
 */
function containerAt(doc: Doc, path: string | null): string | null {
  let found: string | null = null;
  for (let p = path; p; p = parentOf(p)) {
    const el = elementAt(doc, p);
    if (!isContainer(el)) continue;
    if ((el as { layout?: unknown }).layout) found = null;
    else if (found === null) found = p;
  }
  return found;
}

export function useFileDrop(stageRef: React.RefObject<HTMLDivElement | null>, zoom: number, snapStep: number) {
  const [dropping, setDropping] = useState(false);
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
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dropping) setDropping(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Leaving for a child of the viewport is not leaving.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
  };

  const onDrop = async (e: React.DragEvent) => {
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
    const into = containerAt(doc, hit);
    let last: string | null = null;
    const notes: string[] = [];

    try {
      for (const [i, file] of usable.entries()) {
        const asset = await readAsset(file);
        // Several files fan out a little, so they do not land exactly stacked.
        const at = {
          x: snap(px - asset.size.width / 2 + i * 12, snapStep),
          y: snap(py - asset.size.height / 2 + i * 12, snapStep),
        };
        const next = appendTo(doc, into, assetElement(asset, at));
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

  return { dropping, note, handlers: { onDragOver, onDragLeave, onDrop: (e: React.DragEvent) => void onDrop(e) } };
}
