import { useEffect, useMemo, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { LANGUAGES, type Lang } from '../src/translate.ts';
import type { Folders } from '../editor/library.ts';
import { folderPath, folderTree } from '../editor/library.ts';
import type { IllustrationRow, KitRow } from './store.ts';

/**
 * KITS — ready-made sets of illustrations for people who only download.
 *
 * An editor puts one together once: which illustrations, and how they come —
 * SVG or PNG at a scale, dark and/or light, in which language. Anyone then
 * opens it, from here or from a link to it, and takes it as one zip with
 * nothing to choose. A kit holds its illustrations by id, so it always gives
 * their latest versions; one deleted since is left out and said so.
 */

type Theme = 'dark' | 'light';

const LANG_NAME: Record<KitRow['lang'], string> = {
  en: 'English',
  ...(Object.fromEntries(Object.entries(LANGUAGES).map(([k, v]) => [k, v.name])) as Record<Lang, string>),
};

/** What a kit downloads as, in a line: "12 illustrations · PNG @2x · dark and light · Japanese". */
export function kitSummary(kit: KitRow, count: number): string {
  const format = kit.format === 'svg' ? 'SVG' : `PNG @${kit.scale ?? 2}x`;
  const themes = kit.themes.length === 2 ? 'dark and light' : kit.themes[0];
  return `${count} illustration${count === 1 ? '' : 's'} · ${format} · ${themes} · ${LANG_NAME[kit.lang]}`;
}

function Thumb({ row, theme }: { row: IllustrationRow; theme: Theme }) {
  const svg = useMemo(() => renderDocument(row.doc, theme, { embedFont: false }), [row.doc, theme]);
  const { width, height } = row.doc.canvas;
  return (
    <span
      className={`am-kit-thumb ${theme}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      title={row.name}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function KitsPage({
  kits,
  rows,
  writable,
  busy,
  focus,
  onDownload,
  onCopyLink,
  onEdit,
  onDelete,
  onOpen,
}: {
  kits: KitRow[];
  rows: IllustrationRow[];
  writable: boolean;
  /** The kit being zipped, and what the zip is doing. */
  busy: { id: string; label: string } | null;
  /** A kit a link opened: shown first and picked out. */
  focus: string | null;
  onDownload: (kit: KitRow) => void;
  onCopyLink: (kit: KitRow) => void;
  /** null: a new kit. */
  onEdit: (kit: KitRow | null) => void;
  onDelete: (kit: KitRow) => void;
  onOpen: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const ordered = [...kits].sort(
    (a, b) => Number(b.id === focus) - Number(a.id === focus) || a.name.localeCompare(b.name),
  );

  if (!kits.length) {
    return (
      <div className="am-empty">
        <h2>No kits yet</h2>
        <p>
          A kit is a ready-made set of illustrations — the right ones, in the right format, theme and language — that
          anyone can download in one go, or open from a link.{' '}
          {writable ? (
            <>
              Make one with{' '}
              <button type="button" className="am-linkish" onClick={() => onEdit(null)}>
                New kit
              </button>
              , or select illustrations and choose <b>Make a kit</b>.
            </>
          ) : (
            'Ask an editor to make one.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="am-sets am-kits">
      {ordered.map((kit) => {
        const present = kit.items.map((id) => byId.get(id)).filter((r): r is IllustrationRow => !!r);
        const missing = kit.items.length - present.length;
        const zipping = busy?.id === kit.id;
        return (
          <section key={kit.id} className={`am-set am-kit${kit.id === focus ? ' am-kit-focus' : ''}`} aria-label={kit.name}>
            <div className="am-set-head">
              <h2>{kit.name}</h2>
              <span className="am-meta">{kitSummary(kit, present.length)}</span>
              <div className="am-set-actions">
                <button type="button" className="am-primary" disabled={!present.length || !!busy} onClick={() => onDownload(kit)}>
                  {zipping ? busy.label : 'Download kit'}
                </button>
                <button type="button" onClick={() => onCopyLink(kit)} title="Copy a link that opens this kit on this site">
                  Copy link
                </button>
                {writable && (
                  <>
                    <button type="button" onClick={() => onEdit(kit)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`am-danger${armed === kit.id ? ' am-confirming' : ''}`}
                      onClick={() => (armed === kit.id ? onDelete(kit) : setArmed(kit.id))}
                    >
                      {armed === kit.id ? 'Click again to delete' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {kit.description && <p className="am-hint am-kit-note">{kit.description}</p>}
            {missing > 0 && (
              <p className="am-hint">
                {missing} illustration{missing === 1 ? ' is' : 's are'} no longer in the library and left out.
              </p>
            )}
            {present.length ? (
              <div className="am-kit-strip">
                {present.map((r) => (
                  <button key={r.id} type="button" className="am-kit-item" onClick={() => onOpen(r.id)} title={`${r.name} — open its details`}>
                    <Thumb row={r} theme={kit.themes[0] ?? 'dark'} />
                    <span>{r.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="am-hint">Nothing in this kit is in the library any more.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** A new kit's settings: the illustrations' own size, both themes, English. */
export function blankKit(id: string, items: string[] = []): KitRow {
  return { id, name: '', items, format: 'svg', scale: 2, themes: ['dark', 'light'], lang: 'en', updatedAt: 0 };
}

export function KitEditor({
  kit,
  isNew,
  rows,
  folders,
  canTranslate,
  onSave,
  onCancel,
}: {
  kit: KitRow;
  isNew: boolean;
  rows: IllustrationRow[];
  folders: Folders;
  /** Whether this site can translate — without it, only English is offered. */
  canTranslate: boolean;
  onSave: (kit: KitRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<KitRow>(kit);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const set = (patch: Partial<KitRow>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  const tree = useMemo(() => folderTree(folders), [folders]);
  const pathOf = (id: string) => {
    const f = folders.assign[id];
    return f ? folderPath(folders, f).join(' › ') : '';
  };
  // A folder shows what its subfolders hold too.
  const under = useMemo(() => {
    if (!folder) return null;
    const ids = new Set([folder]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders.folders) if (f.parent && ids.has(f.parent) && !ids.has(f.id)) ids.add(f.id), (grew = true);
    }
    return ids;
  }, [folder, folders]);

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => !under || under.has(folders.assign[r.id] ?? ''))
    .filter((r) => !needle || `${r.name} ${pathOf(r.id)}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const picked = new Set(draft.items);
  const toggle = (id: string) => set({ items: picked.has(id) ? draft.items.filter((x) => x !== id) : [...draft.items, id] });
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggleShown = () =>
    set({
      items: allShown
        ? draft.items.filter((id) => !shown.some((r) => r.id === id))
        : [...draft.items, ...shown.map((r) => r.id).filter((id) => !picked.has(id))],
    });
  const toggleTheme = (t: Theme) => {
    const has = draft.themes.includes(t);
    // Always at least one.
    if (has && draft.themes.length === 1) return;
    set({ themes: has ? draft.themes.filter((x) => x !== t) : (['dark', 'light'] as Theme[]).filter((x) => x === t || draft.themes.includes(x)) });
  };

  const ok = draft.name.trim().length > 0 && draft.items.length > 0;

  return (
    <div className="am-scrim" onClick={onCancel}>
      <div className="am-sheet am-kit-editor" role="dialog" aria-modal="true" aria-label={isNew ? 'New kit' : `Edit ${kit.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="am-sheet-head">
          <div>
            <h2>{isNew ? 'New kit' : `Edit ${kit.name}`}</h2>
            <p className="am-meta">The illustrations, and how they download. Anyone can then take them in one go.</p>
          </div>
          <button type="button" className="am-x" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="am-sheet-body">
          <label className="am-field">
            <span>Name</span>
            <input autoFocus value={draft.name} placeholder="Japan industry pages" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="am-field">
            <span>What it is for · optional</span>
            <input
              value={draft.description ?? ''}
              placeholder="Hero images for the Japan site's industry pages"
              onChange={(e) => set({ description: e.target.value || undefined })}
            />
          </label>

          <div className="am-kit-settings">
            <label className="am-field">
              <span>Format</span>
              <select value={draft.format} onChange={(e) => set({ format: e.target.value as KitRow['format'] })}>
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
              </select>
            </label>
            {draft.format === 'png' && (
              <label className="am-field">
                <span>Scale</span>
                <select value={draft.scale ?? 2} onChange={(e) => set({ scale: Number(e.target.value) as 1 | 2 | 3 })}>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
              </label>
            )}
            <div className="am-field">
              <span>Themes</span>
              <div className="am-seg" role="group" aria-label="Themes">
                {(['dark', 'light'] as Theme[]).map((t) => (
                  <button key={t} type="button" className={draft.themes.includes(t) ? 'am-on' : ''} aria-pressed={draft.themes.includes(t)} onClick={() => toggleTheme(t)}>
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
            <label className="am-field">
              <span>Language</span>
              <select value={draft.lang} onChange={(e) => set({ lang: e.target.value as KitRow['lang'] })}>
                <option value="en">English</option>
                {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
                  <option key={l} value={l} disabled={!canTranslate}>
                    {LANGUAGES[l].name} — {LANGUAGES[l].native}
                    {canTranslate ? '' : ' (not available here)'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="am-field">
            <span>
              Illustrations · {draft.items.length} in the kit
            </span>
            <div className="am-kit-pickbar">
              <input value={q} placeholder="Search illustrations and folders" onChange={(e) => setQ(e.target.value)} />
              <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
                <option value="">All folders</option>
                {tree.map(({ folder: f, depth }) => (
                  <option key={f.id} value={f.id}>
                    {'  '.repeat(depth)}
                    {f.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!shown.length} onClick={toggleShown}>
                {allShown ? 'Remove these' : `Add all ${shown.length}`}
              </button>
            </div>
            <ul className="am-kit-pick">
              {shown.map((r) => (
                <li key={r.id}>
                  <label>
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                    <span>{r.name}</span>
                    {pathOf(r.id) && <span className="am-meta">{pathOf(r.id)}</span>}
                  </label>
                </li>
              ))}
              {!shown.length && <li className="am-meta">No illustrations match.</li>}
            </ul>
          </div>

          <div className="am-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="am-primary" disabled={!ok} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
              {isNew ? 'Make kit' : 'Save kit'}
            </button>
          </div>
          {!ok && <p className="am-hint">{!draft.name.trim() ? 'Give the kit a name.' : 'Add at least one illustration.'}</p>}
        </div>
      </div>
    </div>
  );
}
