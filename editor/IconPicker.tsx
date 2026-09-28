import { useEffect, useMemo, useRef, useState } from 'react';
import { CUSTOM_PREFIX, iconArt, ICON_LIBRARY, MINGCUTE_PREFIX, type IconStyle } from '../src/icons.ts';

/**
 * ICON PICKER — the team's own icons and MingCute's, searchable, in the
 * style the element uses.
 *
 * 1,600 icons do not fit a dropdown, so this is a search over names and
 * MingCute's categories, drawn as a grid of the icons themselves. It shows
 * the first matches and asks for a narrower search past that, rather than
 * drawing the whole set at once.
 */

/** The team's own categories (assets/custom-icons/), listed apart from MingCute's. */
const OWN = [...new Set(ICON_LIBRARY.filter((i) => i.key.startsWith(CUSTOM_PREFIX)).map((i) => i.c))].sort();
const CATEGORIES = [...new Set(ICON_LIBRARY.filter((i) => i.key.startsWith(MINGCUTE_PREFIX)).map((i) => i.c))].sort();
/** A category choice: `own:<c>` for the team's, the bare name for MingCute's. */
const inCategory = (i: (typeof ICON_LIBRARY)[number], cat: string) =>
  !cat || (cat.startsWith('own:') ? i.key.startsWith(CUSTOM_PREFIX) && i.c === cat.slice(4) : i.key.startsWith(MINGCUTE_PREFIX) && i.c === cat);
const SHOWN = 240;

/** A readable name: `arrow_left_circle` -> "arrow left circle". */
const label = (name: string) => name.replace(/[_-]+/g, ' ');

function Glyph({ k, style, size = 18 }: { k: string; style: IconStyle; size?: number }) {
  const art = iconArt(k, style);
  if (!art) return <span className="iconpick-none" style={{ width: size, height: size }} />;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${art.box} ${art.box}`} aria-hidden>
      <path
        d={art.path}
        fill={art.stroke ? 'none' : 'currentColor'}
        fillRule={art.evenOdd ? 'evenodd' : undefined}
        stroke={art.stroke ? 'currentColor' : undefined}
        strokeWidth={art.stroke ? art.box / 16 : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPicker({
  value,
  style,
  onChange,
}: {
  value: string | undefined;
  style: IconStyle;
  onChange: (key: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
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

  const needle = q.trim().toLowerCase().replace(/\s+/g, '_');
  const hits = useMemo(
    () =>
      ICON_LIBRARY.filter(
        (i) => inCategory(i, cat) && (!needle || i.name.includes(needle) || i.c.toLowerCase().includes(needle)),
      ),
    [needle, cat],
  );

  const name = value?.replace(/^(mc|custom):/, '');

  return (
    <div className="iconpick" ref={ref}>
      <button type="button" className="iconpick-trigger" onClick={() => setOpen((o) => !o)} title={value ?? 'No icon'}>
        {value ? <Glyph k={value} style={style} /> : <span className="iconpick-none" />}
        <span className="iconpick-name">{name ? label(name) : 'No icon'}</span>
        <span className="tokenpick-caret">▾</span>
      </button>

      {open && (
        <div className="iconpick-pop">
          <div className="iconpick-bar">
            <input
              autoFocus
              className="tokenpick-search"
              placeholder={`Search ${ICON_LIBRARY.length.toLocaleString()} icons…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
              <option value="">All</option>
              {OWN.length > 0 && (
                <optgroup label="Our icons">
                  {OWN.map((c) => (
                    <option key={c} value={`own:${c}`}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="MingCute">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="iconpick-grid">
            <button
              type="button"
              className={!value ? 'on' : ''}
              title="No icon"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              <span className="iconpick-none" />
            </button>
            {hits.slice(0, SHOWN).map(({ key: k, name: n }) => {
              return (
                <button
                  key={k}
                  type="button"
                  className={value === k ? 'on' : ''}
                  title={label(n)}
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                >
                  <Glyph k={k} style={style} size={20} />
                </button>
              );
            })}
          </div>
          <div className="tokenpick-foot">
            {hits.length > SHOWN
              ? `Showing ${SHOWN} of ${hits.length} — search to narrow`
              : `${hits.length} icon${hits.length === 1 ? '' : 's'}`}{' '}
            · MingCute
          </div>
        </div>
      )}
    </div>
  );
}
