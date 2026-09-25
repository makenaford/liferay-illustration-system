import { useState } from 'react';
import { dataUriBytes } from '../src/importAsset.ts';
import { pickFile } from './pickFile.ts';

/**
 * The avatar's photo: upload one from the computer, or point at a URL.
 *
 * An uploaded photo has to be embedded or the illustration loses it on
 * export, and embedded full-size photos are what bloated the original
 * exports. So the upload is cropped to a centred square and redrawn at
 * `PHOTO_PX` as a JPEG — sharp at any avatar size the set uses, at a few
 * tens of KB rather than megabytes.
 */
const PHOTO_PX = 256;
const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

async function squarePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('not an image this browser can read'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const px = Math.min(PHOTO_PX, side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const g = canvas.getContext('2d')!;
    // JPEG has no alpha: a transparent PNG would otherwise turn black.
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, px, px);
    g.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      px,
      px,
    );
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarPhotoField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (href: string | undefined) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const embedded = !!value?.startsWith('data:');

  const choose = async () => {
    setBusy(true);
    try {
      const file = await pickFile(PHOTO_ACCEPT);
      if (!file) return;
      const href = await squarePhoto(file);
      onChange(href);
      setNote(`${file.name} — ${Math.round(dataUriBytes(href) / 1024)} KB embedded`);
    } catch (err) {
      setNote(`Could not read that file — ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="file-field">
      <div className="photo-actions">
        <button type="button" className="import-btn" disabled={busy} onClick={() => void choose()}>
          {busy ? 'Reading…' : value ? 'Replace photo…' : 'Upload photo…'}
        </button>
        {value && (
          <button
            type="button"
            className="import-btn"
            onClick={() => {
              onChange(undefined);
              setNote(null);
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder={embedded ? 'Uploaded photo' : 'or paste an image URL'}
        value={embedded ? '' : value ?? ''}
        onChange={(e) => {
          onChange(e.target.value || undefined);
          setNote(null);
        }}
      />
      {note && <p className="import-note">{note}</p>}
      {!value && !note && <p className="import-note">No photo — the avatar shows its initials.</p>}
    </div>
  );
}
