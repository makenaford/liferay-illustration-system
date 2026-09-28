import { useEffect, useState } from 'react';

/**
 * BROWSE — the one way the library is looked through, the same for
 * illustrations and icons: a sidebar that says where you are, and a toolbar
 * over the grid that searches, sorts and sets the preview.
 *
 * Filtering and managing are kept apart. The sidebar's rows only choose
 * where to look; a folder's rename and delete wait behind its "⋯", and New
 * folder sits at the end of its section. Anything draggable is filed by
 * dropping it on a row.
 */

export interface NavItem {
  /** Unique across the sidebar; what `current` and `onPick` speak in. */
  key: string;
  label: string;
  count?: number;
  /** Indented under its section's heading row. */
  nested?: boolean;
  /** Set apart at the end of its section — Unfiled. */
  quiet?: boolean;
  /** Whether a drag over the row may drop here, by its payload types. */
  accepts?: (types: readonly string[]) => boolean;
  onDrop?: (data: DataTransfer) => void;
  /** Offered behind the row's ⋯. */
  onRename?: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** What the folder holds, one and many — named when deleting a folder that isn't empty. */
  holds?: [string, string];
}

export interface NavSection {
  key: string;
  /** A heading row. With `headingKey`, it can be picked too — a whole icon set. */
  title?: string;
  headingKey?: string;
  headingCount?: number;
  items: NavItem[];
  /** Adds a folder to this section. */
  onCreate?: (name: string) => Promise<void>;
}

export function Sidebar({
  label,
  sections,
  current,
  onPick,
  writable,
  onToast,
}: {
  label: string;
  sections: NavSection[];
  current: string;
  onPick: (key: string) => void;
  writable: boolean;
  onToast: (s: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The row being named: an item's key, or `new:<section>`. */
  const [naming, setNaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // A menu closes on the next click anywhere else.
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.am-nav-menu, .am-nav-more')) setMenu(null);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);

  const remove = async (item: NavItem) => {
    setMenu(null);
    setConfirming(null);
    try {
      await item.onDelete!();
    } catch (e) {
      onToast(`Could not delete the folder — ${(e as Error).message}`);
    }
  };

  const commit = async (run: (name: string) => Promise<void>) => {
    const name = draft.trim();
    setNaming(null);
    if (!name) return;
    try {
      await run(name);
    } catch (e) {
      onToast(`Could not save the folder — ${(e as Error).message}`);
    }
  };
  const nameInput = (key: string, run: (name: string) => Promise<void>, placeholder?: string) => (
    <input
      key={key}
      className="am-nav-input"
      autoFocus
      placeholder={placeholder}
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit(run)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commit(run);
        if (e.key === 'Escape') setNaming(null);
      }}
    />
  );

  const row = (item: NavItem) => {
    if (naming === item.key && item.onRename) return nameInput(item.key, item.onRename);
    const drop =
      writable && item.accepts && item.onDrop
        ? {
            onDragOver: (e: React.DragEvent) => {
              if (!item.accepts!([...e.dataTransfer.types])) return;
              e.preventDefault();
              setOver(item.key);
            },
            onDragLeave: () => setOver(null),
            onDrop: (e: React.DragEvent) => {
              if (!item.accepts!([...e.dataTransfer.types])) return;
              e.preventDefault();
              setOver(null);
              item.onDrop!(e.dataTransfer);
            },
          }
        : {};
    const manageable = writable && (item.onRename || item.onDelete);
    return (
      <div
        key={item.key}
        className={`am-nav-row${item.nested ? ' am-nested' : ''}${item.quiet ? ' am-quiet' : ''}`}
        {...drop}
      >
        <button
          type="button"
          className={`am-nav-item${current === item.key ? ' am-on' : ''}${over === item.key ? ' am-over' : ''}`}
          aria-current={current === item.key ? 'true' : undefined}
          onClick={() => onPick(item.key)}
        >
          <span className="am-nav-label">{item.label}</span>
          {item.count !== undefined && <span className="am-count">{item.count}</span>}
        </button>
        {manageable && (
          <button
            type="button"
            className="am-nav-more"
            aria-label={`${item.label} — rename or delete`}
            aria-expanded={menu === item.key}
            onClick={() => {
              setMenu(menu === item.key ? null : item.key);
              setConfirming(null);
            }}
          >
            ⋯
          </button>
        )}
        {menu === item.key && (
          <div className="am-nav-menu" role="menu">
            {item.onRename && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  setDraft(item.label);
                  setNaming(item.key);
                }}
              >
                Rename
              </button>
            )}
            {item.onDelete &&
              (confirming === item.key ? (
                // A folder with something in it asks first, and says what happens to it.
                <div className="am-nav-confirm" role="alertdialog" aria-label={`Delete ${item.label}?`}>
                  <p>
                    Delete <b>{item.label}</b>? Its {item.count}{' '}
                    {(item.holds ?? ['item', 'items'])[item.count === 1 ? 0 : 1]} will move to Unfiled.
                  </p>
                  <div>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                    <button type="button" className="am-danger am-confirming" onClick={() => void remove(item)}>
                      Delete folder
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="am-danger"
                  onClick={() => ((item.count ?? 0) > 0 ? setConfirming(item.key) : void remove(item))}
                >
                  Delete folder
                </button>
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="am-nav" aria-label={label}>
      {sections.map((s) => (
        <div key={s.key} className="am-nav-section">
          {s.title &&
            (s.headingKey ? (
              <button
                type="button"
                className={`am-nav-heading${current === s.headingKey ? ' am-on' : ''}`}
                aria-current={current === s.headingKey ? 'true' : undefined}
                onClick={() => onPick(s.headingKey!)}
              >
                <span className="am-nav-label">{s.title}</span>
                {s.headingCount !== undefined && <span className="am-count">{s.headingCount}</span>}
              </button>
            ) : (
              <span className="am-nav-heading am-static">{s.title}</span>
            ))}
          {s.items.map(row)}
          {writable &&
            s.onCreate &&
            (naming === `new:${s.key}` ? (
              nameInput(`new:${s.key}`, s.onCreate, 'Folder name')
            ) : (
              <button
                type="button"
                className={`am-nav-new${s.title ? ' am-nested' : ''}`}
                onClick={() => {
                  setDraft('');
                  setNaming(`new:${s.key}`);
                }}
              >
                + New folder
              </button>
            ))}
        </div>
      ))}
      {writable && <p className="am-nav-tip">Drag onto a folder to file it.</p>}
    </nav>
  );
}

/**
 * The toolbar over the grid: search, an optional sort, and the preview theme
 * — which only changes how the artwork is shown, so it is labelled as such
 * and kept apart from the filters. Under it, where you are and how many.
 */
export function Toolbar<S extends string, L extends string = string>({
  query,
  onQuery,
  placeholder,
  sort,
  preview,
  onPreview,
  language,
  scope,
  count,
  noun,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  sort?: { value: S; options: { value: S; label: string }[]; onChange: (s: S) => void };
  preview: 'dark' | 'light';
  onPreview: (t: 'dark' | 'light') => void;
  /**
   * The language the artwork is shown in, beside the preview theme because
   * it is the same kind of choice: how the art is shown, not what is listed.
   * `busy` says what is still being translated.
   */
  language?: { value: L; onChange: (l: L) => void; options: { value: L; label: string }[]; busy?: string };
  /** Where you are, when narrower than everything; the ✕ goes back to everything. */
  scope?: { label: string; onClear: () => void };
  count: number;
  noun: [string, string];
}) {
  const searching = !!query.trim();
  return (
    <div className="am-toolbar">
      <div className="am-toolbar-row">
        <label className="am-search">
          <span className="am-sr">{placeholder}</span>
          <input type="search" placeholder={placeholder} value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
        {sort && (
          <label className="am-sort">
            <span>Sort</span>
            <select value={sort.value} onChange={(e) => sort.onChange(e.target.value as S)}>
              {sort.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {language && (
          <label className="am-sort am-lang-pick" title="Show every illustration with its text in this language">
            <span>Language</span>
            <select value={language.value} onChange={(e) => language.onChange(e.target.value as L)}>
              {language.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="am-seg am-preview" role="group" aria-label="Preview theme">
          <span className="am-seg-label">Preview</span>
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button" className={preview === t ? 'am-on' : ''} aria-pressed={preview === t} onClick={() => onPreview(t)}>
              {t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </div>
      <div className="am-scope">
        {language?.busy && (
          <span className="am-scope-chip am-translating" role="status">
            {language.busy}
          </span>
        )}
        {searching ? (
          <span className="am-scope-chip am-searching">
            Searching everything
            <button type="button" aria-label="Clear the search" onClick={() => onQuery('')}>
              ✕
            </button>
          </span>
        ) : (
          scope && (
            <span className="am-scope-chip">
              {scope.label}
              <button type="button" aria-label={`Leave ${scope.label}`} onClick={scope.onClear}>
                ✕
              </button>
            </span>
          )
        )}
        <span className="am-meta">
          {count} {count === 1 ? noun[0] : noun[1]}
        </span>
      </div>
    </div>
  );
}
