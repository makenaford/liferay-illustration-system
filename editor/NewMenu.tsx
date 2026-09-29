import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, type TemplateName } from './docs.ts';

/**
 * "New illustration", with a choice of what to start from (TEMPLATES): a
 * button that opens a short menu of templates, each with a line on what it
 * is. Used by the standalone library and by the Marketing Assets site.
 */
export function NewMenu({
  onPick,
  onFigma,
  className = 'primary',
  label = 'New illustration',
}: {
  onPick: (template: TemplateName) => void;
  /** Offer "From a Figma SVG…" — see editor/figmaImport.ts. */
  onFigma?: () => void;
  /** The trigger's class, so each host styles it as its own primary button. */
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="newmenu" ref={ref}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="newmenu-pop" role="menu" aria-label="Start from">
          {(Object.keys(TEMPLATES) as TemplateName[]).map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(t);
              }}
            >
              <b>{TEMPLATES[t].label}</b>
              <span>{TEMPLATES[t].description}</span>
            </button>
          ))}
          {onFigma && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onFigma();
              }}
            >
              <b>From a Figma SVG…</b>
              <span>A frame exported from Figma as SVG, with Outline text off, rebuilt as editable text, cards and images.</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
