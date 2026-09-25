import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { copyText, saveFile } from '../editor/save.ts';
import { svgToPng } from '../editor/png.ts';
import {
  canWrite,
  names as namesOf,
  store,
  viewerId,
  type IconRow,
  type IconSetRow,
  type IllustrationRow,
  type Library,
  type Store,
} from './store.ts';
import { parseFiles, slug, svgSrc, type ParsedIcon } from './uploads.ts';

type Theme = 'dark' | 'light';
type Tab = 'illustrations' | 'icons';

const BUILDER_URL = 'https://claude.ai/artifact/99HVZBUZbx9K3iG8dJStgd';

/** "Sep 25" this year, "Sep 25, 2025" before it. */
function when(ms: number) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function App() {
  const [st, setSt] = useState<Store | null>(null);
  const [lib, setLib] = useState<Library>({ illustrations: [], sets: [], ready: false });
  const [writable, setWritable] = useState(true);
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#icons' ? 'icons' : 'illustrations'));
  const [art, setArt] = useState<Theme>('dark');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [pendingIcons, setPendingIcons] = useState<ParsedIcon[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    void store().then((s) => {
      setSt(s);
      off = s.watch(setLib);
    });
    void canWrite().then(setWritable);
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Uploader names, resolved for this viewer and never stored.
  const [people, setPeople] = useState<Record<string, string>>({});
  const uploaderIds = [
    ...new Set(
      [...lib.illustrations.map((i) => i.uploadedBy), ...lib.sets.map((s) => s.createdBy)].filter(
        (x): x is string => !!x,
      ),
    ),
  ].join(',');
  useEffect(() => {
    if (uploaderIds) void namesOf(uploaderIds.split(',')).then(setPeople);
  }, [uploaderIds]);
  const who = (id?: string) => (id ? people[id] || 'A teammate' : null);

  const needle = query.trim().toLowerCase();
  const illustrations = useMemo(
    () =>
      [...lib.illustrations]
        .filter((i) => !needle || i.name.toLowerCase().includes(needle))
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
    [lib.illustrations, needle],
  );
  const sets = useMemo(
    () =>
      [...lib.sets]
        .map((s) => ({
          ...s,
          icons: [...s.icons]
            .filter((i) => !needle || i.name.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((s) => !needle || s.icons.length)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lib.sets, needle],
  );
  const iconCount = lib.sets.reduce((n, s) => n + s.icons.length, 0);

  /** Take files from the picker or a drop. */
  const take = async (files: File[]) => {
    if (!st || !files.length) return;
    if (!writable) {
      setToast('You can browse and download here, but adding assets needs Contributor access — ask the owner.');
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseFiles(files);
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      let added = 0;
      let replaced = 0;
      for (const doc of parsed.illustrations) {
        const had = lib.illustrations.some((i) => i.id === doc.id);
        await st.putIllustration({ id: doc.id, name: doc.name, doc, uploadedAt: now, uploadedBy: by });
        if (had) replaced++;
        else added++;
      }
      const parts: string[] = [];
      if (added) parts.push(`Added ${added} illustration${added === 1 ? '' : 's'}`);
      if (replaced) parts.push(`replaced ${replaced} with a newer version`);
      if (parsed.icons.length) setPendingIcons(parsed.icons);
      if (parsed.illustrations.length) setTab('illustrations');
      if (parsed.skipped.length) parts.push(`skipped ${parsed.skipped.join('; ')}`);
      if (parts.length) setToast(`${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
    } catch (e) {
      setToast(`Could not add those files — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const addIcons = async (icons: ParsedIcon[], set: { id: string; name: string; isNew: boolean }) => {
    if (!st) return;
    setBusy(true);
    try {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      if (set.isNew) await st.putSet({ id: set.id, name: set.name, createdAt: now, createdBy: by });
      const existing = lib.sets.find((s) => s.id === set.id)?.icons ?? [];
      for (const icon of icons) {
        const id = slug(icon.name);
        await st.putIcon(set.id, {
          id,
          name: icon.name,
          svg: icon.svg,
          ...(icon.svgLight ? { svgLight: icon.svgLight } : {}),
          uploadedAt: now,
          uploadedBy: by,
        });
      }
      const replaced = icons.filter((i) => existing.some((e) => e.id === slug(i.name))).length;
      setToast(
        `Added ${icons.length - replaced} icon${icons.length - replaced === 1 ? '' : 's'} to ${set.name}` +
          (replaced ? `, replaced ${replaced}.` : '.'),
      );
      setPendingIcons(null);
      setTab('icons');
    } catch (e) {
      setToast(`Could not add the icons — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const openRow = lib.illustrations.find((i) => i.id === open) ?? null;

  return (
    <div
      className="page"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void take([...e.dataTransfer.files]);
      }}
    >
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <h1>Marketing Assets</h1>
            <p className="sub">
              {lib.ready
                ? `${lib.illustrations.length} illustration${lib.illustrations.length === 1 ? '' : 's'} · ${iconCount} icon${iconCount === 1 ? '' : 's'} in ${lib.sets.length} set${lib.sets.length === 1 ? '' : 's'}`
                : 'Loading the library…'}
            </p>
          </div>
        </div>
        <div className="tools">
          <label className="search">
            <span className="sr">Search assets</span>
            <input
              id="search"
              type="search"
              placeholder="Search by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="seg" role="group" aria-label="Artwork theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" className={art === t ? 'on' : ''} onClick={() => setArt(t)}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          {writable && (
            <button type="button" className="primary" disabled={busy} onClick={() => pickRef.current?.click()}>
              {busy ? 'Adding…' : 'Upload'}
            </button>
          )}
          <input
            ref={pickRef}
            id="upload"
            type="file"
            multiple
            accept=".json,.svg,application/json,image/svg+xml"
            hidden
            onChange={(e) => {
              void take([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <nav className="tabs" aria-label="Asset type">
        <button type="button" className={tab === 'illustrations' ? 'on' : ''} onClick={() => setTab('illustrations')}>
          Illustrations <span className="count">{lib.illustrations.length}</span>
        </button>
        <button type="button" className={tab === 'icons' ? 'on' : ''} onClick={() => setTab('icons')}>
          Icon sets <span className="count">{iconCount}</span>
        </button>
      </nav>

      {toast && (
        <p className="toast" role="status">
          {toast}
          <button type="button" className="x" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </p>
      )}

      <main>
        {tab === 'illustrations' ? (
          illustrations.length ? (
            <div className="grid">
              {illustrations.map((row) => (
                <IllustrationCard key={row.id} row={row} theme={art} by={who(row.uploadedBy)} onOpen={() => setOpen(row.id)} />
              ))}
            </div>
          ) : (
            <Empty
              ready={lib.ready}
              searching={!!needle}
              title="No illustrations yet"
              body={
                <>
                  Build one in the{' '}
                  <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer">
                    Illustration Builder
                  </a>
                  , save its <b>.json</b>, then drop it here. A library file from the builder’s <b>Export</b> adds
                  every illustration in it at once.
                </>
              }
            />
          )
        ) : sets.length ? (
          <div className="sets">
            {sets.map((s) => (
              <IconSet
                key={s.id}
                set={s}
                theme={art}
                by={who(s.createdBy)}
                writable={writable}
                store={st}
                onToast={setToast}
              />
            ))}
          </div>
        ) : (
          <Empty
            ready={lib.ready}
            searching={!!needle}
            title="No icon sets yet"
            body={
              <>
                Drop <b>.svg</b> files here to start a set. Files named “… - Dark” and “… - Light” become one icon
                with both variants.
              </>
            }
          />
        )}
      </main>

      {dragging && writable && (
        <div className="drop" aria-hidden>
          <p>Drop to add — builder .json files and .svg icons</p>
        </div>
      )}

      {openRow && (
        <IllustrationDetail
          row={openRow}
          initialTheme={art}
          by={who(openRow.uploadedBy)}
          writable={writable}
          store={st}
          onToast={setToast}
          onClose={() => setOpen(null)}
        />
      )}

      {pendingIcons && (
        <AddIcons
          icons={pendingIcons}
          sets={lib.sets}
          busy={busy}
          onCancel={() => setPendingIcons(null)}
          onAdd={(set) => void addIcons(pendingIcons, set)}
        />
      )}
    </div>
  );
}

function Empty({ ready, searching, title, body }: { ready: boolean; searching: boolean; title: string; body: React.ReactNode }) {
  if (!ready) return <p className="empty">Loading…</p>;
  if (searching) return <p className="empty">Nothing matches that search.</p>;
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function IllustrationCard({ row, theme, by, onOpen }: { row: IllustrationRow; theme: Theme; by: string | null; onOpen: () => void }) {
  const svg = useMemo(() => renderDocument(row.doc, theme, { embedFont: false }), [row.doc, theme]);
  const { width, height } = row.doc.canvas;
  return (
    <figure className="card">
      <button type="button" className="thumb" onClick={onOpen} aria-label={`Open ${row.name}`} style={{ aspectRatio: `${width} / ${height}` }}>
        <span className="art" dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
      <figcaption>
        <b title={row.name}>{row.name}</b>
        <span className="meta">
          {width} × {height} · {when(row.uploadedAt)}
          {by ? ` · ${by}` : ''}
        </span>
      </figcaption>
    </figure>
  );
}

/** Save a file, reporting the outcome in the status line. */
async function offer(filename: string, data: string | Blob, mime: string, onToast: (s: string) => void) {
  const out = await saveFile(filename, data, mime);
  if (out.status === 'saved') onToast(`Saved ${filename}.`);
  else if (out.status === 'error') onToast(`Could not save ${filename} — ${out.message}`);
  else if (out.status === 'unavailable') onToast('Saving files is not available in this view.');
}

function IllustrationDetail({
  row,
  initialTheme,
  by,
  writable,
  store: st,
  onToast,
  onClose,
}: {
  row: IllustrationRow;
  initialTheme: Theme;
  by: string | null;
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [confirming, setConfirming] = useState(false);
  const preview = useMemo(() => renderDocument(row.doc, theme, { embedFont: false }), [row.doc, theme]);
  const { width, height } = row.doc.canvas;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const svgFor = (t: Theme) => renderDocument(row.doc, t);
  const png = async (t: Theme) => {
    try {
      const blob = await svgToPng(svgFor(t), width, height, 2);
      await offer(`${row.id}.${t}@2x.png`, blob, 'image/png', onToast);
    } catch (e) {
      onToast(`Could not make the PNG — ${(e as Error).message}`);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={row.name} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>{row.name}</h2>
            <p className="meta">
              {width} × {height} · uploaded {when(row.uploadedAt)}
              {by ? ` by ${by}` : ''}
            </p>
          </div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="stage" style={{ aspectRatio: `${width} / ${height}` }}>
          <span className="art" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>

        <div className="sheet-body">
          <div className="seg" role="group" aria-label="Preview theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>

          <div className="downloads">
            <h3>Download</h3>
            <div className="dl-grid">
              <span className="dl-label">Dark</span>
              <button type="button" onClick={() => void offer(`${row.id}.dark.svg`, svgFor('dark'), 'image/svg+xml', onToast)}>SVG</button>
              <button type="button" onClick={() => void png('dark')}>PNG @2x</button>
              <span className="dl-label">Light</span>
              <button type="button" onClick={() => void offer(`${row.id}.light.svg`, svgFor('light'), 'image/svg+xml', onToast)}>SVG</button>
              <button type="button" onClick={() => void png('light')}>PNG @2x</button>
            </div>
            <div className="dl-row">
              <button
                type="button"
                onClick={() =>
                  void copyText(svgFor(theme)).then((ok) =>
                    onToast(ok ? `Copied the ${theme} SVG — paste into Figma.` : 'Could not reach the clipboard.'),
                  )
                }
              >
                Copy {theme} SVG
              </button>
              <button
                type="button"
                title="The builder's own file — Import it in the builder to edit"
                onClick={() => void offer(`${row.id}.json`, JSON.stringify(row.doc, null, 2), 'application/json', onToast)}
              >
                Builder file (.json)
              </button>
            </div>
            <p className="hint">
              To change it, open the builder file in the{' '}
              <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer">
                Illustration Builder
              </a>{' '}
              (Import), edit, and upload the new .json here — it replaces this one.
            </p>
          </div>

          {writable && (
            <button
              type="button"
              className={`danger${confirming ? ' confirming' : ''}`}
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  setTimeout(() => setConfirming(false), 4000);
                  return;
                }
                try {
                  await st?.deleteIllustration(row.id);
                  onToast(`Removed ${row.name} from the library.`);
                  onClose();
                } catch (e) {
                  onToast(`Could not remove it — ${(e as Error).message}`);
                }
              }}
            >
              {confirming ? 'Click again to remove it for everyone' : 'Remove from library'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function IconSet({
  set,
  theme,
  by,
  writable,
  store: st,
  onToast,
}: {
  set: IconSetRow;
  theme: Theme;
  by: string | null;
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
}) {
  const [picked, setPicked] = useState<IconRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const variant = (i: IconRow) => (theme === 'light' && i.svgLight ? i.svgLight : i.svg);

  return (
    <section className="set">
      <div className="set-head">
        <h2>{set.name}</h2>
        <span className="meta">
          {set.icons.length} icon{set.icons.length === 1 ? '' : 's'}
          {by ? ` · started by ${by}` : ''}
        </span>
        {writable && (
          <button
            type="button"
            className={`danger mini${confirming ? ' confirming' : ''}`}
            onClick={async () => {
              if (!confirming) {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 4000);
                return;
              }
              try {
                await st?.deleteSet(set);
                onToast(`Removed the ${set.name} set.`);
              } catch (e) {
                onToast(`Could not remove the set — ${(e as Error).message}`);
              }
            }}
          >
            {confirming ? 'Click again to remove the set' : 'Remove set'}
          </button>
        )}
      </div>
      <ul className={`icons ${theme}`}>
        {set.icons.map((icon) => (
          <li key={icon.id}>
            <button
              type="button"
              className={picked?.id === icon.id ? 'on' : ''}
              onClick={() => setPicked(picked?.id === icon.id ? null : icon)}
              title={icon.name}
            >
              <img src={svgSrc(variant(icon))} alt="" loading="lazy" />
              <span>{icon.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <div className="icon-bar" role="region" aria-label={picked.name}>
          <b>{picked.name}</b>
          <span className="meta">{picked.svgLight ? 'Dark and light variants' : 'One variant'}</span>
          <button type="button" onClick={() => void offer(`${slug(picked.name)}${picked.svgLight ? '-dark' : ''}.svg`, picked.svg, 'image/svg+xml', onToast)}>
            {picked.svgLight ? 'Dark SVG' : 'SVG'}
          </button>
          {picked.svgLight && (
            <button type="button" onClick={() => void offer(`${slug(picked.name)}-light.svg`, picked.svgLight!, 'image/svg+xml', onToast)}>
              Light SVG
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyText(variant(picked)).then((ok) => onToast(ok ? `Copied ${picked.name}.` : 'Could not reach the clipboard.'))}
          >
            Copy SVG
          </button>
          {writable && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                try {
                  await st?.deleteIcon(set.id, picked.id);
                  onToast(`Removed ${picked.name}.`);
                  setPicked(null);
                } catch (e) {
                  onToast(`Could not remove it — ${(e as Error).message}`);
                }
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AddIcons({
  icons,
  sets,
  busy,
  onCancel,
  onAdd,
}: {
  icons: ParsedIcon[];
  sets: IconSetRow[];
  busy: boolean;
  onCancel: () => void;
  onAdd: (set: { id: string; name: string; isNew: boolean }) => void;
}) {
  const [choice, setChoice] = useState<string>(sets[0]?.id ?? '__new');
  const [name, setName] = useState('');
  const isNew = choice === '__new';
  const newId = slug(name);
  const clash = isNew && sets.some((s) => s.id === newId);
  const ready = isNew ? !!name.trim() && !clash : true;

  return (
    <div className="scrim" onClick={onCancel}>
      <form
        className="sheet small"
        role="dialog"
        aria-modal="true"
        aria-label="Add icons"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const set = isNew ? { id: newId, name: name.trim(), isNew: true } : { id: choice, name: sets.find((s) => s.id === choice)!.name, isNew: false };
          onAdd(set);
        }}
      >
        <div className="sheet-head">
          <div>
            <h2>
              Add {icons.length} icon{icons.length === 1 ? '' : 's'}
            </h2>
            <p className="meta">
              {icons.filter((i) => i.svgLight).length
                ? `${icons.filter((i) => i.svgLight).length} with dark and light variants`
                : 'Single-variant icons'}
            </p>
          </div>
        </div>
        <ul className="icons preview dark">
          {icons.slice(0, 24).map((i) => (
            <li key={i.name}>
              <span className="tile">
                <img src={svgSrc(i.svg)} alt="" />
                <span>{i.name}</span>
              </span>
            </li>
          ))}
        </ul>
        {icons.length > 24 && <p className="meta pad">and {icons.length - 24} more</p>}
        <div className="sheet-body">
          <label className="field" htmlFor="icon-set">
            <span>Icon set</span>
            <select id="icon-set" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new">New set…</option>
            </select>
          </label>
          {isNew && (
            <label className="field" htmlFor="icon-set-name">
              <span>Name of the new set</span>
              <input
                id="icon-set-name"
                autoFocus
                value={name}
                placeholder="e.g. Glass icons"
                onChange={(e) => setName(e.target.value)}
              />
              {clash && <em className="err">A set with that name exists — choose it above instead.</em>}
            </label>
          )}
          <div className="actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!ready || busy}>
              {busy ? 'Adding…' : 'Add icons'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

