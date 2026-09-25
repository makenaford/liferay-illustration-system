import type { Doc } from '../src/document.ts';

/**
 * THE ASSET STORE — where the team's finished assets live.
 *
 * Published as a claude.ai Artifact, this is the `db` capability: one shared
 * store, live for everyone who opens the page, written by anyone the page is
 * shared with at Contributor or above. Run locally (Vite dev) it falls back
 * to `localStorage`, so the page can be worked on without a viewer.
 *
 *   illustrations/<id>              one illustration: the builder's document
 *   iconSets/<id>                   one icon set: its name
 *   iconSets/<id>/icons/<iconId>    one icon: its SVG, dark and light
 *
 * Icons are documents rather than uploaded files so that anyone who can add
 * an illustration can add an icon — file uploads need editor access — and
 * each is small enough that the 256 KB document cap is never near.
 */

export interface IllustrationRow {
  id: string;
  name: string;
  doc: Doc;
  uploadedAt: number;
  /** An opaque viewer id — never a name; see `names`. */
  uploadedBy?: string;
}

export interface IconRow {
  id: string;
  name: string;
  /** The icon's SVG, or its dark variant when it has two. */
  svg: string;
  /** The light variant, when the icon has one. */
  svgLight?: string;
  uploadedAt: number;
  uploadedBy?: string;
}

export interface IconSetRow {
  id: string;
  name: string;
  createdAt: number;
  createdBy?: string;
  icons: IconRow[];
}

export interface Library {
  illustrations: IllustrationRow[];
  sets: IconSetRow[];
  /** False until the store has answered once — the page shows "Loading". */
  ready: boolean;
}

/** The largest document body the shared store accepts, less some headroom. */
export const MAX_DOC_BYTES = 250 * 1024;

export interface Store {
  readonly kind: 'shared' | 'local';
  watch(onChange: (lib: Library) => void): () => void;
  putIllustration(row: IllustrationRow): Promise<void>;
  deleteIllustration(id: string): Promise<void>;
  putSet(row: Omit<IconSetRow, 'icons'>): Promise<void>;
  deleteSet(set: IconSetRow): Promise<void>;
  putIcon(setId: string, icon: IconRow): Promise<void>;
  deleteIcon(setId: string, iconId: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Shared: the `db` capability                                          */

type Body = Record<string, unknown> | undefined;
interface Snap {
  docs: { id: string; data(): Body }[];
}
interface Col {
  onSnapshot(next: (s: Snap) => void, error?: (e: unknown) => void): () => void;
  doc(id: string): DocRef;
}
interface DocRef {
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): Col;
}
interface Db {
  collection(path: string): Col;
}

function sharedStore(db: Db): Store {
  const illos = () => db.collection('illustrations');
  const sets = () => db.collection('iconSets');
  const icons = (setId: string) => sets().doc(setId).collection('icons');

  return {
    kind: 'shared',
    watch(onChange) {
      let illustrations: IllustrationRow[] = [];
      let setRows: Omit<IconSetRow, 'icons'>[] = [];
      const iconsBySet = new Map<string, IconRow[]>();
      const iconSubs = new Map<string, () => void>();
      let gotIllos = false;
      let gotSets = false;

      const emit = () =>
        onChange({
          illustrations,
          sets: setRows.map((s) => ({ ...s, icons: iconsBySet.get(s.id) ?? [] })),
          ready: gotIllos && gotSets,
        });

      const offIllos = illos().onSnapshot(
        (snap) => {
          gotIllos = true;
          illustrations = snap.docs
            .map((d) => d.data() as unknown as IllustrationRow | undefined)
            .filter((r): r is IllustrationRow => !!r?.doc);
          emit();
        },
        () => {
          gotIllos = true;
          emit();
        },
      );

      // One subscription per set's icons, opened and closed as sets come and go.
      const offSets = sets().onSnapshot(
        (snap) => {
          gotSets = true;
          setRows = snap.docs
            .map((d) => d.data() as unknown as Omit<IconSetRow, 'icons'> | undefined)
            .filter((r): r is Omit<IconSetRow, 'icons'> => !!r?.id);
          const live = new Set(setRows.map((s) => s.id));
          for (const [id, off] of iconSubs) {
            if (!live.has(id)) {
              off();
              iconSubs.delete(id);
              iconsBySet.delete(id);
            }
          }
          for (const s of setRows) {
            if (iconSubs.has(s.id)) continue;
            iconSubs.set(
              s.id,
              icons(s.id).onSnapshot(
                (isnap) => {
                  iconsBySet.set(
                    s.id,
                    isnap.docs
                      .map((d) => d.data() as unknown as IconRow | undefined)
                      .filter((r): r is IconRow => !!r?.svg),
                  );
                  emit();
                },
                () => {},
              ),
            );
          }
          emit();
        },
        () => {
          gotSets = true;
          emit();
        },
      );

      return () => {
        offIllos();
        offSets();
        for (const off of iconSubs.values()) off();
      };
    },
    async putIllustration(row) {
      await illos().doc(row.id).set(clean(row));
    },
    async deleteIllustration(id) {
      await illos().doc(id).delete();
    },
    async putSet(row) {
      await sets().doc(row.id).set(clean(row));
    },
    async deleteSet(set) {
      // Deleting a document leaves its subcollection behind, so icons first.
      for (const icon of set.icons) await icons(set.id).doc(icon.id).delete();
      await sets().doc(set.id).delete();
    },
    async putIcon(setId, icon) {
      await icons(setId).doc(icon.id).set(clean(icon));
    },
    async deleteIcon(setId, iconId) {
      await icons(setId).doc(iconId).delete();
    },
  };
}

/** Drop `undefined` fields, which a JSON document store rejects or keeps as null. */
function clean<T extends object>(o: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Local: this browser only, for development                           */

const KEY = 'marketing-assets-dev';

function localStore(): Store {
  const listeners = new Set<(lib: Library) => void>();
  const read = (): { illustrations: IllustrationRow[]; sets: IconSetRow[] } => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (v && Array.isArray(v.illustrations) && Array.isArray(v.sets)) return v;
    } catch {
      /* fall through */
    }
    return { illustrations: [], sets: [] };
  };
  const write = (fn: (v: ReturnType<typeof read>) => void) => {
    const v = read();
    fn(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      throw new Error('This browser is out of local storage.');
    }
    const lib = { ...read(), ready: true };
    for (const l of listeners) l(lib);
  };
  const upsert = <T extends { id: string }>(list: T[], row: T) => {
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
  };

  return {
    kind: 'local',
    watch(onChange) {
      listeners.add(onChange);
      onChange({ ...read(), ready: true });
      return () => listeners.delete(onChange);
    },
    async putIllustration(row) {
      write((v) => upsert(v.illustrations, row));
    },
    async deleteIllustration(id) {
      write((v) => (v.illustrations = v.illustrations.filter((x) => x.id !== id)));
    },
    async putSet(row) {
      write((v) => {
        const prev = v.sets.find((s) => s.id === row.id);
        upsert(v.sets, { ...row, icons: prev?.icons ?? [] });
      });
    },
    async deleteSet(set) {
      write((v) => (v.sets = v.sets.filter((x) => x.id !== set.id)));
    },
    async putIcon(setId, icon) {
      write((v) => {
        const s = v.sets.find((x) => x.id === setId);
        if (s) upsert(s.icons, icon);
      });
    },
    async deleteIcon(setId, iconId) {
      write((v) => {
        const s = v.sets.find((x) => x.id === setId);
        if (s) s.icons = s.icons.filter((i) => i.id !== iconId);
      });
    },
  };
}

/* ------------------------------------------------------------------ */

interface ClaudeLike {
  use?(name: string): Promise<unknown>;
}
const claude = () => (window as { claude?: ClaudeLike }).claude;

let storePromise: Promise<Store> | undefined;
export function store(): Promise<Store> {
  if (!storePromise) {
    const c = claude();
    storePromise = c?.use
      ? Promise.resolve(c.use('db'))
          .then((db) => (db ? sharedStore(db as Db) : localStore()))
          .catch(() => localStore())
      : Promise.resolve(localStore());
  }
  return storePromise;
}

interface UserLike {
  id(): Promise<string | null>;
  can(name: string): Promise<boolean | null>;
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
}
let userPromise: Promise<UserLike | null> | undefined;
function user(): Promise<UserLike | null> {
  if (!userPromise) {
    const c = claude();
    userPromise = c?.use
      ? Promise.resolve(c.use('user')).then((u) => (u as UserLike) ?? null).catch(() => null)
      : Promise.resolve(null);
  }
  return userPromise;
}

/** This viewer's id, stored with what they upload. */
export async function viewerId(): Promise<string | null> {
  const u = await user();
  return u ? await u.id() : null;
}

/**
 * Whether this viewer can add and remove assets. `null` from the platform
 * means it has not said: keep the controls and let a refused write decide.
 */
export async function canWrite(): Promise<boolean> {
  const u = await user();
  if (!u) return true;
  const can = await u.can('data.write');
  return can !== false;
}

/** Display names for uploader ids, as this viewer sees them. Never stored. */
export async function names(ids: string[]): Promise<Record<string, string>> {
  const u = await user();
  if (!u || !ids.length) return {};
  const ps = await u.profiles(ids);
  return Object.fromEntries(ids.map((id) => [id, ps[id]?.name || '']));
}
