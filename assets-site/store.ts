import type { Doc, GraphicArt } from '../src/document.ts';
import {
  backend,
  forget,
  folders as readFolders,
  save,
  savedAll,
  subscribe,
  type Folders,
} from '../editor/library.ts';

/**
 * THE ASSET STORE — where the team's finished assets live.
 *
 * Illustrations and folders go through the builder's own library module,
 * because the builder runs inside this page: an illustration saved there and
 * one uploaded here are the same record, in the same place —
 *
 *   illustrations/<id>              one illustration (see editor/library.ts)
 *   library-meta/folders            the folders, and what is filed in each
 *   iconSets/<id>                   one icon set: its name
 *   iconSets/<id>/icons/<iconId>    one icon: its SVG, dark and light
 *
 * Published as a claude.ai Artifact that is the `db` capability, live for
 * everyone the page is shared with; run locally, it is this browser's
 * storage. Icons are documents rather than uploaded files so that anyone who
 * can add an illustration can add an icon — file uploads need editor access.
 */

export type { Folders };

export interface IllustrationRow {
  id: string;
  name: string;
  doc: Doc;
  updatedAt: number;
  /** An opaque viewer id — never a name; see `names`. */
  updatedBy?: string;
}

export interface IconRow {
  id: string;
  name: string;
  /** Its group within the set — Business, Commerce… See `iconCategory`. */
  category?: string;
  /** The icon's SVG, or its dark variant when it has two. */
  svg: string;
  /** The light variant, when the icon has one. */
  svgLight?: string;
  uploadedAt: number;
  uploadedBy?: string;
}

/**
 * One uploaded graphic, already made portable (src/figmaGlass.ts), so the
 * builder places it and a download opens anywhere. Built-in graphics are not
 * rows: they ship with the code, in src/graphics.generated.ts.
 */
export interface GraphicRow {
  id: string;
  name: string;
  dark: GraphicArt;
  light: GraphicArt;
  uploadedAt: number;
  uploadedBy?: string;
}

/**
 * An icon's category and its name within it. Icons added before categories
 * carry both in the name, as the glass icon files do ("Business - Costly"),
 * so that is read as category and name.
 */
export function iconParts(icon: Pick<IconRow, 'name' | 'category'>): { category: string; name: string } {
  if (icon.category) return { category: icon.category, name: icon.name };
  const i = icon.name.indexOf(' - ');
  return i > 0
    ? { category: icon.name.slice(0, i), name: icon.name.slice(i + 3) }
    : { category: 'Uncategorized', name: icon.name };
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
  graphics: GraphicRow[];
  folders: Folders;
  /** False until the store has answered once — the page shows "Loading". */
  ready: boolean;
}

/** An icon set's key in `Folders.assign`, beside illustration ids. */
export const setKey = (id: string) => `iconset:${id}`;
/** A graphic's key in `Folders.assign`; built-in ones are keyed the same way. */
export const graphicKey = (id: string) => `graphic:${id}`;

/** The largest document body the shared store accepts, less some headroom. */
export const MAX_DOC_BYTES = 250 * 1024;

export interface Store {
  readonly kind: 'shared' | 'local';
  watch(onChange: (lib: Library) => void): () => void;
  putIllustration(doc: Doc): Promise<void>;
  deleteIllustration(id: string): Promise<void>;
  putSet(row: Omit<IconSetRow, 'icons'>): Promise<void>;
  deleteSet(set: IconSetRow): Promise<void>;
  putIcon(setId: string, icon: IconRow): Promise<void>;
  deleteIcon(setId: string, iconId: string): Promise<void>;
  putGraphic(row: GraphicRow): Promise<void>;
  deleteGraphic(id: string): Promise<void>;
  /** Re-read illustrations and folders — after a write the store cannot hear. */
  refresh(): void;
}

/* ------------------------------------------------------------------ */
/* Icon sets                                                             */

interface IconStore {
  watch(onChange: (sets: IconSetRow[]) => void): () => void;
  putSet(row: Omit<IconSetRow, 'icons'>): Promise<void>;
  deleteSet(set: IconSetRow): Promise<void>;
  putIcon(setId: string, icon: IconRow): Promise<void>;
  deleteIcon(setId: string, iconId: string): Promise<void>;
}

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

/** Drop `undefined` fields, which a JSON document store rejects. */
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

function sharedIcons(db: Db): IconStore {
  const sets = () => db.collection('iconSets');
  const icons = (setId: string) => sets().doc(setId).collection('icons');
  return {
    watch(onChange) {
      let setRows: Omit<IconSetRow, 'icons'>[] = [];
      const iconsBySet = new Map<string, IconRow[]>();
      const iconSubs = new Map<string, () => void>();
      const emit = () => onChange(setRows.map((s) => ({ ...s, icons: iconsBySet.get(s.id) ?? [] })));
      // One subscription per set's icons, opened and closed as sets come and go.
      const offSets = sets().onSnapshot(
        (snap) => {
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
        () => emit(),
      );
      return () => {
        offSets();
        for (const off of iconSubs.values()) off();
      };
    },
    putSet: (row) => sets().doc(row.id).set(clean(row)),
    async deleteSet(set) {
      // Deleting a document leaves its subcollection behind, so icons first.
      for (const icon of set.icons) await icons(set.id).doc(icon.id).delete();
      await sets().doc(set.id).delete();
    },
    putIcon: (setId, icon) => icons(setId).doc(icon.id).set(clean(icon)),
    deleteIcon: (setId, iconId) => icons(setId).doc(iconId).delete(),
  };
}

interface GraphicStore {
  watch(onChange: (rows: GraphicRow[]) => void): () => void;
  put(row: GraphicRow): Promise<void>;
  remove(id: string): Promise<void>;
}

function sharedGraphics(db: Db): GraphicStore {
  const col = () => db.collection('graphics');
  return {
    watch: (onChange) =>
      col().onSnapshot(
        (snap) =>
          onChange(
            snap.docs
              .map((d) => d.data() as unknown as GraphicRow | undefined)
              .filter((r): r is GraphicRow => !!r?.dark),
          ),
        () => onChange([]),
      ),
    put: (row) => col().doc(row.id).set(clean(row)),
    remove: (id) => col().doc(id).delete(),
  };
}

const GRAPHICS_KEY = 'marketing-assets-graphics';

function localGraphics(): GraphicStore {
  const listeners = new Set<(rows: GraphicRow[]) => void>();
  const read = (): GraphicRow[] => {
    try {
      const v = JSON.parse(localStorage.getItem(GRAPHICS_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const write = (next: GraphicRow[]) => {
    try {
      localStorage.setItem(GRAPHICS_KEY, JSON.stringify(next));
    } catch {
      throw new Error('This browser is out of local storage.');
    }
    for (const l of listeners) l(next);
  };
  return {
    watch(onChange) {
      listeners.add(onChange);
      onChange(read());
      return () => listeners.delete(onChange);
    },
    async put(row) {
      write([...read().filter((g) => g.id !== row.id), row]);
    },
    async remove(id) {
      write(read().filter((g) => g.id !== id));
    },
  };
}

const ICONS_KEY = 'marketing-assets-icons';

function localIcons(): IconStore {
  const listeners = new Set<(sets: IconSetRow[]) => void>();
  const read = (): IconSetRow[] => {
    try {
      const v = JSON.parse(localStorage.getItem(ICONS_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const write = (fn: (v: IconSetRow[]) => IconSetRow[]) => {
    const next = fn(read());
    try {
      localStorage.setItem(ICONS_KEY, JSON.stringify(next));
    } catch {
      throw new Error('This browser is out of local storage.');
    }
    for (const l of listeners) l(next);
  };
  return {
    watch(onChange) {
      listeners.add(onChange);
      onChange(read());
      return () => listeners.delete(onChange);
    },
    async putSet(row) {
      write((v) => {
        const prev = v.find((s) => s.id === row.id);
        return [...v.filter((s) => s.id !== row.id), { ...row, icons: prev?.icons ?? [] }];
      });
    },
    async deleteSet(set) {
      write((v) => v.filter((s) => s.id !== set.id));
    },
    async putIcon(setId, icon) {
      write((v) =>
        v.map((s) => (s.id === setId ? { ...s, icons: [...s.icons.filter((i) => i.id !== icon.id), icon] } : s)),
      );
    },
    async deleteIcon(setId, iconId) {
      write((v) => v.map((s) => (s.id === setId ? { ...s, icons: s.icons.filter((i) => i.id !== iconId) } : s)));
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
    storePromise = (async () => {
      const kind = (await backend()).kind === 'shared' ? 'shared' : 'local';
      const c = claude();
      const db = kind === 'shared' && c?.use ? ((await c.use('db')) as Db | null) : null;
      const iconStore = db ? sharedIcons(db) : localIcons();
      const graphicStore = db ? sharedGraphics(db) : localGraphics();

      const listeners = new Set<() => Promise<void>>();
      const refresh = () => {
        for (const l of listeners) void l();
      };

      return {
        kind,
        watch(onChange) {
          let illustrations: IllustrationRow[] = [];
          let folders: Folders = { folders: [], assign: {} };
          let sets: IconSetRow[] = [];
          let graphics: GraphicRow[] = [];
          let gotIllos = false;
          let gotSets = false;
          const emit = () => onChange({ illustrations, sets, graphics, folders, ready: gotIllos && gotSets });
          const load = async () => {
            const [saved, f] = await Promise.all([savedAll(), readFolders()]);
            illustrations = Object.entries(saved).map(([id, s]) => ({
              id,
              name: s.doc.name,
              doc: s.doc,
              updatedAt: s.updatedAt,
              updatedBy: s.updatedBy,
            }));
            folders = f;
            gotIllos = true;
            emit();
          };
          listeners.add(load);
          void load();
          const offLib = subscribe(() => void load());
          const offIcons = iconStore.watch((next) => {
            sets = next;
            gotSets = true;
            emit();
          });
          const offGraphics = graphicStore.watch((next) => {
            graphics = next;
            emit();
          });
          return () => {
            listeners.delete(load);
            offLib();
            offIcons();
            offGraphics();
          };
        },
        async putIllustration(doc) {
          await save(doc);
          refresh();
        },
        async deleteIllustration(id) {
          await forget(id);
          refresh();
        },
        putSet: iconStore.putSet,
        deleteSet: iconStore.deleteSet,
        putIcon: iconStore.putIcon,
        deleteIcon: iconStore.deleteIcon,
        putGraphic: graphicStore.put,
        deleteGraphic: graphicStore.remove,
        refresh,
      } satisfies Store;
    })();
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
  return (await u.can('data.write')) !== false;
}

/** Display names for uploader ids, as this viewer sees them. Never stored. */
export async function names(ids: string[]): Promise<Record<string, string>> {
  const u = await user();
  if (!u || !ids.length) return {};
  const ps = await u.profiles(ids);
  return Object.fromEntries(ids.map((id) => [id, ps[id]?.name || '']));
}
