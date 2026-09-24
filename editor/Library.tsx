import { useEffect, useMemo, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { blankDoc } from './docs.ts';
import { forget, freshId, isShipped, list, save, type Entry } from './library.ts';
import { initStore, setUI, useEditor } from './state.ts';
import type { Doc } from '../src/document.ts';

/**
 * THE LIBRARY — the page you land on.
 *
 * Every illustration at a glance, in the theme you are working in, with the
 * shipped set and your own saved work in one grid. Thumbnails are the real
 * renderer rather than stored images: there is no export step between saving
 * an illustration and seeing it here, so a thumbnail can never be stale.
 */
export function Library() {
  const theme = useEditor((s) => s.theme);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => list().then(setEntries);
  useEffect(() => { void reload(); }, []);

  const open = (doc: Doc) => {
    initStore(structuredClone(doc));
    setUI({ view: 'editor', selected: null });
  };

  const create = () => {
    const doc = blankDoc();
    doc.id = freshId('untitled', (entries ?? []).map((e) => e.id));
    open(doc);
  };

  const duplicate = async (e: Entry) => {
    const copy = structuredClone(e.doc);
    copy.id = freshId(`${e.id}-copy`, (entries ?? []).map((x) => x.id));
    copy.name = `${e.name} copy`;
    setBusy(copy.id);
    await save(copy);
    await reload();
    setBusy(null);
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
          <button type="button" className="primary" onClick={create}>
            New illustration
          </button>
        </div>
      </header>

      {entries === null ? (
        <p className="lib-empty">Reading the library…</p>
      ) : (
        <div className="lib-grid">
          {entries.map((e) => (
            <Card
              key={e.id}
              entry={e}
              theme={theme}
              busy={busy === e.id}
              onOpen={() => open(e.doc)}
              onDuplicate={() => void duplicate(e)}
              onRevert={() => void revert(e)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  entry,
  theme,
  busy,
  onOpen,
  onDuplicate,
  onRevert,
}: {
  entry: Entry;
  theme: 'dark' | 'light';
  busy: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onRevert: () => void;
}) {
  // Rendering is cheap enough to do here and keeps the thumbnail honest — it
  // is the same call the export makes, so what you see is what you get.
  // The builder already loads the font; embedding it in every card is waste.
  const svg = useMemo(() => renderDocument(entry.doc, theme, { embedFont: false }), [entry.doc, theme]);
  const count = useMemo(() => countElements(entry.doc), [entry.doc]);

  return (
    <figure className={`lib-card${busy ? ' busy' : ''}`}>
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
