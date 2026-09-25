import type { Doc } from '../src/document.ts';
import { DOCS } from './docs.ts';
import { migrateDoc } from '../src/migrate.ts';

/**
 * THE LIBRARY — where illustrations live between sessions.
 *
 * Two backends, chosen by what the page is running inside, because this
 * editor ships to two places:
 *
 *   - Published as an Artifact, the `db` capability gives a store shared by
 *     everyone in the organization who can open the page. That is what makes
 *     it a library rather than a scratchpad: you edit an illustration, save
 *     it, and the next person sees your version.
 *   - Standalone (a file on disk, or GitHub Pages) there is no `db`, so it
 *     falls back to `localStorage` — per-browser, but the alternative is
 *     losing work on reload.
 *
 * The ten shipped documents are SEEDS, not rows. They are always listed; a
 * saved document with the same id shadows one. That keeps the built-in set
 * intact — `Revert` is a delete of the saved copy, not a restore from a
 * backup nobody made.
 */

export type Origin = 'shipped' | 'edited' | 'new';

/**
 * The team's shared library: this builder published as a claude.ai Artifact
 * with the `db` capability. Copies that save only to their browser point
 * here, so the team's work ends up in one place.
 */
export const SHARED_LIBRARY_URL = 'https://claude.ai/artifact/99HVZBUZbx9K3iG8dJStgd';

/**
 * Where finished illustrations go: the team's Marketing Assets site, which
 * takes an illustration's .json and offers it to everyone as SVG and PNG.
 */
export const ASSETS_URL = 'https://claude.ai/artifact/Y9mkyB7RvD5nfKAirBSorS';

/** Which store saves go to: resolved once, see `backend`. */
export async function storeKind(): Promise<'shared' | 'local' | 'none'> {
  return (await backend()).kind;
}

export interface Entry {
  id: string;
  name: string;
  doc: Doc;
  origin: Origin;
  updatedAt?: number;
  /** Who saved this version — an opaque viewer id, shared library only. */
  updatedBy?: string;
}

/** One saved illustration, as the store holds it. */
export interface Saved {
  doc: Doc;
  /** When it was saved, ms since epoch. Doubles as its version. */
  updatedAt: number;
  updatedBy?: string;
}

interface Backend {
  readonly kind: 'shared' | 'local' | 'none';
  all(): Promise<Record<string, Saved>>;
  /** One illustration's saved version, fresh from the store. */
  get(id: string): Promise<Saved | null>;
  put(id: string, saved: Saved): Promise<void>;
  remove(id: string): Promise<void>;
  /** The folder index — see `Folders`. */
  folders(): Promise<Folders>;
  putFolders(f: Folders): Promise<void>;
  /**
   * Call `onChange` whenever anyone changes the library — shared library
   * only, where teammates' saves arrive live. Returns the unsubscribe.
   */
  watch?(onChange: () => void): () => void;
}

/**
 * FOLDERS — projects to file illustrations under.
 *
 * Kept apart from the illustrations themselves, as one small index: the
 * folders, and which folder each illustration id is in. Filing a SHIPPED
 * illustration therefore writes nothing to the illustration — putting it in
 * a folder must not create a saved copy, because a saved copy shadows the
 * shipped one and it would stop picking up updates from the repo.
 *
 * An illustration in no folder is Unfiled. Deleting a folder unfiles what
 * was in it; it never deletes an illustration.
 */
export interface Folder {
  id: string;
  name: string;
}
export interface Folders {
  folders: Folder[];
  /** Illustration id → folder id. */
  assign: Record<string, string>;
}
const EMPTY_FOLDERS: Folders = { folders: [], assign: {} };

const KEY = 'illustration-library';
const FOLDERS_KEY = 'illustration-folders';

const localBackend: Backend = {
  kind: 'local',
  async all() {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  async get(id) {
    return (await this.all())[id] ?? null;
  },
  async put(id, saved) {
    const all = await this.all();
    all[id] = saved;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      throw new Error('This browser is out of local storage.');
    }
  },
  async remove(id) {
    const all = await this.all();
    delete all[id];
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* nothing useful to do; the next read simply still sees it */
    }
  },
  async folders() {
    try {
      const f = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? 'null') as Folders | null;
      return f && Array.isArray(f.folders) ? { folders: f.folders, assign: f.assign ?? {} } : EMPTY_FOLDERS;
    } catch {
      return EMPTY_FOLDERS;
    }
  },
  async putFolders(f) {
    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(f));
    } catch {
      throw new Error('This browser is out of local storage.');
    }
  },
};

let memoryFolders: Folders = EMPTY_FOLDERS;
const memoryBackend: Backend = {
  kind: 'none',
  async all() {
    return {};
  },
  async get() {
    return null;
  },
  async put() {},
  async remove() {},
  async folders() {
    return memoryFolders;
  },
  async putFolders(f) {
    memoryFolders = f;
  },
};

/** Minimal shape of the `db` capability this module uses. */
type Body = Record<string, unknown> | undefined;
interface DbLike {
  collection(path: string): {
    get(): Promise<{ docs: { id: string; data(): Body }[] }>;
    onSnapshot(next: () => void, error?: (e: unknown) => void): () => void;
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Body }>;
      set(d: Record<string, unknown>): Promise<void>;
      delete(): Promise<void>;
    };
  };
}

function savedOf(body: Body): Saved | null {
  const b = body as { doc?: Doc; updatedAt?: number; updatedBy?: string } | undefined;
  return b?.doc ? { doc: b.doc, updatedAt: b.updatedAt ?? 0, updatedBy: b.updatedBy } : null;
}

function sharedBackend(db: DbLike): Backend {
  const col = () => db.collection('illustrations');
  return {
    kind: 'shared',
    async all() {
      const snap = await col().get();
      const out: Record<string, Saved> = {};
      for (const d of snap.docs) {
        const s = savedOf(d.data());
        if (s) out[d.id] = s;
      }
      return out;
    },
    async get(id) {
      const snap = await col().doc(id).get();
      return snap.exists ? savedOf(snap.data()) : null;
    },
    async put(id, saved) {
      await col()
        .doc(id)
        .set({
          id,
          name: saved.doc.name,
          updatedAt: saved.updatedAt,
          ...(saved.updatedBy ? { updatedBy: saved.updatedBy } : {}),
          doc: saved.doc as unknown as Record<string, unknown>,
        });
    },
    watch(onChange) {
      // Errors end a subscription; the library still works, just not live.
      const offDocs = col().onSnapshot(onChange, () => {});
      const offMeta = db.collection('library-meta').onSnapshot(onChange, () => {});
      return () => {
        offDocs();
        offMeta();
      };
    },
    async remove(id) {
      await col().doc(id).delete();
    },
    // One document in its own collection, so the illustrations collection
    // holds nothing but illustrations.
    async folders() {
      const snap = await db.collection('library-meta').get();
      const body = snap.docs.find((d) => d.id === 'folders')?.data() as Partial<Folders> | undefined;
      return body && Array.isArray(body.folders) ? { folders: body.folders, assign: body.assign ?? {} } : EMPTY_FOLDERS;
    },
    async putFolders(f) {
      await db.collection('library-meta').doc('folders').set(f as unknown as Record<string, unknown>);
    },
  };
}

let backendPromise: Promise<Backend> | undefined;

/**
 * Resolve the backend once. `claude.use` settles after first paint and
 * resolves null when the view cannot run the capability, so this never blocks
 * the library from rendering — it renders the shipped set and fills in.
 */
export function backend(): Promise<Backend> {
  if (!backendPromise) {
    const use = (window as { claude?: { use?(n: string): Promise<unknown> } }).claude?.use;
    backendPromise = use
      ? Promise.resolve(use.call((window as { claude?: unknown }).claude, 'db'))
          .then((db) => (db ? sharedBackend(db as DbLike) : localBackend))
          .catch(() => localBackend)
      : Promise.resolve(typeof localStorage === 'undefined' ? memoryBackend : localBackend);
  }
  return backendPromise;
}

const SHIPPED = new Map(DOCS.map((d) => [d.id, d]));

/** Every illustration, shipped ones overlaid by anything saved. */
export async function list(): Promise<Entry[]> {
  // Saved copies may predate the current document shape.
  const saved = Object.fromEntries(
    Object.entries(await (await backend()).all()).map(([id, hit]) => [id, { ...hit, doc: migrateDoc(hit.doc) }]),
  );
  const entries: Entry[] = DOCS.map((d) => {
    const hit = saved[d.id];
    return hit
      ? { id: d.id, name: hit.doc.name, doc: hit.doc, origin: 'edited', updatedAt: hit.updatedAt }
      : { id: d.id, name: d.name, doc: d, origin: 'shipped' };
  });
  for (const [id, hit] of Object.entries(saved)) {
    if (SHIPPED.has(id)) continue;
    entries.push({ id, name: hit.doc.name, doc: hit.doc, origin: 'new', updatedAt: hit.updatedAt });
  }
  for (const e of entries) {
    const by = saved[e.id]?.updatedBy;
    if (by) e.updatedBy = by;
  }
  return entries;
}

/**
 * Save an illustration as the library's current version. Returns the
 * version's timestamp — what the editor compares against to notice that
 * someone else saved over it since.
 */
export async function save(doc: Doc, at: number = Date.now()): Promise<number> {
  const by = await viewerId();
  await (await backend()).put(doc.id, { doc, updatedAt: at, ...(by ? { updatedBy: by } : {}) });
  return at;
}

/** The library's current saved version of one illustration, if any. */
export async function latest(id: string): Promise<Saved | null> {
  const hit = await (await backend()).get(id);
  return hit ? { ...hit, doc: migrateDoc(hit.doc) } : null;
}

/** Hear about every change to the library, where the store can tell. */
export function subscribe(onChange: () => void): () => void {
  let off: (() => void) | undefined;
  let done = false;
  void backend().then((b) => {
    if (!done && b.watch) off = b.watch(onChange);
  });
  return () => {
    done = true;
    off?.();
  };
}

/** Minimal shape of the `user` capability this module uses. */
interface UserLike {
  id(): Promise<string | null>;
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
}
let userPromise: Promise<UserLike | null> | undefined;
function userCap(): Promise<UserLike | null> {
  if (!userPromise) {
    const c = (window as { claude?: { use?(n: string): Promise<unknown> } }).claude;
    userPromise = c?.use
      ? Promise.resolve(c.use('user')).then((u) => (u as UserLike) ?? null).catch(() => null)
      : Promise.resolve(null);
  }
  return userPromise;
}

/** This viewer's id in the shared library, or null where there is none. */
export async function viewerId(): Promise<string | null> {
  const u = await userCap();
  return u ? await u.id() : null;
}

/**
 * Display names for saver ids, as this viewer sees them. Names are resolved
 * on every render and never stored: only the id is written with a save.
 */
export async function namesOf(ids: string[]): Promise<Record<string, string>> {
  const u = await userCap();
  if (!u || !ids.length) return {};
  const ps = await u.profiles(ids);
  return Object.fromEntries(ids.map((id) => [id, ps[id]?.name || '']));
}

/** Drop the saved copy. A shipped illustration reverts; a new one is gone. */
export async function forget(id: string): Promise<void> {
  const b = await backend();
  await b.remove(id);
  // A deleted illustration leaves its folder; a reverted shipped one stays filed.
  if (!SHIPPED.has(id)) {
    const f = await b.folders();
    if (f.assign[id]) {
      const { [id]: _gone, ...assign } = f.assign;
      await b.putFolders({ ...f, assign });
    }
  }
}

export async function folders(): Promise<Folders> {
  return (await backend()).folders();
}

/** Create a folder; returns it. */
export async function addFolder(name: string): Promise<Folder> {
  const b = await backend();
  const f = await b.folders();
  const id = freshId(name, f.folders.map((x) => x.id));
  const folder = { id, name: name.trim() || 'Untitled project' };
  await b.putFolders({ ...f, folders: [...f.folders, folder] });
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const b = await backend();
  const f = await b.folders();
  await b.putFolders({ ...f, folders: f.folders.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)) });
}

/** Remove a folder. Its illustrations become Unfiled; none is deleted. */
export async function removeFolder(id: string): Promise<void> {
  const b = await backend();
  const f = await b.folders();
  const assign = Object.fromEntries(Object.entries(f.assign).filter(([, v]) => v !== id));
  await b.putFolders({ folders: f.folders.filter((x) => x.id !== id), assign });
}

/** File an illustration in a folder, or unfile it with `null`. */
export async function fileIn(docId: string, folderId: string | null): Promise<void> {
  const b = await backend();
  const f = await b.folders();
  const assign = { ...f.assign };
  if (folderId) assign[docId] = folderId;
  else delete assign[docId];
  await b.putFolders({ ...f, assign });
}

/**
 * Bring in another library's folders: folders this one lacks are added, and
 * the given illustrations are filed where that library had them.
 */
export async function mergeFolders(incoming: Folders, docIds: string[]): Promise<void> {
  const b = await backend();
  const f = await b.folders();
  const known = new Set(f.folders.map((x) => x.id));
  const folders = [...f.folders, ...incoming.folders.filter((x) => !known.has(x.id))];
  const assign = { ...f.assign };
  for (const id of docIds) {
    const to = incoming.assign?.[id];
    if (to && folders.some((x) => x.id === to)) assign[id] = to;
  }
  await b.putFolders({ folders, assign });
}

export const isShipped = (id: string) => SHIPPED.has(id);

/** A fresh id that collides with nothing currently in the library. */
export function freshId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'illustration';
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}
