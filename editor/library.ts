import type { Doc } from '../src/document.ts';
import { DOCS } from './docs.ts';

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

export interface Entry {
  id: string;
  name: string;
  doc: Doc;
  origin: Origin;
  updatedAt?: number;
}

interface Backend {
  readonly kind: 'shared' | 'local' | 'none';
  all(): Promise<Record<string, { doc: Doc; updatedAt: number }>>;
  put(id: string, doc: Doc): Promise<void>;
  remove(id: string): Promise<void>;
}

const KEY = 'illustration-library';

const localBackend: Backend = {
  kind: 'local',
  async all() {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  async put(id, doc) {
    const all = await this.all();
    all[id] = { doc, updatedAt: Date.now() };
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
};

const memoryBackend: Backend = {
  kind: 'none',
  async all() {
    return {};
  },
  async put() {},
  async remove() {},
};

/** Minimal shape of the `db` capability this module uses. */
interface DbLike {
  collection(path: string): {
    get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }>;
    doc(id: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
  };
}

function sharedBackend(db: DbLike): Backend {
  const col = () => db.collection('illustrations');
  return {
    kind: 'shared',
    async all() {
      const snap = await col().get();
      const out: Record<string, { doc: Doc; updatedAt: number }> = {};
      for (const d of snap.docs) {
        const body = d.data() as { doc?: Doc; updatedAt?: number } | undefined;
        if (body?.doc) out[d.id] = { doc: body.doc, updatedAt: body.updatedAt ?? 0 };
      }
      return out;
    },
    async put(id, doc) {
      await col()
        .doc(id)
        .set({ id, name: doc.name, updatedAt: Date.now(), doc: doc as unknown as Record<string, unknown> });
    },
    async remove(id) {
      await col().doc(id).delete();
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
  const saved = await (await backend()).all();
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
  return entries;
}

export async function save(doc: Doc): Promise<void> {
  await (await backend()).put(doc.id, doc);
}

/** Drop the saved copy. A shipped illustration reverts; a new one is gone. */
export async function forget(id: string): Promise<void> {
  await (await backend()).remove(id);
}

export const isShipped = (id: string) => SHIPPED.has(id);

/** A fresh id that collides with nothing currently in the library. */
export function freshId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'illustration';
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}
