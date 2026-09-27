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

/* ---- live updates -------------------------------------------------------- */

type Listener = (snap: ColSnap) => void;
interface Change {
  col: string;
  id: string;
  body: Body | null;
}
interface Watched {
  listeners: Set<Listener>;
  /** The collection as last read, kept current by pushed changes; null while loading. */
  docs: Map<string, Body> | null;
  /** Changes that arrived while the collection was loading. */
  pending: Change[];
}
const watched = new Map<string, Watched>();

const snapOf = (docs: Map<string, Body>): ColSnap => ({
  docs: [...docs].map(([id, body]) => docSnap(id, body)),
});

function emit(w: Watched) {
  if (!w.docs) return;
  const snap = snapOf(w.docs);
  for (const l of w.listeners) l(snap);
}

function apply(change: Change) {
  const w = watched.get(change.col);
  if (!w) return;
  if (!w.docs) {
    w.pending.push(change);
    return;
  }
  if (change.body) w.docs.set(change.id, change.body);
  else w.docs.delete(change.id);
  emit(w);
}

async function load(col: string, error?: (e: unknown) => void) {
  const w = watched.get(col);
  if (!w) return;
  w.docs = null;
  try {
    const rows = await call<{ id: string; body: Body }[]>('GET', `/docs${q({ col })}`);
    w.docs = new Map(rows.map((r) => [r.id, r.body]));
    for (const c of w.pending.splice(0)) apply(c);
    emit(w);
  } catch (e) {
    error?.(e);
  }
}

/**
 * The one live connection. Every write anyone makes arrives here as it
 * commits. After a drop it reconnects, and re-reads what is watched, since
 * changes made while it was away were never sent.
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
    watched.set(col, (w = { listeners: new Set(), docs: null, pending: [] }));
    w.listeners.add(next);
    void load(col, error);
  } else {
    w.listeners.add(next);
    if (w.docs) next(snapOf(w.docs));
  }
  const entry = w;
  return () => {
    entry.listeners.delete(next);
    if (!entry.listeners.size) watched.delete(col);
  };
}

/* ---- db ------------------------------------------------------------------ */

function collection(col: string) {
  return {
    get: async (): Promise<ColSnap> => {
      const rows = await call<{ id: string; body: Body }[]>('GET', `/docs${q({ col })}`);
      return { docs: rows.map((r) => docSnap(r.id, r.body)) };
    },
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

/* ---- install ------------------------------------------------------------- */

/**
 * Installed only in a Cloudflare build. Vite fixes `VITE_TARGET` at build
 * time, so in the Artifact build this is dead code and is dropped.
 */
if (import.meta.env.VITE_TARGET === 'cloudflare' && !(window as { claude?: unknown }).claude) {
  const caps: Record<string, unknown> = { db, user, downloads };
  (window as { claude?: unknown }).claude = {
    use: async (name: string) => caps[name] ?? null,
  };
}
