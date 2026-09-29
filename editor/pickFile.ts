import { glassIconForSvg } from './glassLibrary.ts';
import { dataUriBytes, importSvg, RASTER_WARN_BYTES } from '../src/importAsset.ts';
import type { Element } from '../src/document.ts';
import { compressImage } from './compressImage.ts';

/**
 * FILE PICKING — one implementation, two entry points.
 *
 * The Palette's "Import" button creates a new element; the Inspector's
 * "Choose file" field fills in an existing one. Both need the same parse,
 * sanitise and natural-size logic, so it lives here rather than inside
 * either piece of UI.
 */

export const ASSET_ACCEPT = '.svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif';

/**
 * Open the OS file chooser and resolve with the chosen file, or `null` if the
 * user cancelled.
 *
 * The input is attached to the document rather than left floating: Safari
 * ignores `.click()` on a detached input, and an artifact iframe is exactly
 * where that would go unnoticed.
 */
export function pickFile(accept = ASSET_ACCEPT): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);

    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    // `cancel` is not universal; the focus fallback covers the rest. Both are
    // guarded by `settled`, so a browser firing both still resolves once.
    input.addEventListener('cancel', () => done(null));
    window.addEventListener(
      'focus',
      () => setTimeout(() => done(input.files?.[0] ?? null), 400),
      { once: true },
    );

    input.click();
  });
}

/** The props a file contributes to an element — everything but its position. */
export interface AssetPatch {
  type: 'image' | 'svg' | 'spotIcon';
  patch: Record<string, unknown>;
  /** Natural size, capped, for a fresh placement. */
  size: { width: number; height: number };
  note: string;
}

/**
 * Read a picked file into element props: SVGs are parsed and inlined, rasters
 * become data URIs. Both are embedded rather than linked so an exported
 * illustration is one self-contained file. A raster is compressed on the way
 * in (compressImage.ts) for `slot`, the size it will be shown at.
 */
export async function readAsset(
  file: File,
  cap = 160,
  slot?: { width: number; height: number },
  /** Placing a new element: a library glass icon comes in as one. */
  glass = false,
): Promise<AssetPatch> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

  if (isSvg) {
    const text = await file.text();
    const icon = glass ? await glassIconForSvg(text) : null;
    if (icon) {
      return {
        type: 'spotIcon',
        patch: icon.builtin
          ? { name: icon.builtin }
          : { name: icon.id, art: { id: icon.id, label: icon.label, category: icon.category, dark: icon.dark, light: icon.light } },
        size: { width: 64, height: 64 },
        note: `Placed ${icon.label} as a glass icon — it follows the theme`,
      };
    }
    const art = importSvg(text);
    const [, , vw, vh] = art.viewBox;
    const scale = Math.min(1, cap / Math.max(vw, vh));
    return {
      type: 'svg',
      patch: {
        viewBox: art.viewBox,
        body: art.body,
        alt: file.name.replace(/\.svg$/i, ''),
      },
      size: { width: Math.round(vw * scale), height: Math.round(vh * scale) },
      note: `Imported ${file.name}${art.notes.length ? ` — ${art.notes.join('; ')}` : ''}`,
    };
  }

  const raw = await new Promise<string>((resolve, reject) => {
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
    img.src = raw;
  });
  // For its slot, or for as big as it could be shown when it has none yet.
  const small = await compressImage(raw, dims.w, dims.h, slot ?? { width: dims.w / 2, height: dims.h / 2 });
  const href = small.href;
  const scale = Math.min(1, (cap * 1.25) / Math.max(dims.w, dims.h));

  const bytes = dataUriBytes(href);
  const kb = Math.round(bytes / 1024);
  return {
    type: 'image',
    // Its own size, to place it by hand in its frame; a new picture starts centred.
    patch: { href, alt: file.name, natural: { width: dims.w, height: dims.h }, crop: undefined },
    size: { width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) },
    note:
      bytes > RASTER_WARN_BYTES
        ? `Imported ${file.name} — ${kb} KB embedded. Large rasters bloat every export; consider a URL or an SVG.`
        : `Imported ${file.name} (${small.change ?? `${kb} KB`})`,
  };
}

/** A fresh element for a picked file, placed at `at`. */
export function assetElement(asset: AssetPatch, at: { x: number; y: number }): Element {
  if (asset.type === 'spotIcon') return { type: 'spotIcon', x: at.x, y: at.y, size: asset.size.width, ...asset.patch } as Element;
  return asset.type === 'svg'
    ? ({ type: 'svg', x: at.x, y: at.y, ...asset.size, ...asset.patch } as Element)
    : ({ type: 'image', x: at.x, y: at.y, ...asset.size, fit: 'cover', ...asset.patch } as Element);
}

/** A picture's own size, read by loading it — for an image uploaded before sizes were recorded. */
export function naturalSize(href: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = href;
  });
}
