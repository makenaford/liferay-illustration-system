import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element, GraphicArt } from '../src/document.ts';
import { GLASS_ICONS } from '../src/glassIcons.generated.ts';
import { SPOT_GROUPS, SPOT_KEYS, SPOT_LABELS } from './schema.ts';
import { libraryGlassIcons, type LibraryGlass, type LibraryGlassIcon } from './glassLibrary.ts';

/**
 * The glass icon picker. Inside the Marketing Assets site it offers exactly
 * the library's Glass icons set, by its folders — an icon removed there is no
 * longer offered. An icon the builder also ships is referenced by key; one
 * only the library has is copied into the illustration. On its own, with no
 * library, the builder offers the set it ships. Whatever the illustration
 * already uses stays selectable, removed or not.
 *
 * Searchable, as the icon picker is: a box that matches the icon's name and
 * its folder, a folder filter, and the icons themselves to pick from.
 */

interface Option {
  value: string;
  label: string;
  category: string;
  art?: GraphicArt;
}

/** Artwork as an `<img>` source, its ids namespaced so two never clash. */
function thumb(art: GraphicArt, ns: string): string {
  const body = art.body.replaceAll('__NS__', `gp-${ns}-`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox.join(' ')}" fill="none">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function Thumb({ art, ns, size }: { art?: GraphicArt; ns: string; size: number }) {
  const src = useMemo(() => (art ? thumb(art, ns) : null), [art, ns]);
  return src ? (
    <img src={src} alt="" width={size} height={size} style={{ objectFit: 'contain', display: 'block' }} />
  ) : (
    <span className="iconpick-none" />
  );
}

export function GlassIconField({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const g = el as Extract<Element, { type: 'spotIcon' }>;
  // undefined while loading, null when there is no library.
  const [library, setLibrary] = useState<LibraryGlass | undefined>(undefined);
  useEffect(() => {
    void libraryGlassIcons(true).then(setLibrary);
  }, []);
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

  const value = g.art ? `lib:${g.art.id}` : `builtin:${g.name}`;
  const valueOf = (l: LibraryGlassIcon) => (l.builtin ? `builtin:${l.builtin}` : `lib:${l.id}`);

  // What to offer: the library's set, or with none the shipped one. The
  // previews are the dark artwork, drawn for a dark ground like the panel's.
  const options = useMemo<Option[]>(() => {
    if (library)
      return library.map((l) => ({ value: valueOf(l), label: l.label, category: l.category, art: l.dark }));
    if (library === null)
      return SPOT_KEYS.map((k) => ({ value: `builtin:${k}`, label: SPOT_LABELS[k], category: SPOT_GROUPS[k], art: GLASS_ICONS[k]?.dark }));
    return [];
  }, [library]);
  const categories = useMemo(() => [...new Set(options.map((o) => o.category))], [options]);

  const needle = q.trim().toLowerCase();
  const hits = options.filter(
    (o) =>
      (!cat || o.category === cat) &&
      (!needle || `${o.label} ${o.category}`.toLowerCase().includes(needle)),
  );

  const chosen = options.find((o) => o.value === value);
  const currentArt = chosen?.art ?? g.art?.dark ?? GLASS_ICONS[g.name]?.dark;
  const current = chosen?.label ?? (g.art ? g.art.label : (SPOT_LABELS[g.name] ?? g.name));

  const pick = (v: string) => {
    if (v.startsWith('builtin:')) onPatch({ name: v.slice(8), art: undefined });
    else if (v.startsWith('lib:')) {
      const l = library?.find((x) => x.id === v.slice(4));
      if (l) onPatch({ art: { id: l.id, label: l.label, category: l.category, dark: l.dark, light: l.light } });
    }
    setOpen(false);
    // The next look starts from the whole set.
    setQ('');
    setCat('');
  };

  return (
    <div className="iconpick" ref={ref}>
      <button type="button" className="iconpick-trigger" onClick={() => setOpen((o) => !o)} title={current}>
        <Thumb art={currentArt} ns="current" size={18} />
        <span className="iconpick-name">{library === undefined ? `${current} (loading…)` : current}</span>
        <span className="tokenpick-caret">▾</span>
      </button>

      {open && (
        <div className="iconpick-pop">
          <div className="iconpick-bar">
            <input
              autoFocus
              className="tokenpick-search"
              placeholder={`Search ${options.length} glass icons…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the first match, so typing a name is enough.
                if (e.key === 'Enter' && hits[0]) {
                  e.preventDefault();
                  pick(hits[0].value);
                }
              }}
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Folder">
              <option value="">All folders</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="iconpick-grid glasspick-grid">
            {hits.map((o, i) => (
              <button
                key={o.value}
                type="button"
                className={o.value === value ? 'on' : ''}
                title={`${o.label} · ${o.category}`}
                onClick={() => pick(o.value)}
              >
                <Thumb art={o.art} ns={String(i)} size={30} />
              </button>
            ))}
          </div>
          <div className="tokenpick-foot">
            {library === undefined
              ? 'Loading the library’s glass icons…'
              : hits.length
                ? `${hits.length} of ${options.length} glass icon${options.length === 1 ? '' : 's'}${needle && hits.length ? ' · Enter picks the first' : ''}`
                : `No glass icon matches “${q.trim()}”`}
          </div>
        </div>
      )}
    </div>
  );
}
