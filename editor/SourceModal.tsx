import { useEffect, useRef, useState } from 'react';
import { copyText } from './save.ts';

/**
 * SVG SOURCE — the escape hatch that always works.
 *
 * Downloads can be declined or ungranted, and `clipboard.writeText` needs
 * document focus and can be refused outright in a sandboxed frame. A readonly
 * textarea with the text pre-selected has neither problem: the viewer presses
 * ⌘C on a native selection. The Copy button is the convenience; the selection
 * is the guarantee.
 */
export function SourceModal({
  filename,
  source,
  onClose,
}: {
  filename: string;
  source: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kb = (source.length / 1024).toFixed(1);

  return (
    <div className="modal-scrim" onPointerDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="SVG source"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>{filename}</strong>
          <span className="modal-meta">{kb} KB</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea ref={ref} readOnly value={source} spellCheck={false} />

        <div className="modal-foot">
          <span className="modal-hint">
            {note ?? 'Selected — press ⌘C to copy, or use the button.'}
          </span>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              const ok = await copyText(source);
              setNote(
                ok
                  ? 'Copied to clipboard.'
                  : 'Clipboard blocked here — the text is selected, press ⌘C.',
              );
              ref.current?.select();
            }}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
