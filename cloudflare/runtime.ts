/**
 * THE CLOUDFLARE RUNTIME — what claude.ai gives the page, given by our own
 * API instead.
 *
 * Published as a claude.ai Artifact, the page asks `window.claude.use()` for
 * three capabilities: `db` (the team's shared store), `user` (who is
 * viewing) and `downloads` (saving a file). On Cloudflare there is no
 * `window.claude`, so this module installs one that answers the same three
 * from /api — cloudflare/Site.ts, behind Cloudflare Access. Nothing else in
 * the app knows which host it is on.
 *
 *   db         collections and documents, as the capability shapes them;
 *              a doc can hold subcollections (`iconSets/<id>/icons`).
 *              `onSnapshot` is live: one WebSocket to the Library Durable
 *              Object brings every write, from anyone, as it commits.
 *   user       the Access sign-in's email is the viewer id; the name shown
 *              is read off it (makena.ford@… -> "Makena Ford").
 *   downloads  a plain anchor download — outside a viewer's frame it works.
 *   translate  ours alone: machine translation and a Japanese font for the
 *              translated export, from /api/translate and /api/font.
 *
 * Imported first by assets-site/main.tsx; it installs itself only in a
 * Cloudflare build (`--mode cloudflare`, see .env.cloudflare), so the
 * Artifact bundle carries none of it.
 */

type Body = Record<string, unknown> | undefined;
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Body;
}
interface ColSnap {
  docs: DocSnap[];
}

const API = '/api';

class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'forbidden' : res.status === 413 ? 'too_large' : 'error';
    throw new ApiError((await res.text().catch(() => '')) || res.statusText, code);
  }
  return (await res.json()) as T;
}

const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;
const docSnap = (id: string, body: Body): DocSnap => ({ id, exists: body !== undefined, data: () => body });

/* ---- the library's copy -------------------------------------------------- */

/**
 * Each collection is kept here, current, and saved in the browser between
 * visits (IndexedDB). A visit shows the saved copy at once, then asks the
 * Worker only for what was written since (`/api/changes`) — not the whole
 * library, most of it embedded images. Every read goes through `sync`, which
 * is that same small question, so a page that refreshes on each change no
 * longer downloads everything each time.
 */
interface Copy {
  docs: Map<string, Body>;
  /** The latest write the copy has seen, on the Worker's clock: the next `since`. */
  at: number;
}
const copies = new Map<string, Copy>();
const syncing = new Map<string, Promise<Copy>>();

const IDB = 'library-copy';
const STORE = 'collections';
let idb: Promise<IDBDatabase | null> | undefined;
function openIdb(): Promise<IDBDatabase | null> {
  return (idb ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}
async function readSaved(col: string): Promise<Copy | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(col);
      req.onsuccess = () => {
        const v = req.result as { docs: [string, Body][]; at: number } | undefined;
        resolve(v && Array.isArray(v.docs) ? { docs: new Map(v.docs), at: v.at || 0 } : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Saved a moment later, so a run of changes is one write. */
function saveCopy(col: string) {
  clearTimeout(saveTimers.get(col));
  saveTimers.set(
    col,
    setTimeout(async () => {
      const copy = copies.get(col);
      const db = await openIdb();
      if (!copy || !db) return;
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).put({ docs: [...copy.docs], at: copy.at }, col);
      } catch {
        // Out of room or not allowed: the next visit loads from the Worker.
      }
    }, 1000),
  );
}

/** The collection brought up to date: the copy, plus what was written since. */
function sync(col: string): Promise<Copy> {
  const running = syncing.get(col);
  if (running) return running;
  const run = (async () => {
    const copy = copies.get(col) ?? (await readSaved(col)) ?? { docs: new Map(), at: 0 };
    const r = await call<{ rows: { id: string; body: Body }[]; ids: string[]; at: number }>(
      'GET',
      `/changes${q({ col, since: String(copy.at) })}`,
    );
    const now = new Set(r.ids);
    let changed = r.rows.length > 0;
    for (const id of copy.docs.keys()) {
      if (!now.has(id)) {
        copy.docs.delete(id);
        changed = true;
      }
    }
    for (const row of r.rows) copy.docs.set(row.id, row.body);
    if (copy.at !== r.at) changed = true;
    copy.at = r.at;
    copies.set(col, copy);
    if (changed) saveCopy(col);
    return copy;
  })();
  syncing.set(col, run);
  const done = () => {
    if (syncing.get(col) === run) syncing.delete(col);
  };
  run.then(done, done);
  return run;
}

/* ---- live updates -------------------------------------------------------- */

type Listener = (snap: ColSnap) => void;
interface Change {
  col: string;
  id: string;
  body: Body | null;
}
interface Watched {
  listeners: Set<Listener>;
  /** Whether listeners have been sent the collection yet. */
  shown: boolean;
}
const watched = new Map<string, Watched>();
/** Changes that arrived before the collection was first read. */
const pending = new Map<string, Change[]>();

const snapOf = (docs: Map<string, Body>): ColSnap => ({
  docs: [...docs].map(([id, body]) => docSnap(id, body)),
});

function emit(col: string) {
  const w = watched.get(col);
  const copy = copies.get(col);
  if (!w || !copy) return;
  w.shown = true;
  const snap = snapOf(copy.docs);
  for (const l of w.listeners) l(snap);
}

function apply(change: Change) {
  const copy = copies.get(change.col);
  if (!copy) {
    if (watched.has(change.col)) pending.set(change.col, [...(pending.get(change.col) ?? []), change]);
    return;
  }
  if (change.body) copy.docs.set(change.id, change.body);
  else copy.docs.delete(change.id);
  saveCopy(change.col);
  emit(change.col);
}

async function load(col: string, error?: (e: unknown) => void) {
  // The copy saved last visit, shown while what changed since is fetched.
  if (!copies.has(col) && !syncing.has(col)) {
    const saved = await readSaved(col);
    if (saved && !copies.has(col)) {
      copies.set(col, saved);
      emit(col);
    }
  }
  try {
    await sync(col);
    for (const c of pending.get(col)?.splice(0) ?? []) apply(c);
    emit(col);
  } catch (e) {
    error?.(e);
  }
}

/**
 * The one live connection. Every write anyone makes arrives here as it
 * commits. After a drop it reconnects, and catches up on what is watched,
 * since changes made while it was away were never sent.
 */
let socket: WebSocket | undefined;
let retry = 0;
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API}/live`);
  socket = ws;
  ws.onopen = () => {
    if (retry > 0) for (const col of watched.keys()) void load(col);
    retry = 0;
  };
  ws.onmessage = (e) => {
    try {
      apply(JSON.parse(String(e.data)) as Change);
    } catch {
      // Not a change; ignore it.
    }
  };
  ws.onclose = () => {
    socket = undefined;
    retry++;
    setTimeout(connect, Math.min(30_000, 500 * 2 ** retry));
  };
}

function watch(col: string, next: Listener, error?: (e: unknown) => void) {
  if (!socket) connect();
  let w = watched.get(col);
  if (!w) {
    watched.set(col, (w = { listeners: new Set([next]), shown: false }));
    void load(col, error);
  } else {
    w.listeners.add(next);
    const copy = copies.get(col);
    if (w.shown && copy) next(snapOf(copy.docs));
  }
  const entry = w;
  return () => {
    entry.listeners.delete(next);
    if (!entry.listeners.size && watched.get(col) === entry) watched.delete(col);
  };
}

/* ---- db ------------------------------------------------------------------ */

function collection(col: string) {
  return {
    get: async (): Promise<ColSnap> => snapOf((await sync(col)).docs),
    onSnapshot: (next: Listener, error?: (e: unknown) => void) => watch(col, next, error),
    doc: (id: string) => ({
      async get() {
        const r = await call<{ body: Body | null }>('GET', `/doc${q({ col, id })}`);
        return docSnap(id, r.body ?? undefined);
      },
      async set(data: Record<string, unknown>) {
        await call('PUT', `/doc${q({ col, id })}`, data);
        // The pushed change confirms it; this shows it here without waiting.
        apply({ col, id, body: data });
      },
      async delete() {
        await call('DELETE', `/doc${q({ col, id })}`);
        apply({ col, id, body: null });
      },
      collection: (sub: string) => collection(`${col}/${id}/${sub}`),
    }),
  };
}

const db = { collection };

/* ---- user ---------------------------------------------------------------- */

/** "makena.ford@liferay.com" -> "Makena Ford". */
const nameOf = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

let me: Promise<string | null> | undefined;
const user = {
  id: () => (me ??= call<{ email: string | null }>('GET', '/me').then((r) => r.email, () => null)),
  can: async (_name: string) => ((await user.id()) ? true : null),
  profiles: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { name: id.includes('@') ? nameOf(id) : '' }])),
};

/* ---- downloads ----------------------------------------------------------- */

const downloads = {
  async save({ filename, data }: { filename: string; data: string | Blob }) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved' };
  },
};

/* ---- translate ----------------------------------------------------------- */

/**
 * Not a claude.ai capability: the translated export needs a model and a
 * Japanese font, which only the Worker has (cloudflare/Translate.ts). Offered
 * under the same `use()` so editor/translate.ts asks for it like the others,
 * and finds null anywhere else.
 */
const translate = {
  strings: (to: string, strings: string[]) =>
    call<{ translations: string[] }>('POST', '/translate', { to, strings }).then((r) => r.translations),
  async font(weight: number, text: string): Promise<string> {
    const res = await fetch(`${API}/font${q({ weight: String(weight), text })}`, { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError((await res.text().catch(() => '')) || res.statusText, 'error');
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};

/* ---- install ------------------------------------------------------------- */

/**
 * Installed only in a Cloudflare build. Vite fixes `VITE_TARGET` at build
 * time, so in the Artifact build this is dead code and is dropped.
 */
if (import.meta.env.VITE_TARGET === 'cloudflare' && !(window as { claude?: unknown }).claude) {
  const caps: Record<string, unknown> = { db, user, downloads, translate };
  (window as { claude?: unknown }).claude = {
    use: async (name: string) => caps[name] ?? null,
  };
}
