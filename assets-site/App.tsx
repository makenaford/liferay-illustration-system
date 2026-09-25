import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { copyText, saveFile } from '../editor/save.ts';
import { svgToPng } from '../editor/png.ts';
import { App as BuilderApp } from '../editor/App.tsx';
import { blankDoc } from '../editor/docs.ts';
import { initStore, setUI, useEditor } from '../editor/state.ts';
import { addFolder, fileIn, freshId, removeFolder, renameFolder } from '../editor/library.ts';
import type { Doc, GraphicArt } from '../src/document.ts';
import { GRAPHICS } from '../src/graphics.generated.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';
import {
  canWrite,
  iconParts,
  MAX_DOC_BYTES,
  names as namesOf,
  store,
  viewerId,
  type Folders,
  type GraphicRow,
  type IconRow,
  type IconSetRow,
  type IllustrationRow,
  type Library,
  type Store,
} from './store.ts';
import { parseFiles, slug, svgSrc, type ParsedIcon } from './uploads.ts';
import { GlassIconBuilder } from './GlassIconBuilder.tsx';

type Theme = 'dark' | 'light';
type Tab = 'illustrations' | 'icons' | 'graphics' | 'tools';
/** Every asset, the unfiled ones, or one folder's. */
type Place = 'all' | 'unfiled' | string;

/** The standalone builder, whose own library is for drafts. */
const BUILDER_URL = 'https://claude.ai/artifact/99HVZBUZbx9K3iG8dJStgd';
const PLACE_KEY = 'marketing-assets-folder';

/** "Sep 25" this year, "Sep 25, 2025" before it. */
function when(ms: number) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function App() {
  const [st, setSt] = useState<Store | null>(null);
  const [lib, setLib] = useState<Library>({ illustrations: [], sets: [], graphics: [], folders: { folders: [], assign: {} }, ready: false });
  const [writable, setWritable] = useState(true);
  const [tab, setTab] = useState<Tab>(() =>
    location.hash === '#icons'
      ? 'icons'
      : location.hash === '#graphics'
        ? 'graphics'
        : location.hash === '#tools'
          ? 'tools'
          : 'illustrations',
  );
  // The folder you were in is a per-viewer convenience, so it lives in
  // localStorage — which can be unavailable, hence the guards.
  const [place, setPlaceState] = useState<Place>(() => {
    try {
      return localStorage.getItem(PLACE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });
  const setPlace = (p: Place) => {
    setPlaceState(p);
    try {
      localStorage.setItem(PLACE_KEY, p);
    } catch {
      /* a convenience only */
    }
  };
  /** Whether the builder is open, in place of the library. */
  const [building, setBuilding] = useState(false);
  /** Whether the Glass Icon Builder is open, in place of the library. */
  const [glassing, setGlassing] = useState(false);
  const builderView = useEditor((s) => s.view);
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
      [...lib.illustrations.map((i) => i.updatedBy), ...lib.sets.map((s) => s.createdBy)].filter(
        (x): x is string => !!x,
      ),
    ),
  ].join(',');
  useEffect(() => {
    if (uploaderIds) void namesOf(uploaderIds.split(',')).then(setPeople);
  }, [uploaderIds]);
  const who = (id?: string) => (id ? people[id] || 'A teammate' : null);

  // A folder deleted elsewhere falls back to everything.
  const known = new Set(lib.folders.folders.map((f) => f.id));
  const current: Place = place === 'all' || place === 'unfiled' || known.has(place) ? place : 'all';
  const folderOf = (key: string) => {
    const f = lib.folders.assign[key];
    return f && known.has(f) ? f : null;
  };
  const inPlace = (key: string) =>
    current === 'all' ? true : current === 'unfiled' ? !folderOf(key) : folderOf(key) === current;

  const needle = query.trim().toLowerCase();
  const illustrations = useMemo(
    () =>
      [...lib.illustrations]
        .filter((i) => inPlace(i.id) && (!needle || i.name.toLowerCase().includes(needle)))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.illustrations, lib.folders, current, needle],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.sets, lib.folders, current, needle],
  );
  /** Put something in a folder, or take it out with null. */
  const file = async (key: string, folderId: string | null) => {
    try {
      await fileIn(key, folderId);
      st?.refresh();
    } catch (e) {
      setToast(`Could not move it — ${(e as Error).message}`);
    }
  };
  const here = current !== 'all' && current !== 'unfiled' ? current : null;

  /** Open an illustration in the builder, from the library's own version. */
  const edit = (row: { doc: Doc; updatedAt: number }) => {
    initStore(structuredClone(row.doc), row.updatedAt);
    setUI({ view: 'editor', selected: null });
    setOpen(null);
    setBuilding(true);
  };
  const create = async () => {
    const doc = blankDoc();
    doc.id = freshId('untitled', lib.illustrations.map((i) => i.id));
    // Made inside a folder, it belongs to that folder once it is saved.
    if (here) await file(doc.id, here);
    edit({ doc, updatedAt: 0 });
  };
  // The builder's own "‹ Library" button comes back here.
  useEffect(() => {
    if (building && builderView === 'library') {
      setBuilding(false);
      st?.refresh();
    }
  }, [building, builderView, st]);
  const iconCount = lib.sets.reduce((n, s) => n + s.icons.length, 0);

  /** Built-in graphics first, then the team's, as one list. */
  const allGraphics: GraphicItem[] = useMemo(
    () => [
      ...Object.entries(GRAPHICS).map(([key, g]) => ({ id: key, name: g.label, dark: g.dark, light: g.light, builtIn: true })),
      ...lib.graphics.map((g) => ({ ...g, builtIn: false })),
    ],
    [lib.graphics],
  );
  const graphics = useMemo(
    () =>
      allGraphics
        .filter((g) => !needle || g.name.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGraphics, lib.folders, current, needle],
  );

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
      let added = 0;
      let replaced = 0;
      for (const doc of parsed.illustrations) {
        const had = lib.illustrations.some((i) => i.id === doc.id);
        await st.putIllustration(doc);
        // Added inside a folder, a new illustration lands in it.
        if (!had && here) await fileIn(doc.id, here);
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

  const addIcons = async (
    icons: ParsedIcon[],
    set: { id: string; name: string; isNew: boolean },
    /** One category for all of them; otherwise each takes its file name's. */
    category?: string,
  ) => {
    if (!st) return;
    setBusy(true);
    try {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      if (set.isNew) {
        await st.putSet({ id: set.id, name: set.name, createdAt: now, createdBy: by });
      }
      const existing = lib.sets.find((s) => s.id === set.id)?.icons ?? [];
      // "Business - Costly" in a file name is category and name.
      const place = (icon: ParsedIcon) => {
        const parts = iconParts({ name: icon.name });
        const fromFile = parts.category !== 'Uncategorized';
        return { category: category || (fromFile ? parts.category : undefined), name: fromFile ? parts.name : icon.name };
      };
      const idOf = (icon: ParsedIcon) => {
        const pl = place(icon);
        return slug(`${pl.category ?? ''} ${pl.name}`);
      };
      for (const icon of icons) {
        const pl = place(icon);
        await st.putIcon(set.id, {
          id: idOf(icon),
          name: pl.name,
          ...(pl.category ? { category: pl.category } : {}),
          svg: icon.svg,
          ...(icon.svgLight ? { svgLight: icon.svgLight } : {}),
          uploadedAt: now,
          uploadedBy: by,
        });
      }
      const replaced = icons.filter((i) => existing.some((e) => e.id === idOf(i))).length;
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

  /** Uploaded SVGs as graphics, made portable on the way in. */
  const addGraphics = async (items: ParsedIcon[]) => {
    if (!st) return;
    setBusy(true);
    try {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      const taken = new Set(allGraphics.filter((g) => g.builtIn).map((g) => g.id));
      const skipped: string[] = [];
      let added = 0;
      for (const item of items) {
        let id = slug(item.name);
        if (taken.has(id)) id = `${id}-2`;
        const opts = { anyBlurredGroup: true, backdropSlot: true };
        const dark = normaliseFigmaSvg(item.svg, `g-${id}-d-`, undefined, opts);
        const light = normaliseFigmaSvg(item.svgLight ?? item.svg, `g-${id}-l-`, undefined, opts);
        const row: GraphicRow = { id, name: item.name, dark, light, uploadedAt: now, uploadedBy: by };
        if (JSON.stringify(row).length > MAX_DOC_BYTES) {
          skipped.push(`${item.name} (over 250 KB)`);
          continue;
        }
        await st.putGraphic(row);
        added++;
      }
      setToast(
        `Added ${added} graphic${added === 1 ? '' : 's'} — the builder offers ${added === 1 ? 'it' : 'them'} under Graphics.` +
          (skipped.length ? ` Skipped ${skipped.join(', ')}.` : ''),
      );
      setPendingIcons(null);
      setTab('graphics');
      st.refresh();
    } catch (e) {
      setToast(`Could not add the graphics — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const openRow = lib.illustrations.find((i) => i.id === open) ?? null;

  // The builder, in place of the library, until its "‹ Library" button.
  if (building && builderView === 'editor') return <BuilderApp />;
  if (glassing) {
    return (
      <div className="am-root">
        <div className="am-page">
          <GlassIconBuilder
            sets={lib.sets}
            writable={writable}
            store={st}
            onToast={setToast}
            onClose={(saved) => {
              setGlassing(false);
              if (saved) setTab('icons');
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="am-root">
    <div
      className="am-page"
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
      <header className="am-top">
        <div className="am-brand">
          <span className="am-mark" aria-hidden />
          <div>
            <h1>Marketing Assets</h1>
            <p className="am-sub">
              {lib.ready
                ? `${lib.illustrations.length} illustration${lib.illustrations.length === 1 ? '' : 's'} · ${iconCount} icon${iconCount === 1 ? '' : 's'} in ${lib.sets.length} set${lib.sets.length === 1 ? '' : 's'}`
                : 'Loading the library…'}
            </p>
          </div>
        </div>
        <div className="am-tools">
          <label className="am-search">
            <span className="am-sr">Search assets</span>
            <input
              id="search"
              type="search"
              placeholder="Search by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="am-seg" role="group" aria-label="Artwork theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" className={art === t ? 'am-on' : ''} onClick={() => setArt(t)}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          {writable && (
            <button type="button" className="am-primary" disabled={busy} onClick={() => pickRef.current?.click()}>
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

      <nav className="am-tabs" aria-label="Asset type">
        <button type="button" className={tab === 'illustrations' ? 'am-on' : ''} onClick={() => setTab('illustrations')}>
          Illustrations <span className="am-count">{lib.illustrations.length}</span>
        </button>
        <button type="button" className={tab === 'icons' ? 'am-on' : ''} onClick={() => setTab('icons')}>
          Icon sets <span className="am-count">{iconCount}</span>
        </button>
        <button type="button" className={tab === 'graphics' ? 'am-on' : ''} onClick={() => setTab('graphics')}>
          Graphics <span className="am-count">{allGraphics.length}</span>
        </button>
        <button type="button" className={tab === 'tools' ? 'am-on' : ''} onClick={() => setTab('tools')}>
          Tools
        </button>
      </nav>

      {/* Folders are for illustrations; icons are organised by category. */}
      {tab === 'illustrations' && (
        <FolderBar
          folders={lib.folders}
          current={current}
          counts={(v) =>
            lib.illustrations.filter((i) => (v === 'unfiled' ? !folderOf(i.id) : folderOf(i.id) === v)).length
          }
          writable={writable}
          onPick={setPlace}
          onDropItem={(key, folderId) => void file(key, folderId)}
          onToast={setToast}
          onChanged={() => st?.refresh()}
        />
      )}

      {toast && (
        <p className="am-toast" role="status">
          {toast}
          <button type="button" className="am-x" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </p>
      )}

      <main>
        {tab === 'illustrations' ? (
          illustrations.length ? (
            <div className="am-grid">
              {illustrations.map((row) => (
                <IllustrationCard
                  key={row.id}
                  row={row}
                  theme={art}
                  by={who(row.updatedBy)}
                  onOpen={() => setOpen(row.id)}
                  onEdit={writable ? () => edit(row) : undefined}
                />
              ))}
            </div>
          ) : (
            <Empty
              ready={lib.ready}
              searching={!!needle}
              title="No illustrations yet"
              body={
                <>
                  {current === 'all' ? '' : 'Nothing in this folder yet. '}
                  Start one with{' '}
                  <button type="button" className="am-linkish" onClick={() => void create()}>
                    New illustration
                  </button>{' '}
                  — it opens the builder, and saving puts it here — or drop a builder <b>.json</b> on the page.
                </>
              }
            />
          )
        ) : tab === 'tools' ? (
          <Tools writable={writable} onNew={() => void create()} onGlass={() => setGlassing(true)} />
        ) : tab === 'graphics' ? (
          graphics.length ? (
            <GraphicsGrid
              items={graphics}
              theme={art}
              writable={writable}
              store={st}
              onToast={setToast}
            />
          ) : (
            <Empty
              ready={lib.ready}
              searching={!!needle}
              title="No graphics in this folder"
              body={<>Drop <b>.svg</b> files here and choose Graphics. “… - Dark” and “… - Light” pair into one graphic.</>}
            />
          )
        ) : sets.length ? (
          <div className="am-sets">
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
        <div className="am-drop" aria-hidden>
          <p>Drop to add — builder .json files and .svg icons</p>
        </div>
      )}

      {openRow && (
        <IllustrationDetail
          row={openRow}
          initialTheme={art}
          by={who(openRow.updatedBy)}
          folders={lib.folders}
          folder={folderOf(openRow.id)}
          onFile={(f) => void file(openRow.id, f)}
          onEdit={() => edit(openRow)}
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
          preferGraphics={tab === 'graphics'}
          onCancel={() => setPendingIcons(null)}
          onAdd={(set, category) => void addIcons(pendingIcons, set, category)}
          onAddGraphics={() => void addGraphics(pendingIcons)}
        />
      )}
    </div>
    </div>
  );
}

function Empty({ ready, searching, title, body }: { ready: boolean; searching: boolean; title: string; body: React.ReactNode }) {
  if (!ready) return <p className="am-empty">Loading…</p>;
  if (searching) return <p className="am-empty">Nothing matches that search.</p>;
  return (
    <div className="am-empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

/** A set's icons in category order, each category's icons by name. */
function byCategory(icons: IconRow[]): [string, IconRow[]][] {
  const groups = new Map<string, IconRow[]>();
  for (const icon of icons) {
    const c = iconParts(icon).category;
    groups.set(c, [...(groups.get(c) ?? []), icon]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)))
    .map(([c, list]) => [c, list.sort((x, y) => iconParts(x).name.localeCompare(iconParts(y).name))]);
}

/** Drag payload for filing a card or set into a folder. */
const DRAG = 'application/x-marketing-asset';

function IllustrationCard({
  row,
  theme,
  by,
  onOpen,
  onEdit,
}: {
  row: IllustrationRow;
  theme: Theme;
  by: string | null;
  onOpen: () => void;
  /** Absent for viewers who cannot save. */
  onEdit?: () => void;
}) {
  const svg = useMemo(() => renderDocument(row.doc, theme, { embedFont: false }), [row.doc, theme]);
  const { width, height } = row.doc.canvas;
  return (
    <figure
      className="am-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, row.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button type="button" className="am-thumb" onClick={onOpen} aria-label={`Open ${row.name}`} style={{ aspectRatio: `${width} / ${height}` }}>
        <span className="am-art" dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
      <figcaption>
        <b title={row.name}>{row.name}</b>
        <span className="am-meta">
          {width} × {height}
          {row.updatedAt ? ` · ${when(row.updatedAt)}` : ''}
          {by ? ` · ${by}` : ''}
        </span>
        <div className="am-card-row">
          <button type="button" onClick={onOpen}>
            Details
          </button>
          {onEdit && (
            <button type="button" className="am-primary" onClick={onEdit}>
              Edit in builder
            </button>
          )}
        </div>
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
  folders,
  folder,
  onFile,
  onEdit,
  writable,
  store: st,
  onToast,
  onClose,
}: {
  row: IllustrationRow;
  initialTheme: Theme;
  by: string | null;
  folders: Folders;
  folder: string | null;
  onFile: (folderId: string | null) => void;
  onEdit: () => void;
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
    <div className="am-scrim" onClick={onClose}>
      <div className="am-sheet" role="dialog" aria-modal="true" aria-label={row.name} onClick={(e) => e.stopPropagation()}>
        <div className="am-sheet-head">
          <div>
            <h2>{row.name}</h2>
            <p className="am-meta">
              {width} × {height}
              {row.updatedAt ? ` · saved ${when(row.updatedAt)}` : ''}
              {by ? ` by ${by}` : ''}
            </p>
          </div>
          {writable && (
            <button type="button" className="am-primary" onClick={onEdit}>
              Edit in builder
            </button>
          )}
          <button type="button" className="am-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="am-stage" style={{ aspectRatio: `${width} / ${height}` }}>
          <span className="am-art" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>

        <div className="am-sheet-body">
          <div className="am-sheet-controls">
          <div className="am-seg" role="group" aria-label="Preview theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" className={theme === t ? 'am-on' : ''} onClick={() => setTheme(t)}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          {writable && folders.folders.length > 0 && (
            <FolderSelect id={`folder-${row.id}`} folders={folders} value={folder} onChange={onFile} />
          )}
          </div>

          <div className="am-downloads">
            <h3>Download</h3>
            <div className="am-dl-grid">
              <span className="am-dl-label">Dark</span>
              <button type="button" onClick={() => void offer(`${row.id}.dark.svg`, svgFor('dark'), 'image/svg+xml', onToast)}>SVG</button>
              <button type="button" onClick={() => void png('dark')}>PNG @2x</button>
              <span className="am-dl-label">Light</span>
              <button type="button" onClick={() => void offer(`${row.id}.light.svg`, svgFor('light'), 'image/svg+xml', onToast)}>SVG</button>
              <button type="button" onClick={() => void png('light')}>PNG @2x</button>
            </div>
            <div className="am-dl-row">
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
            <p className="am-hint">
              <b>Edit in builder</b> opens this illustration in the builder; saving there updates it here for
              everyone. The builder file opens in any copy of the builder.
            </p>
          </div>

          {writable && (
            <button
              type="button"
              className={`am-danger${confirming ? ' am-confirming' : ''}`}
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
    <section
      className="am-set"
    >
      <div className="am-set-head">
        <h2>{set.name}</h2>
        <span className="am-meta">
          {set.icons.length} icon{set.icons.length === 1 ? '' : 's'}
          {by ? ` · started by ${by}` : ''}
        </span>
        {writable && (
          <button
            type="button"
            className={`am-danger am-mini${confirming ? ' am-confirming' : ''}`}
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
      {byCategory(set.icons).map(([category, icons]) => (
        <div key={category} className="am-category">
          <h3>
            {category} <span className="am-count">{icons.length}</span>
          </h3>
          <ul className={`am-icons ${theme}`}>
            {icons.map((icon) => (
              <li key={icon.id}>
                <button
                  type="button"
                  className={picked?.id === icon.id ? 'am-on' : ''}
                  onClick={() => setPicked(picked?.id === icon.id ? null : icon)}
                  title={`${category} · ${iconParts(icon).name}`}
                >
                  <img src={svgSrc(variant(icon))} alt="" loading="lazy" />
                  <span>{iconParts(icon).name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {picked && (
        <div className="am-icon-bar" role="region" aria-label={picked.name}>
          <b>{iconParts(picked).name}</b>
          <span className="am-meta">
            {iconParts(picked).category} · {picked.svgLight ? 'dark and light variants' : 'one variant'}
          </span>
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
              className="am-danger"
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
  preferGraphics,
  onCancel,
  onAdd,
  onAddGraphics,
}: {
  icons: ParsedIcon[];
  sets: IconSetRow[];
  busy: boolean;
  /** Start on Graphics — the SVGs were dropped while looking at graphics. */
  preferGraphics: boolean;
  onCancel: () => void;
  onAdd: (set: { id: string; name: string; isNew: boolean }, category?: string) => void;
  onAddGraphics: () => void;
}) {
  const [choice, setChoice] = useState<string>(preferGraphics ? '__graphics' : sets[0]?.id ?? '__new');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const toGraphics = choice === '__graphics';
  const fileCategories = [...new Set(icons.map((i) => iconParts({ name: i.name }).category))].filter(
    (c) => c !== 'Uncategorized',
  );
  const setCategories = [
    ...new Set((sets.find((s) => s.id === choice)?.icons ?? []).map((i) => iconParts(i).category)),
  ].sort();
  const isNew = choice === '__new';
  const newId = slug(name);
  const clash = isNew && sets.some((s) => s.id === newId);
  const ready = isNew ? !!name.trim() && !clash : true;

  return (
    <div className="am-scrim" onClick={onCancel}>
      <form
        className="am-sheet am-small"
        role="dialog"
        aria-modal="true"
        aria-label="Add icons"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          if (toGraphics) {
            onAddGraphics();
            return;
          }
          const set = isNew ? { id: newId, name: name.trim(), isNew: true } : { id: choice, name: sets.find((s) => s.id === choice)!.name, isNew: false };
          onAdd(set, category.trim() || undefined);
        }}
      >
        <div className="am-sheet-head">
          <div>
            <h2>
              Add {icons.length} SVG{icons.length === 1 ? '' : 's'}
            </h2>
            <p className="am-meta">
              {icons.filter((i) => i.svgLight).length
                ? `${icons.filter((i) => i.svgLight).length} with dark and light variants`
                : 'Single-variant icons'}
            </p>
          </div>
        </div>
        <ul className="am-icons am-preview dark">
          {icons.slice(0, 24).map((i) => (
            <li key={i.name}>
              <span className="am-tile">
                <img src={svgSrc(i.svg)} alt="" />
                <span>{i.name}</span>
              </span>
            </li>
          ))}
        </ul>
        {icons.length > 24 && <p className="am-meta am-pad">and {icons.length - 24} more</p>}
        <div className="am-sheet-body">
          <label className="am-field" htmlFor="icon-set">
            <span>Add to</span>
            <select id="icon-set" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="__graphics">Graphics — larger artwork the builder places whole</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new">New icon set…</option>
            </select>
          </label>
          {isNew && (
            <label className="am-field" htmlFor="icon-set-name">
              <span>Name of the new set</span>
              <input
                id="icon-set-name"
                autoFocus
                value={name}
                placeholder="e.g. Glass icons"
                onChange={(e) => setName(e.target.value)}
              />
              {clash && <em className="am-err">A set with that name exists — choose it above instead.</em>}
            </label>
          )}
          {!toGraphics && (
            <label className="am-field" htmlFor="icon-category">
              <span>Category</span>
              <input
                id="icon-category"
                list="icon-categories"
                value={category}
                placeholder={
                  fileCategories.length
                    ? `From the file names — ${fileCategories.slice(0, 3).join(', ')}${fileCategories.length > 3 ? '…' : ''}`
                    : 'e.g. Business'
                }
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="icon-categories">
                {setCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          )}
          <div className="am-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="am-primary" disabled={!ready || busy}>
              {busy ? 'Adding…' : toGraphics ? 'Add graphics' : 'Add icons'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}


function FolderSelect({
  id,
  folders,
  value,
  onChange,
}: {
  id: string;
  folders: Folders;
  value: string | null;
  onChange: (folderId: string | null) => void;
}) {
  return (
    <label className="am-folder-select" htmlFor={id}>
      <span className="am-sr">Folder</span>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Unfiled</option>
        {folders.folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * FOLDERS — projects to file assets under. Illustrations and icon sets share
 * them. Deleting a folder unfiles what was in it; it never deletes an asset.
 */
function FolderBar({
  folders,
  current,
  counts,
  writable,
  onPick,
  onDropItem,
  onToast,
  onChanged,
}: {
  folders: Folders;
  current: Place;
  counts: (v: Place) => number;
  writable: boolean;
  onPick: (p: Place) => void;
  onDropItem: (key: string, folderId: string | null) => void;
  onToast: (s: string) => void;
  onChanged: () => void;
}) {
  const [naming, setNaming] = useState<null | 'new' | string>(null);
  const [draft, setDraft] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const selected = folders.folders.find((f) => f.id === current) ?? null;

  const commit = async () => {
    const name = draft.trim();
    setNaming(null);
    if (!name) return;
    try {
      if (naming === 'new') {
        const f = await addFolder(name);
        onPick(f.id);
      } else if (naming) {
        await renameFolder(naming, name);
      }
      onChanged();
    } catch (e) {
      onToast(`Could not save the folder — ${(e as Error).message}`);
    }
  };

  const target = (id: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!writable || ![...e.dataTransfer.types].includes(DRAG)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(id ?? 'unfiled');
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      const key = e.dataTransfer.getData(DRAG);
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      onDropItem(key, id);
    },
  });

  const chip = (id: Place, label: string, dropId: string | null | undefined) => (
    <button
      key={id}
      type="button"
      className={`am-chip${current === id ? ' am-on' : ''}${over === (dropId === null ? 'unfiled' : dropId) ? ' am-over' : ''}`}
      onClick={() => onPick(id)}
      {...(dropId !== undefined ? target(dropId) : {})}
    >
      {label} <span className="am-count">{id === 'all' ? '' : counts(id)}</span>
    </button>
  );

  return (
    <div className="am-folders" aria-label="Folders">
      {chip('all', 'All', undefined)}
      {chip('unfiled', 'Unfiled', null)}
      {folders.folders.map((f) =>
        naming === f.id ? (
          <input
            key={f.id}
            id={`rename-${f.id}`}
            className="am-chip-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') setNaming(null);
            }}
          />
        ) : (
          chip(f.id, f.name, f.id)
        ),
      )}
      {writable &&
        (naming === 'new' ? (
          <input
            id="new-folder"
            className="am-chip-input"
            autoFocus
            placeholder="Folder name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') setNaming(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="am-chip am-ghost"
            onClick={() => {
              setDraft('');
              setNaming('new');
            }}
          >
            + New folder
          </button>
        ))}
      {writable && selected && (
        <span className="am-folder-actions">
          <button
            type="button"
            className="am-mini"
            onClick={() => {
              setDraft(selected.name);
              setNaming(selected.id);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className={`am-mini am-danger${confirming ? ' am-confirming' : ''}`}
            onClick={async () => {
              if (!confirming) {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 4000);
                return;
              }
              setConfirming(false);
              try {
                await removeFolder(selected.id);
                onPick('all');
                onChanged();
                onToast(`Deleted the ${selected.name} folder. What was in it is now Unfiled.`);
              } catch (e) {
                onToast(`Could not delete the folder — ${(e as Error).message}`);
              }
            }}
          >
            {confirming ? 'Click again — assets stay, unfiled' : 'Delete folder'}
          </button>
        </span>
      )}
      {writable && folders.folders.length > 0 && <span className="am-folder-tip">Drag an illustration onto a folder to file it.</span>}
    </div>
  );
}

/** TOOLS — what the team makes assets with. */
function Tools({ writable, onNew, onGlass }: { writable: boolean; onNew: () => void; onGlass: () => void }) {
  return (
    <div className="am-tools-grid">
      <article className="am-tool">
        <div className="am-tool-mark am-tool-mark-glass" aria-hidden />
        <div className="am-tool-body">
          <h2>Glass Icon Builder</h2>
          <p>
            Turn any of MingCute’s 1,600 icons into a glass icon in the set’s own style — a gradient shape behind
            frosted glass — in dark and light, on the same 64px grid as the rest, so every icon comes out evenly
            sized. Add it to the library by category, and the builder offers it as a Glass icon.
          </p>
          <div className="am-tool-actions">
            <button type="button" className="am-primary" onClick={onGlass}>
              Open Glass Icon Builder
            </button>
          </div>
        </div>
      </article>
      <article className="am-tool">
        <div className="am-tool-mark" aria-hidden />
        <div className="am-tool-body">
          <h2>Illustration Builder</h2>
          <p>
            Compose marketing illustrations from the Liferay component library — glass panels, charts, badges,
            chat bubbles, glass icons — in dark and light from one document. It opens right here: saving an
            illustration puts it in this library for everyone, and <b>Edit in builder</b> on any illustration
            opens it again.
          </p>
          <div className="am-tool-actions">
            {writable ? (
              <button type="button" className="am-primary" onClick={onNew}>
                New illustration
              </button>
            ) : (
              <span className="am-meta">Making illustrations needs Contributor access to this page.</span>
            )}
            <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer">
              Standalone builder for drafts ↗
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}

interface GraphicItem {
  id: string;
  name: string;
  dark: GraphicArt;
  light: GraphicArt;
  builtIn: boolean;
}

/** A graphic as a standalone SVG document, portable glass and all. */
function graphicSvg(g: GraphicItem, theme: Theme): string {
  const art = theme === 'light' ? g.light : g.dark;
  const [, , w, h] = art.viewBox;
  const body = art.body.replaceAll('__NS__', `${g.id}-${theme}-`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${art.viewBox.join(' ')}" fill="none">${body}</svg>`;
}

/** GRAPHICS — larger glass artwork; the builder offers every one of these. */
function GraphicsGrid({
  items,
  theme,
  writable,
  store: st,
  onToast,
}: {
  items: GraphicItem[];
  theme: Theme;
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sel = items.find((g) => g.id === picked) ?? null;
  const png = async (g: GraphicItem, t: Theme) => {
    const [, , w, h] = (t === 'light' ? g.light : g.dark).viewBox;
    try {
      await offer(`${slug(g.name)}-${t}@2x.png`, await svgToPng(graphicSvg(g, t), w, h, 2), 'image/png', onToast);
    } catch (e) {
      onToast(`Could not make the PNG — ${(e as Error).message}`);
    }
  };
  return (
    <div className="am-graphics">
      <ul className={`am-graphic-grid ${theme}`}>
        {items.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className={picked === g.id ? 'am-on' : ''}
              onClick={() => setPicked(picked === g.id ? null : g.id)}
            >
              <img src={svgSrc(graphicSvg(g, theme))} alt="" loading="lazy" />
              <span className="am-graphic-name">{g.name}</span>
              {g.builtIn && <span className="am-badge">Built in</span>}
            </button>
          </li>
        ))}
      </ul>
      {sel && (
        <div className="am-icon-bar" role="region" aria-label={sel.name}>
          <b>{sel.name}</b>
          <span className="am-meta">{sel.builtIn ? 'Ships with the builder' : 'In the builder under Graphics'}</span>
          <button type="button" onClick={() => void offer(`${slug(sel.name)}-dark.svg`, graphicSvg(sel, 'dark'), 'image/svg+xml', onToast)}>
            Dark SVG
          </button>
          <button type="button" onClick={() => void offer(`${slug(sel.name)}-light.svg`, graphicSvg(sel, 'light'), 'image/svg+xml', onToast)}>
            Light SVG
          </button>
          <button type="button" onClick={() => void png(sel, theme)}>
            PNG @2x
          </button>
          <button
            type="button"
            onClick={() => void copyText(graphicSvg(sel, theme)).then((ok) => onToast(ok ? `Copied ${sel.name}.` : 'Could not reach the clipboard.'))}
          >
            Copy SVG
          </button>
          {writable && !sel.builtIn && (
            <button
              type="button"
              className={`am-danger${confirming ? ' am-confirming' : ''}`}
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  setTimeout(() => setConfirming(false), 4000);
                  return;
                }
                setConfirming(false);
                try {
                  await st?.deleteGraphic(sel.id);
                  onToast(`Removed ${sel.name}. Illustrations already using it keep their copy.`);
                  setPicked(null);
                } catch (e) {
                  onToast(`Could not remove it — ${(e as Error).message}`);
                }
              }}
            >
              {confirming ? 'Click again to remove' : 'Remove'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
