import type { Element } from '../src/document.ts';
import { ZOOM_MAX } from '../src/imageCrop.ts';
import { naturalSize } from './pickFile.ts';

type ImageEl = Extract<Element, { type: 'image' }>;

/**
 * Where a `cover` picture sits in its frame — the same crop a double-click
 * and drag on the canvas sets, as sliders: across, down, and how far in.
 * The picture's own size is learned the first time, for an image uploaded
 * before sizes were recorded.
 */
export function CropField({ el, onPatch }: { el: ImageEl; onPatch: (p: Record<string, unknown>) => void }) {
  if ((el.fit ?? 'cover') !== 'cover') return <span className="hint">Only a Cover image can be repositioned.</span>;
  const crop = el.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
  const set = async (patch: Partial<typeof crop>) => {
    const natural = el.natural ?? (el.href ? await naturalSize(el.href) : null);
    if (!natural) return;
    onPatch({ natural, crop: { ...crop, ...patch } });
  };
  const slider = (label: string, key: 'x' | 'y', title: string) => (
    <label className="crop-row" title={title}>
      <span>{label}</span>
      <input type="range" min={0} max={100} step={1} value={Math.round((crop[key] ?? 0.5) * 100)} onChange={(e) => void set({ [key]: Number(e.target.value) / 100 })} />
      <span className="crop-value">{Math.round((crop[key] ?? 0.5) * 100)}%</span>
    </label>
  );
  return (
    <span className="series crop-field">
      {slider('Across', 'x', 'Which part shows, left to right')}
      {slider('Down', 'y', 'Which part shows, top to bottom')}
      <label className="crop-row" title="Scale the picture further in">
        <span>Zoom</span>
        <input type="range" min={100} max={ZOOM_MAX * 100} step={5} value={Math.round((crop.zoom ?? 1) * 100)} onChange={(e) => void set({ zoom: Number(e.target.value) / 100 })} />
        <span className="crop-value">{Math.round((crop.zoom ?? 1) * 100)}%</span>
      </label>
      <span className="series-actions">
        <span className="hint">Or double-click the image and drag it.</span>
        <button type="button" className="mini" onClick={() => onPatch({ crop: undefined })} title="Centred, at its natural fill">
          Reset
        </button>
      </span>
    </span>
  );
}
