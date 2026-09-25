import { useEffect, useMemo, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { blankDoc } from './docs.ts';
import {
  addFolder,
  fileIn,
  folders as readFolders,
  forget,
  freshId,
  isShipped,
  list,
  mergeFolders,
  removeFolder,
  renameFolder,
  save,
  type Entry,
  type Folders,
} from './library.ts';
import { initStore, setUI, useEditor } from './state.ts';
import type { Doc } from '../src/document.ts';
import { migrateDoc } from '../src/migrate.ts';
import { pickFile } from './pickFile.ts';
import { saveFile } from './save.ts';

/**
 * A library file: every illustration with changes, and the folders. It is
 * how work moves between libraries — out of one browser's local library and
 * into the shared one, say. A single illustration's `.json` imports too.
 */
interface LibraryFile {
  kind: 'illustration-library';
  exportedAt: string;
  docs: Doc[];
  folders?: Folders;
}

const isDoc = (d: unknown): d is Doc =>
  !!d && typeof (d as Doc).id === 'string' && Array.isArray((d as Doc).elements);

/**
 * THE LIBRARY — the page you land on.
 *
 * Every illustration at a glance, in the theme you are working in, with the
 * shipped set and your own saved work in one grid. Thumbnails are the real
 * renderer rather than stored images: there is no export step between saving
 * an illustration and seeing it here, so a thumbnail can never be stale.
 */
/** Which folder the grid shows: every illustration, the unfiled ones, or one folder. */
type View = 'all' | 'unfiled' | string;
const VIEW_KEY = 'illustration-library-view';

export function Library() {
  const theme = useEditor((s) => s.theme);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [folders, setFolders] = useState<Folders>({ folders: [], assign: {} });
  const [busy, setBusy] = useState<string | null>(null);
  // The folder you were in is a per-viewer convenience, so it lives in
  // localStorage — which can be unavailable, hence the guards.
  const [view, setViewState] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) ?? 'all';
    } catch {
      return 'all';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice just will not survive a reload */
    }
  };

  const reload = () => Promise.all([list(), readFolders()]).then(([e, f]) => {
    setEntries(e);
    setFolders(f);
  });
  useEffect(() => { void reload(); }, []);

  // A folder that was deleted elsewhere falls back to All.
  const current: View =
    view === 'all' || view === 'unfiled' || folders.folders.some((f) => f.id === view) ? view : 'all';
  const folderOf = (id: string) => {
    const f = folders.assign[id];
    return f && folders.folders.some((x) => x.id === f) ? f : null;
  };
  const shown = (entries ?? []).filter((e) =>
    current === 'all' ? true : current === 'unfiled' ? !folderOf(e.id) : folderOf(e.id) === current,
  );
  const countIn = (v: View) =>
    (entries ?? []).filter((e) => (v === 'unfiled' ? !folderOf(e.id) : folderOf(e.id) === v)).length;

  const file = async (id: string, folderId: string | null) => {
    await fileIn(id, folderId);
    setFolders(await readFolders());
  };

  const open = (doc: Doc) => {
    initStore(structuredClone(doc));
    setUI({ view: 'editor', selected: null });
  };

  const create = async () => {
    const doc = blankDoc();
    doc.id = freshId('untitled', (entries ?? []).map((e) => e.id));
    // Made inside a folder, it belongs to that folder.
    if (current !== 'all' && current !== 'unfiled') await fileIn(doc.id, current);
    open(doc);
  };

  const duplicate = async (e: Entry) => {
    const copy = structuredClone(e.doc);
    copy.id = freshId(`${e.id}-copy`, (entries ?? []).map((x) => x.id));
    copy.name = `${e.name} copy`;
    setBusy(copy.id);
    await save(copy);
    // A copy stays in the project its original is in.
    const f = folderOf(e.id);
    if (f) await fileIn(copy.id, f);
    await reload();
    setBusy(null);
  };

  const [note, setNote] = useState<string | null>(null);

  const exportAll = async () => {
    const changed = (entries ?? []).filter((e) => e.origin !== 'shipped');
    if (!changed.length) {
      setNote('Nothing to export — no illustration here has changes yet.');
      return;
    }
    const body: LibraryFile = {
      kind: 'illustration-library',
      exportedAt: new Date().toISOString(),
      docs: changed.map((e) => e.doc),
      folders,
    };
    const out = await saveFile('illustration-library.json', JSON.stringify(body, null, 2), 'application/json');
    setNote(
      out.status === 'saved'
        ? `Exported ${changed.length} illustration${changed.length === 1 ? '' : 's'} to illustration-library.json.`
        : out.status === 'error'
          ? `Export failed — ${out.message}`
          : 'Export cancelled.',
    );
  };

  const importFile = async () => {
    const picked = await pickFile('.json,application/json');
    if (!picked) return;
    try {
      const data = JSON.parse(await picked.text()) as unknown;
      const file = data as Partial<LibraryFile>;
      const docs = isDoc(data) ? [data] : Array.isArray(file.docs) ? file.docs.filter(isDoc) : [];
      if (!docs.length) {
        setNote(`${picked.name} has no illustrations in it.`);
        return;
      }
      setBusy('import');
      // Same id replaces: importing is how a library is brought up to date.
      for (const d of docs) await save(migrateDoc(d));
      if (file.folders && Array.isArray(file.folders.folders)) {
        await mergeFolders(file.folders, docs.map((d) => d.id));
      }
      await reload();
      setNote(`Imported ${docs.length} illustration${docs.length === 1 ? '' : 's'} from ${picked.name}.`);
    } catch (err) {
      setNote(`Could not import ${picked.name} — ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const revert = async (e: Entry) => {
    setBusy(e.id);
    await forget(e.id);
    await reload();
    setBusy(null);
  };

  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <h1>Illustration library</h1>
          <p>
            {entries ? `${entries.length} illustrations` : 'Loading…'}
            {entries?.some((e) => e.origin !== 'shipped')
              ? ` · ${entries.filter((e) => e.origin !== 'shipped').length} with your changes`
              : ''}
          </p>
        </div>
        <div className="lib-actions">
          <div className="seg" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={theme === t ? 'on' : ''}
                onClick={() => setUI({ theme: t })}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy === 'import'}
            onClick={() => void importFile()}
            title="Add illustrations from a library file or an illustration's .json"
          >
            {busy === 'import' ? 'Importing…' : 'Import'}
          </button>
          <button
            type="button"
            onClick={() => void exportAll()}
            title="Save every illustration with changes, and the folders, as one file"
          >
            Export
          </button>
          <button type="button" className="primary" onClick={() => void create()}>
            New illustration
          </button>
        </div>
      </header>
      {note && (
        <p className="lib-note" role="status">
          {note}
          <button type="button" className="mini" onClick={() => setNote(null)} aria-label="Dismiss">
            ×
          </button>
        </p>
      )}

      <FolderBar
        folders={folders}
        current={current}
        total={entries?.length ?? 0}
        countIn={countIn}
        onView={setView}
        onFile={(id, f) => void file(id, f)}
        onAdd={async (name) => {
          const f = await addFolder(name);
          setFolders(await readFolders());
          setView(f.id);
        }}
        onRename={async (id, name) => {
          await renameFolder(id, name);
          setFolders(await readFolders());
        }}
        onRemove={async (id) => {
          await removeFolder(id);
          setFolders(await readFolders());
          if (current === id) setView('all');
        }}
      />

      {entries === null ? (
        <p className="lib-empty">Reading the library…</p>
      ) : (
        shown.length === 0 ? (
          <p className="lib-empty">
            {current === 'unfiled'
              ? 'Everything is in a project.'
              : 'Nothing in this project yet — drag illustrations onto its name above, or choose it from a card’s folder menu.'}
          </p>
        ) : (
        <div className="lib-grid">
          {shown.map((e) => (
            <Card
              key={e.id}
              entry={e}
              theme={theme}
              busy={busy === e.id}
              onOpen={() => open(e.doc)}
              onDuplicate={() => void duplicate(e)}
              onRevert={() => void revert(e)}
              folders={folders.folders}
              folder={folderOf(e.id)}
              onFile={(f) => void file(e.id, f)}
            />
          ))}
        </div>
        )
      )}
    </div>
  );
}

/**
 * The project bar: All, Unfiled, then each folder with its count. Click to
 * filter; drop a card on a folder to file it there; double-click a folder to
 * rename it. Removing a folder unfiles its illustrations and deletes none.
 */
function FolderBar({
  folders,
  current,
  total,
  countIn,
  onView,
  onFile,
  onAdd,
  onRename,
  onRemove,
}: {
  folders: Folders;
  current: View;
  total: number;
  countIn: (v: View) => number;
  onView: (v: View) => void;
  onFile: (docId: string, folderId: string | null) => void;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // Dropping a card on All does nothing useful, so only folders and Unfiled
  // take drops.
  const dropProps = (target: string | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(CARD_DRAG)) return;
      e.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(CARD_DRAG);
      setOver(null);
      if (id) onFile(id, target);
    },
  });

  return (
    <nav className="lib-folders" aria-label="Projects">
      <button type="button" className={`lib-folder${current === 'all' ? ' on' : ''}`} onClick={() => onView('all')}>
        All <span>{total}</span>
      </button>
      <button
        type="button"
        className={`lib-folder${current === 'unfiled' ? ' on' : ''}${over === 'unfiled' ? ' over' : ''}`}
        onClick={() => onView('unfiled')}
        {...dropProps(null, 'unfiled')}
      >
        Unfiled <span>{countIn('unfiled')}</span>
      </button>
      {folders.folders.map((f) =>
        renaming === f.id ? (
          <NameInput
            key={f.id}
            initial={f.name}
            onDone={async (name) => {
              if (name) await onRename(f.id, name);
              setRenaming(null);
            }}
          />
        ) : (
          <span
            key={f.id}
            className={`lib-folder project${current === f.id ? ' on' : ''}${over === f.id ? ' over' : ''}`}
            {...dropProps(f.id, f.id)}
          >
            <button
              type="button"
              onClick={() => onView(f.id)}
              onDoubleClick={() => setRenaming(f.id)}
              title="Double-click to rename"
            >
              {f.name} <span>{countIn(f.id)}</span>
            </button>
            <button
              type="button"
              className="lib-folder-x"
              aria-label={`Remove the ${f.name} folder`}
              title="Remove folder — its illustrations become Unfiled"
              onClick={() => {
                if (window.confirm(`Remove the “${f.name}” folder? Its illustrations stay in the library, unfiled.`)) {
                  void onRemove(f.id);
                }
              }}
            >
              ×
            </button>
          </span>
        ),
      )}
      {adding ? (
        <NameInput
          initial=""
          placeholder="Project name"
          onDone={async (name) => {
            if (name) await onAdd(name);
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="lib-folder add" onClick={() => setAdding(true)}>
          + New folder
        </button>
      )}
    </nav>
  );
}

/** A folder name being typed: Enter or clicking away keeps it, Escape drops it. */
function NameInput({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder?: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="lib-folder-input"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label="Folder name"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim() || null);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={() => onDone(value.trim() || null)}
    />
  );
}

/** Drag payload type for a library card, so other drags are ignored. */
const CARD_DRAG = 'application/x-illustration-id';

function Card({
  entry,
  theme,
  busy,
  onOpen,
  onDuplicate,
  onRevert,
  folders,
  folder,
  onFile,
}: {
  entry: Entry;
  theme: 'dark' | 'light';
  busy: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onRevert: () => void;
  folders: { id: string; name: string }[];
  folder: string | null;
  onFile: (folderId: string | null) => void;
}) {
  // Rendering is cheap enough to do here and keeps the thumbnail honest — it
  // is the same call the export makes, so what you see is what you get.
  // The builder already loads the font; embedding it in every card is waste.
  const svg = useMemo(() => renderDocument(entry.doc, theme, { embedFont: false }), [entry.doc, theme]);
  const count = useMemo(() => countElements(entry.doc), [entry.doc]);

  return (
    <figure
      className={`lib-card${busy ? ' busy' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CARD_DRAG, entry.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button type="button" className="lib-thumb" onClick={onOpen} aria-label={`Edit ${entry.name}`}>
        <span className="lib-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
      <figcaption>
        <div className="lib-meta">
          <b title={entry.name}>{entry.name}</b>
          {entry.origin !== 'shipped' && (
            <span className={`lib-tag ${entry.origin}`}>
              {entry.origin === 'edited' ? 'edited' : 'new'}
            </span>
          )}
        </div>
        <div className="lib-sub">
          <code>{count} elements</code>
          {entry.updatedAt ? <code>{when(entry.updatedAt)}</code> : null}
          {folders.length > 0 && (
            <select
              className="lib-card-folder"
              aria-label={`Folder for ${entry.name}`}
              value={folder ?? ''}
              onChange={(e) => onFile(e.target.value || null)}
            >
              <option value="">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="lib-row">
          <button type="button" onClick={onOpen}>Edit</button>
          <button type="button" onClick={onDuplicate}>Duplicate</button>
          {entry.origin !== 'shipped' && (
            <button
              type="button"
              className="danger"
              onClick={onRevert}
              title={
                isShipped(entry.id)
                  ? 'Discard your changes and go back to the shipped version'
                  : 'Delete this illustration from the library'
              }
            >
              {isShipped(entry.id) ? 'Revert' : 'Delete'}
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

function countElements(doc: Doc): number {
  const walk = (els: { children?: unknown[] }[]): number =>
    els.reduce((n, e) => n + 1 + walk((e.children ?? []) as { children?: unknown[] }[]), 0);
  return walk(doc.elements as unknown as { children?: unknown[] }[]);
}

function when(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
