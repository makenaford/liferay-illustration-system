import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { copyText, saveFile } from '../editor/save.ts';
import { svgToPng } from '../editor/png.ts';
import { draftAll, renderTranslated, tableFor, tableNow, translator } from '../editor/translate.ts';
import { LANGUAGES, translateDoc, type Lang } from '../src/translate.ts';
import { App as BuilderApp } from '../editor/App.tsx';
import { TEMPLATES, type TemplateName } from '../editor/docs.ts';
import { NewMenu } from '../editor/NewMenu.tsx';
import { initStore, setUI, useEditor } from '../editor/state.ts';
import { addFolder, fileIn, freshId, removeFolder, renameFolder } from '../editor/library.ts';
import { Sidebar, Toolbar, type NavSection } from './Browse.tsx';
import { recipeFor } from './glassLinks.ts';
import { GLASS_FOLDERS, GLASS_ICON_FOLDERS, GLASS_WAS } from '../src/glassIconFolders.ts';
import { migrateDoc } from '../src/migrate.ts';
import { CUSTOM_ICONS } from '../src/customIcons.generated.ts';
import { customIconKey, customShape } from '../src/customIconShape.ts';
import { setLibraryCustomIcons } from '../src/icons.ts';
import type { Doc, GraphicArt } from '../src/document.ts';
import { GRAPHICS } from '../src/graphics.generated.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';
import {
  canWrite,
  iconParts,
  foldersOf,
  UNFILED,
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
import { iconSrc, parseFiles, slug, svgSrc, type ParsedIcon } from './uploads.ts';
import { GlassIconBuilder } from './GlassIconBuilder.tsx';

type Theme = 'dark' | 'light';
type Tab = 'illustrations' | 'icons' | 'graphics' | 'tools';

/** Where an upload goes: a tab, and for icons perhaps one set. */
interface Upload {
  to: Exclude<Tab, 'tools'>;
  set?: IconSetRow;
}
const UPLOAD_LABEL: Record<Exclude<Tab, 'tools'>, string> = {
  illustrations: 'Upload illustrations',
  icons: 'Upload icons',
  graphics: 'Upload graphics',
};
const ACCEPT: Record<Exclude<Tab, 'tools'>, string> = {
  illustrations: '.json,application/json',
  icons: '.svg,image/svg+xml',
  graphics: '.svg,image/svg+xml',
};
/** Every asset, the recently edited, the unfiled ones, or one folder's. */
type Place = 'all' | 'recent' | 'unfiled' | string;
/**
 * THE TWO ICON GROUPS. Glass icons are the library's glass set; Custom icons
 * are the team's own flat 24px icons, offered in the builder beside MingCute.
 * The Custom set starts with the icons the repo ships (assets/custom-icons/)
 * and takes uploads, which the builder offers straight away.
 */
const CUSTOM_SET = 'custom-icons';
const GLASS_SET = 'glass-icons';
/** A custom icon's shape as an SVG file, for a set row: one path, in the set's ink. */
const customSvg = (d: string) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#00072B"/></svg>`;
/**
 * Where src/glassIconFolders.ts puts a glass icon. By its id first — its
 * Figma name slugged, as a plain upload files it — then by its folder and
 * name as they are, then by its name alone when only one icon in the set
 * was ever called that, so a set uploaded with a folder chosen still matches.
 */
const GLASS_BY_LABEL = (() => {
  const by = new Map<string, string[]>();
  for (const [id, to] of Object.entries(GLASS_ICON_FOLDERS)) {
    const was = GLASS_WAS[id];
    const label = (was?.split(' - ').slice(1).join(' - ') ?? to.name).toLowerCase();
    by.set(label, [...(by.get(label) ?? []), id]);
  }
  return by;
})();
function glassHomeOf(icon: IconRow): { folder: string; name: string } | undefined {
  const direct = GLASS_ICON_FOLDERS[icon.id];
  if (direct) return direct;
  const { category, name } = iconParts(icon);
  const byPlace = GLASS_ICON_FOLDERS[slug(`${category} ${name}`)];
  if (byPlace) return byPlace;
  const one = GLASS_BY_LABEL.get(name.toLowerCase());
  return one?.length === 1 ? GLASS_ICON_FOLDERS[one[0]] : undefined;
}

/** The two groups first — Glass icons, then Custom icons — then any other set. */
const groupRank = (id: string) => (id === GLASS_SET ? 0 : id === CUSTOM_SET ? 1 : 2);
/** "server_stack" -> "Server Stack". */
const titleOf = (key: string) => key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** What "Recently edited" reaches back to. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
type IllustrationSort = 'recent' | 'az';

/**
 * Where the Icon sets tab is looking: `all`, one set (`set:<id>`), or one of
 * its folders (`set:<id>:unfiled`, `set:<id>:f:<name>`).
 */
function iconPlaceOf(key: string): { setId: string | null; folder: 'all' | 'unfiled' | string } {
  if (!key.startsWith('set:')) return { setId: null, folder: 'all' };
  const [, setId, kind, ...rest] = key.split(':');
  return { setId, folder: kind === 'unfiled' ? 'unfiled' : kind === 'f' ? rest.join(':') : 'all' };
}
const iconPlaceKey = (setId: string, folder: 'all' | 'unfiled' | string) =>
  folder === 'all' ? `set:${setId}` : folder === 'unfiled' ? `set:${setId}:unfiled` : `set:${setId}:f:${folder}`;

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
  /** The Glass Icon Builder, open — with an icon to edit, when it was made there. */
  const [glassing, setGlassing] = useState<false | { edit?: { setId: string; icon: IconRow } }>(false);
  const builderView = useEditor((s) => s.view);
  const [art, setArt] = useState<Theme>('dark');
  // The language the whole library is shown in. Remembered in this browser;
  // English is the illustrations as written.
  const [libLang, setLibLangState] = useState<Lang | 'en'>(() => {
    try {
      const v = localStorage.getItem('library-lang');
      return v && v in LANGUAGES ? (v as Lang) : 'en';
    } catch {
      return 'en';
    }
  });
  const setLibLang = (l: Lang | 'en') => {
    setLibLangState(l);
    try {
      localStorage.setItem('library-lang', l);
    } catch {
      /* not remembered: fine */
    }
  };
  const [canTranslate, setCanTranslate] = useState(false);
  useEffect(() => void translator().then((t) => setCanTranslate(!!t)), []);
  /** Strings still being translated for the library, and a tick per batch landed. */
  const [drafting, setDrafting] = useState<{ remaining: number; tick: number }>({ remaining: 0, tick: 0 });
  const [query, setQuery] = useState('');
  const [illSort, setIllSort] = useState<IllustrationSort>('recent');
  const [iconPlace, setIconPlace] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [pendingIcons, setPendingIcons] = useState<ParsedIcon[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  /** Select mode on Illustrations or Graphics: ids picked for removal. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState(false);
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // A selection belongs to one tab.
  useEffect(stopSelecting, [tab]);
  /** What the open file picker is adding to. */
  const [upload, setUpload] = useState<Upload | null>(null);
  const pick = (to: Upload) => {
    setUpload(to);
    const input = pickRef.current;
    if (!input) return;
    // Set here, not by render: the picker must open within this click.
    input.accept = ACCEPT[to.to];
    input.click();
  };

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

  // The builder offers the Custom icons set as it is — what was removed from
  // it goes, what was uploaded comes — and, before there is one, the icons the
  // repo ships.
  const customSet = lib.sets.find((x) => x.id === CUSTOM_SET);
  useEffect(() => {
    if (!customSet) return setLibraryCustomIcons(null);
    const icons: Record<string, { c: string; line?: string; fill?: string }> = {};
    for (const row of customSet.icons) {
      const got = customShape(row.svg);
      if ('d' in got) icons[row.id] = { c: row.category ?? 'Custom', line: got.d, fill: got.d };
    }
    setLibraryCustomIcons(icons);
  }, [customSet]);

  // The first time the library has no Custom icons set, it is started with
  // the repo's — once, by whoever can write.
  const seeding = useRef(false);
  useEffect(() => {
    if (!lib.ready || !writable || !st || customSet || seeding.current) return;
    seeding.current = true;
    void (async () => {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      await st.putSet({ id: CUSTOM_SET, name: 'Custom icons', createdAt: now, createdBy: by });
      for (const [key, g] of Object.entries(CUSTOM_ICONS)) {
        const d = g.line ?? g.fill;
        if (!d) continue;
        await st.putIcon(CUSTOM_SET, {
          id: key,
          name: titleOf(key),
          ...(g.c !== 'Custom' ? { category: g.c } : {}),
          svg: customSvg(d),
          uploadedAt: now,
          uploadedBy: by,
        });
      }
    })();
  }, [lib.ready, writable, st, customSet]);

  // A folder deleted elsewhere falls back to everything.
  const known = new Set(lib.folders.folders.map((f) => f.id));
  const current: Place = place === 'all' || place === 'unfiled' || known.has(place) ? place : 'all';
  const folderOf = (key: string) => {
    const f = lib.folders.assign[key];
    return f && known.has(f) ? f : null;
  };
  const recentSince = Date.now() - RECENT_MS;
  const inPlace = (i: IllustrationRow) =>
    current === 'all'
      ? true
      : current === 'recent'
        ? i.updatedAt >= recentSince
        : current === 'unfiled'
          ? !folderOf(i.id)
          : folderOf(i.id) === current;

  const needle = query.trim().toLowerCase();
  // A search looks through everything, wherever the sidebar is — and matches
  // folder names too — so a match never hides in a folder left open.
  const illustrations = useMemo(
    () =>
      [...lib.illustrations]
        .filter((i) => {
          if (!needle) return inPlace(i);
          const f = folderOf(i.id);
          const folderName = f ? (lib.folders.folders.find((x) => x.id === f)?.name ?? '') : '';
          return i.name.toLowerCase().includes(needle) || folderName.toLowerCase().includes(needle);
        })
        .sort((a, b) => (illSort === 'az' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.illustrations, lib.folders, current, needle, illSort],
  );
  const sets = useMemo(
    () =>
      [...lib.sets]
        .map((s) => ({
          ...s,
          icons: [...s.icons]
            .filter(
              (i) =>
                !needle ||
                i.name.toLowerCase().includes(needle) ||
                iconParts(i).category.toLowerCase().includes(needle) ||
                s.name.toLowerCase().includes(needle),
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((s) => !needle || s.icons.length)
        .sort((a, b) => groupRank(a.id) - groupRank(b.id) || a.name.localeCompare(b.name)),
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
    // Brought up to date as it opens — an older mockup gains its screenshot slot.
    initStore(migrateDoc(structuredClone(row.doc)), row.updatedAt);
    setUI({ view: 'editor', selected: null });
    setOpen(null);
    setBuilding(true);
  };
  const create = async (template: TemplateName = 'blank') => {
    const doc = TEMPLATES[template].make();
    doc.id = freshId(doc.id, lib.illustrations.map((i) => i.id));
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

  /**
   * Take files from the picker or a drop. `via` is the tab's own Upload
   * button (or an icon set's Add icons): its SVGs go where it says, with no
   * question. A drop asks.
   */
  const take = async (files: File[], via?: Upload) => {
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
      if (parsed.icons.length) {
        if (via?.to === 'graphics') await addGraphics(parsed.icons);
        else if (via?.set) await addIcons(parsed.icons, { id: via.set.id, name: via.set.name, isNew: false });
        else setPendingIcons(parsed.icons);
      }
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
      // Custom icons must be drawn as MingCute's are (src/customIconShape.ts);
      // those that aren't are left out, with what to fix.
      const custom = set.id === CUSTOM_SET;
      const refused: string[] = [];
      if (custom) {
        icons = icons.filter((icon) => {
          const got = customShape(icon.svg);
          if ('problem' in got) refused.push(`${icon.name}: ${got.problem}`);
          return 'd' in got;
        });
      }
      // "Business - Costly" in a file name is category and name.
      const place = (icon: ParsedIcon) => {
        const parts = iconParts({ name: icon.name });
        const fromFile = parts.category !== 'Uncategorized';
        return { category: category || (fromFile ? parts.category : undefined), name: fromFile ? parts.name : icon.name };
      };
      // A custom icon's id is its key in the builder, `custom:<id>`: its name alone.
      const idOf = (icon: ParsedIcon) => {
        const pl = place(icon);
        return custom ? customIconKey(pl.name) : slug(`${pl.category ?? ''} ${pl.name}`);
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
          (replaced ? `, replaced ${replaced}` : '') +
          (refused.length ? `. Left out ${refused.length} — ${refused.join('; ')}` : '') +
          (custom && icons.length ? '. The builder offers them now.' : '.'),
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
  /* ---------- Browse: the sidebar and toolbar for each tab ---------- */

  const folderName = (id: string) => lib.folders.folders.find((f) => f.id === id)?.name ?? '';
  const illustrationNav = (
    <Sidebar
      label="Illustration folders"
      current={needle ? '' : current}
      onPick={(k) => {
        setQuery('');
        setPlace(k);
      }}
      writable={writable}
      onToast={setToast}
      sections={[
        {
          key: 'views',
          items: [
            { key: 'all', label: 'All illustrations', count: lib.illustrations.length },
            { key: 'recent', label: 'Recently edited', count: lib.illustrations.filter((i) => i.updatedAt >= recentSince).length },
          ],
        },
        {
          key: 'folders',
          title: 'Folders',
          items: [
            ...lib.folders.folders.map((f) => ({
              key: f.id,
              label: f.name,
              nested: true,
              count: lib.illustrations.filter((i) => folderOf(i.id) === f.id).length,
              accepts: (t: readonly string[]) => t.includes(DRAG),
              onDrop: (d: DataTransfer) => void file(d.getData(DRAG), f.id),
              onRename: async (name: string) => {
                await renameFolder(f.id, name);
                await st?.refresh();
              },
              onDelete: async () => {
                await removeFolder(f.id);
                if (current === f.id) setPlace('all');
                await st?.refresh();
                const n = lib.illustrations.filter((i) => folderOf(i.id) === f.id).length;
                setToast(`Deleted the ${f.name} folder.${n ? ` ${n === 1 ? 'Its illustration is' : `Its ${n} illustrations are`} now Unfiled.` : ''}`);
              },
              holds: ['illustration', 'illustrations'] as [string, string],
            })),
            {
              key: 'unfiled',
              label: 'Unfiled',
              nested: true,
              quiet: true,
              count: lib.illustrations.filter((i) => !folderOf(i.id)).length,
              accepts: (t: readonly string[]) => t.includes(DRAG),
              onDrop: (d: DataTransfer) => void file(d.getData(DRAG), null),
            },
          ],
          onCreate: async (name) => {
            const f = await addFolder(name);
            await st?.refresh();
            setPlace(f.id);
          },
        },
      ]}
    />
  );
  const placeLabel =
    current === 'all' ? null : current === 'recent' ? 'Recently edited' : current === 'unfiled' ? 'Unfiled' : folderName(current);
  // In another language, every illustration shown is translated: what has a
  // review in the builder as reviewed, the rest drafted by machine — all the
  // library's strings at once, the thumbnails redrawing as batches land.
  const shownDocs = useMemo(() => illustrations.map((r) => r.doc), [illustrations]);
  useEffect(() => {
    if (libLang === 'en' || !canTranslate) return;
    let live = true;
    draftAll(shownDocs, libLang, (remaining) => live && setDrafting((d) => ({ remaining, tick: d.tick + 1 }))).catch(
      (e) => live && setToast(`Could not translate the library — ${(e as Error).message}`),
    );
    return () => {
      live = false;
    };
  }, [shownDocs, libLang, canTranslate]);

  const illustrationTools = (
    <Toolbar
      query={query}
      onQuery={setQuery}
      placeholder="Search illustrations and folders"
      sort={{
        value: illSort,
        onChange: setIllSort,
        options: [
          { value: 'recent', label: 'Recently edited' },
          { value: 'az', label: 'Name, A–Z' },
        ],
      }}
      preview={art}
      onPreview={setArt}
      language={
        canTranslate
          ? {
              value: libLang,
              onChange: setLibLang,
              options: [
                { value: 'en', label: 'English' },
                ...(Object.keys(LANGUAGES) as Lang[]).map((l) => ({ value: l, label: LANGUAGES[l].native })),
              ],
              busy: libLang !== 'en' && drafting.remaining > 0 ? `Translating ${drafting.remaining} strings…` : undefined,
            }
          : undefined
      }
      scope={placeLabel ? { label: placeLabel, onClear: () => setPlace('all') } : undefined}
      count={illustrations.length}
      noun={['illustration', 'illustrations']}
    />
  );
  const graphicsTools = (
    <Toolbar
      query={query}
      onQuery={setQuery}
      placeholder="Search graphics"
      preview={art}
      onPreview={setArt}
      count={graphics.length}
      noun={['graphic', 'graphics']}
    />
  );

  // A set or folder removed elsewhere falls back to all icons.
  const iconAtRaw = iconPlaceOf(iconPlace);
  const atSet = iconAtRaw.setId ? lib.sets.find((x) => x.id === iconAtRaw.setId) : undefined;
  const iconAt =
    !atSet || (iconAtRaw.folder !== 'all' && iconAtRaw.folder !== 'unfiled' && !foldersOf(atSet).includes(iconAtRaw.folder))
      ? atSet
        ? { setId: atSet.id, folder: 'all' as const }
        : { setId: null, folder: 'all' as const }
      : iconAtRaw;
  const shownSets = needle || !iconAt.setId ? sets : sets.filter((x) => x.id === iconAt.setId);
  const shownIconCount = shownSets.reduce((n, x) => {
    if (needle || iconAt.folder === 'all') return n + x.icons.length;
    return n + x.icons.filter((i) => iconFolderOf(i) === (iconAt.folder === 'unfiled' ? null : iconAt.folder)).length;
  }, 0);
  const iconNav = (
    <Sidebar
      label="Icon sets and folders"
      current={needle ? '' : iconAt.setId ? iconPlaceKey(iconAt.setId, iconAt.folder) : 'all'}
      onPick={(k) => {
        setQuery('');
        setIconPlace(k);
      }}
      writable={writable}
      onToast={setToast}
      sections={[
        { key: 'all', items: [{ key: 'all', label: 'All icons', count: iconCount }] },
        ...[...lib.sets]
          .sort((a, b) => groupRank(a.id) - groupRank(b.id) || a.name.localeCompare(b.name))
          .map((set): NavSection => {
            const ops = iconFolders(st, set, setToast);
            const dropInto = (folder: string | null) => ({
              accepts: (t: readonly string[]) => t.includes(DRAG_ICON),
              onDrop: (d: DataTransfer) => {
                const { setId, iconId } = JSON.parse(d.getData(DRAG_ICON) || '{}');
                if (setId !== set.id) return setToast('Icons move between folders of their own set.');
                const icon = set.icons.find((i) => i.id === iconId);
                if (icon) void ops.file([icon], folder);
              },
            });
            return {
              key: set.id,
              title: set.name,
              headingKey: iconPlaceKey(set.id, 'all'),
              headingCount: set.icons.length,
              items: [
                ...foldersOf(set).map((f) => ({
                  key: iconPlaceKey(set.id, f),
                  label: f,
                  nested: true,
                  count: set.icons.filter((i) => iconFolderOf(i) === f).length,
                  ...dropInto(f),
                  onRename: async (to: string) => {
                    if (RESERVED.includes(to.toLowerCase())) return setToast(`“${to}” is a reserved name — choose another.`);
                    await ops.rename(f, to);
                    if (iconAt.setId === set.id && iconAt.folder === f) setIconPlace(iconPlaceKey(set.id, to));
                  },
                  onDelete: async () => {
                    await ops.remove(f);
                    if (iconAt.setId === set.id && iconAt.folder === f) setIconPlace(iconPlaceKey(set.id, 'all'));
                  },
                  holds: ['icon', 'icons'] as [string, string],
                })),
                {
                  key: iconPlaceKey(set.id, 'unfiled'),
                  label: 'Unfiled',
                  nested: true,
                  quiet: true,
                  count: set.icons.filter((i) => !iconFolderOf(i)).length,
                  ...dropInto(null),
                },
              ],
              onCreate: async (name) => {
                if (RESERVED.includes(name.toLowerCase())) return setToast(`“${name}” is a reserved name — choose another.`);
                if (foldersOf(set).some((f) => f.toLowerCase() === name.toLowerCase())) return setToast(`There is already a ${name} folder.`);
                await ops.saveFolders([...foldersOf(set), name]);
                setIconPlace(iconPlaceKey(set.id, name));
              },
            };
          }),
      ]}
    />
  );
  const iconScope = iconAt.setId
    ? `${atSet?.name ?? ''}${iconAt.folder === 'all' ? '' : ` › ${iconAt.folder === 'unfiled' ? 'Unfiled' : iconAt.folder}`}`
    : null;
  const iconTools = (
    <Toolbar
      query={query}
      onQuery={setQuery}
      placeholder="Search icons, folders and sets"
      preview={art}
      onPreview={setArt}
      scope={iconScope ? { label: iconScope, onClear: () => setIconPlace('all') } : undefined}
      count={shownIconCount}
      noun={['icon', 'icons']}
    />
  );

  if (building && builderView === 'editor') return <BuilderApp />;
  if (glassing) {
    return (
      <div className="am-root">
        <div className="am-page">
          <GlassIconBuilder
            // Glass icons go to glass sets, never to the flat Custom icons.
            sets={lib.sets.filter((x) => x.id !== CUSTOM_SET)}
            writable={writable}
            store={st}
            onToast={setToast}
            editing={glassing.edit}
            onClose={(saved) => {
              setGlassing(false);
              if (!saved) return;
              // Straight to where the icon went.
              setTab('icons');
              setQuery('');
              setIconPlace(iconPlaceKey(saved.setId, saved.folder ?? 'unfiled'));
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
          <input
            ref={pickRef}
            id="upload"
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void take([...(e.target.files ?? [])], upload ?? undefined);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="am-tabbar">
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
        {writable && tab !== 'tools' && (
          <div className="am-tabbar-actions">
            {(tab === 'illustrations' || tab === 'graphics') && (
              <button
                type="button"
                className={selecting ? 'am-on' : ''}
                aria-pressed={selecting}
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              >
                {selecting ? 'Done' : 'Select'}
              </button>
            )}
            <button
              type="button"
              className={tab === 'illustrations' ? '' : 'am-primary'}
              disabled={busy}
              onClick={() => pick({ to: tab })}
            >
              {busy ? 'Adding…' : UPLOAD_LABEL[tab]}
            </button>
            {tab === 'illustrations' && <NewMenu className="am-primary" onPick={(t) => void create(t)} />}
            {/* Beside Upload icons, where a new icon is wanted: the builder that makes one. */}
            {tab === 'icons' && (
              <button type="button" onClick={() => setGlassing({})}>
                Glass Icon Builder
              </button>
            )}
          </div>
        )}
      </div>

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
          <div className="am-browse">
            {illustrationNav}
            <div className="am-browse-main">
              {illustrationTools}
              {illustrations.length ? (
            <div className="am-grid">
              {illustrations.map((row) => (
                <IllustrationCard
                  key={row.id}
                  row={row}
                  theme={art}
                  lang={libLang}
                  tick={drafting.tick}
                  by={who(row.updatedBy)}
                  onOpen={() => setOpen(row.id)}
                  onEdit={writable ? () => edit(row) : undefined}
                  select={selecting ? { on: selected.has(row.id), toggle: () => toggleSelected(row.id) } : undefined}
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
          )}
            </div>
          </div>
        ) : tab === 'tools' ? (
          <Tools writable={writable} onNew={(t) => void create(t)} onGlass={() => setGlassing({})} />
        ) : tab === 'graphics' ? (
          <div className="am-browse-main am-solo">
            {graphicsTools}
            {graphics.length ? (
            <GraphicsGrid
              items={graphics}
              theme={art}
              writable={writable}
              store={st}
              onToast={setToast}
              selecting={selecting}
              selected={selected}
              onToggle={toggleSelected}
            />
          ) : (
            <Empty
              ready={lib.ready}
              searching={!!needle}
              title="No graphics in this folder"
              body={<>Drop <b>.svg</b> files here and choose Graphics. “… - Dark” and “… - Light” pair into one graphic.</>}
            />
          )}
          </div>
        ) : (
          <div className="am-browse">
            {iconNav}
            <div className="am-browse-main">
              {iconTools}
              {shownSets.length ? (
          <div className="am-sets">
            {shownSets.map((s) => (
              <IconSet
                key={s.id}
                set={s}
                place={needle || !iconAt.setId ? 'all' : iconAt.folder}
                theme={art}
                by={who(s.createdBy)}
                writable={writable}
                store={st}
                onToast={setToast}
                onAdd={() => pick({ to: 'icons', set: s })}
                onEdit={(icon) => setGlassing({ edit: { setId: s.id, icon } })}
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
            </div>
          </div>
        )}
      </main>

      {selecting && (tab === 'illustrations' || tab === 'graphics') && (
        <SelectionBar
          count={
            tab === 'illustrations'
              ? illustrations.filter((i) => selected.has(i.id)).length
              : graphics.filter((g) => !g.builtIn && selected.has(g.id)).length
          }
          noun={tab === 'illustrations' ? 'illustration' : 'graphic'}
          hint={
            tab === 'illustrations'
              ? 'Click illustrations to add them to the selection.'
              : 'Click graphics to add them — built-in ones ship with the builder and stay.'
          }
          removing={removing}
          onClear={() => setSelected(new Set())}
          onRemove={async () => {
            if (!st) return;
            const ids =
              tab === 'illustrations'
                ? illustrations.filter((i) => selected.has(i.id)).map((i) => i.id)
                : graphics.filter((g) => !g.builtIn && selected.has(g.id)).map((g) => g.id);
            setRemoving(true);
            let done = 0;
            try {
              for (const id of ids) {
                if (tab === 'illustrations') await st.deleteIllustration(id);
                else await st.deleteGraphic(id);
                done++;
              }
              const noun = tab === 'illustrations' ? 'illustration' : 'graphic';
              setToast(
                `Removed ${done} ${noun}${done === 1 ? '' : 's'}.` +
                  (tab === 'graphics' ? ' Illustrations already using them keep their copy.' : ''),
              );
              stopSelecting();
            } catch (e) {
              setToast(`Removed ${done} of ${ids.length} — ${(e as Error).message}`);
            } finally {
              setRemoving(false);
              st.refresh();
            }
          }}
        />
      )}

      {dragging && writable && (
        <div className="am-drop" aria-hidden>
          <p>Drop to add — builder .json files and .svg icons</p>
        </div>
      )}

      {openRow && (
        <IllustrationDetail
          row={openRow}
          initialTheme={art}
          initialLang={canTranslate ? libLang : 'en'}
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

/** Drag payload for filing a card or set into a folder. */
const DRAG = 'application/x-marketing-asset';
/** Drag payload for filing an icon into one of its set's folders. */
const DRAG_ICON = 'application/x-glass-icon';

/** Names a folder can't take: the bar's own chips, and what an unfiled icon reports. */
const RESERVED = ['all', 'unfiled', UNFILED.toLowerCase()];

/** An icon's folder; null is Unfiled. */
const iconFolderOf = (i: IconRow) => {
  const c = iconParts(i).category;
  return c === UNFILED ? null : c;
};

/**
 * Managing one set's folders — for the set itself and for the sidebar. A
 * folder is the icons' `category`, and the set keeps their order.
 */
function iconFolders(st: Store | null, set: IconSetRow, onToast: (s: string) => void) {
  const saveFolders = async (names: string[]) => {
    await st?.putSet({ id: set.id, name: set.name, createdAt: set.createdAt, createdBy: set.createdBy, folders: names });
  };
  /** File icons into `folder` (null: Unfiled). Their names lose any "Category - " they carried. */
  const file = async (icons: IconRow[], folder: string | null, quiet = false) => {
    if (!st) return;
    const moving = icons.filter((i) => iconFolderOf(i) !== folder);
    try {
      for (const icon of moving) {
        await st.putIcon(set.id, { ...icon, name: iconParts(icon).name, category: folder ?? undefined });
      }
      if (moving.length && !quiet) {
        onToast(`Moved ${moving.length === 1 ? iconParts(moving[0]).name : `${moving.length} icons`} to ${folder ?? 'Unfiled'}.`);
      }
    } catch (e) {
      onToast(`Could not move them — ${(e as Error).message}`);
    }
  };
  const rename = async (from: string, to: string) => {
    const folders = foldersOf(set);
    if (folders.some((f) => f.toLowerCase() === to.toLowerCase() && f !== from)) return onToast(`There is already a ${to} folder.`);
    await saveFolders(folders.map((f) => (f === from ? to : f)));
    await file(set.icons.filter((i) => iconFolderOf(i) === from), to, true);
    onToast(`Renamed ${from} to ${to}.`);
  };
  const remove = async (name: string) => {
    const inside = set.icons.filter((i) => iconFolderOf(i) === name);
    await file(inside, null, true);
    await saveFolders(foldersOf(set).filter((f) => f !== name));
    onToast(`Deleted the ${name} folder.${inside.length ? ` Its ${inside.length === 1 ? 'icon is' : `${inside.length} icons are`} now Unfiled.` : ''}`);
  };
  return { saveFolders, file, rename, remove };
}

function IllustrationCard({
  row,
  theme,
  lang,
  tick,
  by,
  onOpen,
  onEdit,
  select,
}: {
  row: IllustrationRow;
  theme: Theme;
  /** The library's language; the thumbnail draws in it as far as it is translated. */
  lang: Lang | 'en';
  /** Changes as translations land, so the thumbnail picks them up. */
  tick: number;
  by: string | null;
  onOpen: () => void;
  /** Absent for viewers who cannot save. */
  onEdit?: () => void;
  /** In select mode: whether it is picked, and how to toggle it. */
  select?: { on: boolean; toggle: () => void };
}) {
  const svg = useMemo(() => {
    const doc = lang === 'en' ? row.doc : translateDoc(row.doc, tableNow(row.doc, lang).table);
    return renderDocument(doc, theme, { embedFont: false });
    // `tick` stands for the drafts, which live outside React.
  }, [row.doc, theme, lang, tick]);
  const { width, height } = row.doc.canvas;
  return (
    <figure
      className={`am-card${select ? ' am-selecting' : ''}${select?.on ? ' am-picked' : ''}`}
      draggable={!select}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, row.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button
        type="button"
        className="am-thumb"
        onClick={select ? select.toggle : onOpen}
        aria-label={select ? `Select ${row.name}` : `Open ${row.name}`}
        aria-pressed={select ? select.on : undefined}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {select && <span className="am-check" aria-hidden />}
        <span className="am-art" dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
      <figcaption>
        <b title={row.name}>{row.name}</b>
        <span className="am-meta">
          {width} × {height}
          {row.updatedAt ? ` · ${when(row.updatedAt)}` : ''}
          {by ? ` · ${by}` : ''}
        </span>
        <div className="am-card-row" hidden={!!select}>
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
  initialLang,
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
  /** The library's language, which the sheet opens in. */
  initialLang: Lang | 'en';
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
  // The language the preview and every download are in. The illustration
  // itself is never changed: a translated copy is made on the way out.
  const [lang, setLang] = useState<Lang | 'en'>(initialLang);
  const [translation, setTranslation] = useState<{ lang: Lang; table: Record<string, string>; drafted: number } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [canTranslate, setCanTranslate] = useState(false);
  useEffect(() => void translator().then((t) => setCanTranslate(!!t)), []);
  useEffect(() => {
    if (lang === 'en') return;
    let live = true;
    setTranslating(true);
    tableFor(row.doc, lang)
      .then((r) => live && setTranslation({ lang, ...r }))
      .catch((e) => {
        if (!live) return;
        onToast(`Could not translate — ${(e as Error).message}`);
        setLang('en');
      })
      .finally(() => live && setTranslating(false));
    return () => {
      live = false;
    };
  }, [row.doc, lang]);
  const table = lang !== 'en' && translation?.lang === lang ? translation.table : null;
  const shown = useMemo(() => (table ? translateDoc(row.doc, table) : row.doc), [row.doc, table]);
  const preview = useMemo(() => renderDocument(shown, theme, { embedFont: false }), [shown, theme]);
  const { width, height } = row.doc.canvas;
  const stem = table ? `${row.id}.${lang}` : row.id;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const svgFor = (t: Theme) =>
    table && lang !== 'en' ? renderTranslated(row.doc, lang, table, t) : Promise.resolve(renderDocument(row.doc, t));
  const svg = async (t: Theme) => {
    try {
      await offer(`${stem}.${t}.svg`, await svgFor(t), 'image/svg+xml', onToast);
    } catch (e) {
      onToast(`Could not make the SVG — ${(e as Error).message}`);
    }
  };
  const png = async (t: Theme) => {
    try {
      const blob = await svgToPng(await svgFor(t), width, height, 2);
      await offer(`${stem}.${t}@2x.png`, blob, 'image/png', onToast);
    } catch (e) {
      onToast(`Could not make the PNG — ${(e as Error).message}`);
    }
  };
  const busy = lang !== 'en' && !table;

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
          {canTranslate && (
            <select
              aria-label="Language"
              className="am-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang | 'en')}
              title="Preview and download the illustration with its text in another language"
            >
              <option value="en">English — as written</option>
              {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGES[l].name} — {LANGUAGES[l].native}
                </option>
              ))}
            </select>
          )}
          {writable && folders.folders.length > 0 && (
            <FolderSelect id={`folder-${row.id}`} folders={folders} value={folder} onChange={onFile} />
          )}
          </div>

          <div className="am-downloads">
            <h3>Download{table && lang !== 'en' ? ` in ${LANGUAGES[lang].name}` : ''}</h3>
            {lang !== 'en' && (
              <p className="am-hint">
                {translating
                  ? 'Translating…'
                  : translation?.drafted
                    ? `${translation.drafted} string${translation.drafted === 1 ? ' is' : 's are'} machine-translated and unreviewed — use Translate… in the builder to check ${translation.drafted === 1 ? 'it' : 'them'}.`
                    : 'Every string has a reviewed translation.'}{' '}
                The illustration itself stays in English.
              </p>
            )}
            <div className="am-dl-grid">
              <span className="am-dl-label">Dark</span>
              <button type="button" disabled={busy} onClick={() => void svg('dark')}>SVG</button>
              <button type="button" disabled={busy} onClick={() => void png('dark')}>PNG @2x</button>
              <span className="am-dl-label">Light</span>
              <button type="button" disabled={busy} onClick={() => void svg('light')}>SVG</button>
              <button type="button" disabled={busy} onClick={() => void png('light')}>PNG @2x</button>
            </div>
            <div className="am-dl-row">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void svgFor(theme).then(copyText).then((ok) =>
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
  place,
  theme,
  by,
  writable,
  store: st,
  onToast,
  onAdd,
  onEdit,
}: {
  set: IconSetRow;
  /** Which of its folders to show — the sidebar's choice; `all` shows every one, folder by folder. */
  place: 'all' | 'unfiled' | string;
  theme: Theme;
  by: string | null;
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
  /** Upload SVGs straight into this set. */
  onAdd: () => void;
  /** Open an icon made in the Glass Icon Builder there again. */
  onEdit: (icon: IconRow) => void;
}) {
  const [picked, setPicked] = useState<IconRow | null>(null);
  /** Select mode: icons toggle in and out of `selected` instead of opening. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** Which delete is waiting for its second click: the picked icon, or the selection. */
  const [arming, setArming] = useState<'one' | 'many' | null>(null);
  const [removing, setRemoving] = useState(false);
  // A custom icon is one flat shape: drawn in the page's ink, so it shows on
  // either tile. Glass icons keep their own art, per theme.
  const custom = set.id === CUSTOM_SET;
  const ink = theme === 'light' ? '#0C1424' : '#E8EBF0';
  const variant = (i: IconRow) =>
    custom ? i.svg.replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${ink}"`) : theme === 'light' && i.svgLight ? i.svgLight : i.svg;

  // The set's folders; which one shows is the sidebar's choice.
  const folders = foldersOf(set);
  const folderOf = iconFolderOf;
  const { file, saveFolders } = iconFolders(st, set, onToast);

  // The proposed filing of the glass icons (src/glassIconFolders.ts): which
  // icons are not yet where it puts them, or not yet named as it names them.
  const reorg = set.id === GLASS_SET
    ? set.icons.filter((i) => {
        const to = glassHomeOf(i);
        return to && (folderOf(i) !== to.folder || iconParts(i).name !== to.name);
      })
    : [];
  const [applying, setApplying] = useState(false);
  const [moving, setMoving] = useState(false);
  const applyFolders = async () => {
    if (!st) return;
    setApplying(false);
    setMoving(true);
    let done = 0;
    try {
      // The folders first, in their order, keeping any others that still hold icons.
      const others = foldersOf(set).filter(
        (f) => !GLASS_FOLDERS.includes(f) && set.icons.some((i) => folderOf(i) === f && !glassHomeOf(i)),
      );
      await saveFolders([...GLASS_FOLDERS, ...others]);
      for (const icon of reorg) {
        const to = glassHomeOf(icon)!;
        await st.putIcon(set.id, { ...icon, name: to.name, category: to.folder });
        done++;
      }
      onToast(`Filed ${done} glass icon${done === 1 ? '' : 's'} into the new folders.`);
    } catch (e) {
      onToast(`Filed ${done} of ${reorg.length} — ${(e as Error).message}. Apply again to finish.`);
    } finally {
      setMoving(false);
    }
  };
  /** A folder's icons, by name; null is Unfiled. */
  const iconsIn = (f: string | null) =>
    set.icons.filter((i) => folderOf(i) === f).sort((x, y) => iconParts(x).name.localeCompare(iconParts(y).name));
  // Everything, folder by folder with Unfiled last — or the one folder open.
  const sections: { folder: string | null; icons: IconRow[] }[] =
    place === 'all'
      ? [...folders, null].map((folder) => ({ folder, icons: iconsIn(folder) })).filter((x) => x.icons.length)
      : [{ folder: place === 'unfiled' ? null : place, icons: iconsIn(place === 'unfiled' ? null : place) }];

  // Icons removed elsewhere drop out of the selection.
  const live = set.icons.filter((i) => selected.has(i.id));

  const arm = (which: 'one' | 'many') => {
    setArming(which);
    setTimeout(() => setArming((a) => (a === which ? null : a)), 4000);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setArming(null);
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (icons: IconRow[]) => {
    if (!st || !icons.length) return;
    setRemoving(true);
    let done = 0;
    try {
      for (const icon of icons) {
        await st.deleteIcon(set.id, icon.id);
        done++;
      }
      onToast(icons.length === 1 ? `Removed ${iconParts(icons[0]).name}.` : `Removed ${done} icons from ${set.name}.`);
      setPicked(null);
      stopSelecting();
    } catch (e) {
      onToast(`Removed ${done} of ${icons.length} — ${(e as Error).message}`);
    } finally {
      setRemoving(false);
      setArming(null);
    }
  };

  return (
    <section className="am-set">
      <div className="am-set-head">
        <h2>{set.name}</h2>
        <span className="am-meta">
          {set.icons.length} icon{set.icons.length === 1 ? '' : 's'}
          {by ? ` · started by ${by}` : ''}
        </span>
        {writable && (
          <div className="am-set-actions">
            <button type="button" className="am-mini" onClick={onAdd}>
              Add icons
            </button>
            <button
              type="button"
              className={`am-mini${selecting ? ' am-on' : ''}`}
              aria-pressed={selecting}
              onClick={() => {
                if (selecting) stopSelecting();
                else {
                  setSelecting(true);
                  setPicked(null);
                }
              }}
            >
              {selecting ? 'Done' : 'Select'}
            </button>
            {/* Sets are not removed from the page: a set is the team's whole
                collection, and one click from a folder's delete is too close. */}
            {set.id === GLASS_SET && reorg.length > 0 && (
              <button
                type="button"
                className={`am-mini${applying ? ' am-confirming' : ''}`}
                disabled={moving}
                title="File every glass icon by what it means — src/glassIconFolders.ts"
                onClick={() => (applying ? void applyFolders() : setApplying(true))}
              >
                {moving
                  ? 'Filing…'
                  : applying
                    ? `Click again — ${reorg.length} icon${reorg.length === 1 ? '' : 's'} move or are renamed`
                    : 'Apply new folders'}
              </button>
            )}
          </div>
        )}
      </div>
      {sections.every((x) => !x.icons.length) && (
        <p className="am-empty am-pad">
          {place === 'all' ? 'No icons yet.' : 'Nothing in this folder yet — drag icons onto it in the sidebar, or select some and use Move to.'}
        </p>
      )}
      {sections.every((x) => !x.icons.length) ? null : sections.map(({ folder, icons }) => {
        const category = folder ?? 'Unfiled';
        const all = icons.every((i) => selected.has(i.id));
        return (
          <div key={category} className="am-category">
            <h3>
              {category} <span className="am-count">{icons.length}</span>
              {selecting && (
                <button
                  type="button"
                  className="am-linkish am-select-all"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const i of icons) {
                        if (all) next.delete(i.id);
                        else next.add(i.id);
                      }
                      return next;
                    })
                  }
                >
                  {all ? 'Clear' : 'Select all'}
                </button>
              )}
            </h3>
            <ul className={`am-icons ${theme}${selecting ? ' am-selecting' : ''}`}>
              {icons.map((icon) => {
                const on = selecting ? selected.has(icon.id) : picked?.id === icon.id;
                return (
                  <li key={icon.id}>
                    <button
                      type="button"
                      className={on ? 'am-on' : ''}
                      aria-pressed={selecting ? on : undefined}
                      draggable={writable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_ICON, JSON.stringify({ setId: set.id, iconId: icon.id }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        if (selecting) toggle(icon.id);
                        else {
                          setPicked(picked?.id === icon.id ? null : icon);
                          setArming(null);
                        }
                      }}
                      title={`${category} · ${iconParts(icon).name}`}
                    >
                      {selecting && <span className="am-check" aria-hidden />}
                      <img src={iconSrc(variant(icon))} alt="" loading="lazy" />
                      <span>{iconParts(icon).name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {selecting ? (
        <div className="am-icon-bar" role="region" aria-label="Selected icons">
          <b>{live.length} selected</b>
          <span className="am-meta">Click icons to add them to the selection.</span>
          <button type="button" disabled={!live.length} onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <label className="am-move" htmlFor={`move-${set.id}`}>
            <span className="am-sr">Move the selected icons to a folder</span>
            <select
              id={`move-${set.id}`}
              value=""
              disabled={!live.length}
              onChange={(e) => {
                const v = e.target.value;
                if (v) void file(live, v === '__unfiled' ? null : v).then(() => setSelected(new Set()));
              }}
            >
              <option value="">Move to…</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              <option value="__unfiled">Unfiled</option>
            </select>
          </label>
          <button
            type="button"
            className={`am-danger${arming === 'many' ? ' am-confirming' : ''}`}
            disabled={!live.length || removing}
            onClick={() => (arming === 'many' ? void remove(live) : arm('many'))}
          >
            {removing
              ? 'Removing…'
              : arming === 'many'
                ? `Click again to remove ${live.length} for everyone`
                : live.length
                  ? `Remove ${live.length} icon${live.length === 1 ? '' : 's'}`
                  : 'Remove icons'}
          </button>
        </div>
      ) : (
        picked && (
          <div className="am-icon-bar" role="region" aria-label={picked.name}>
            <b>{iconParts(picked).name}</b>
            <span className="am-meta">
              {folderOf(picked) ?? 'Unfiled'} · {picked.svgLight ? 'dark and light variants' : 'one variant'}
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
            {writable && !custom && (
              <button
                type="button"
                className="am-primary"
                onClick={() => {
                  // An icon uploaded from Figma is taken apart and opened with
                  // the MingCute icons it is drawn from (assets-site/glassLinks.ts).
                  const builder = recipeFor(picked);
                  if (builder) onEdit({ ...picked, builder });
                  else onToast(`${iconParts(picked).name} doesn't take apart into a glass and a gradient icon, so it can't open in the builder.`);
                }}
              >
                Edit in builder
              </button>
            )}
            {writable && (
              <button
                type="button"
                className={`am-danger${arming === 'one' ? ' am-confirming' : ''}`}
                disabled={removing}
                onClick={() => (arming === 'one' ? void remove([picked]) : arm('one'))}
              >
                {arming === 'one' ? 'Click again to remove it for everyone' : 'Remove'}
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}

/** The pinned bar for a selection on Illustrations or Graphics: clear, or remove with a second click. */
function SelectionBar({
  count,
  noun,
  hint,
  removing,
  onClear,
  onRemove,
}: {
  count: number;
  noun: string;
  hint: string;
  removing: boolean;
  onClear: () => void;
  onRemove: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  // A changed selection needs a fresh confirmation.
  useEffect(() => setArmed(false), [count]);
  const plural = `${noun}${count === 1 ? '' : 's'}`;
  return (
    <div className="am-icon-bar am-selection-bar" role="region" aria-label={`Selected ${noun}s`}>
      <b>{count} selected</b>
      <span className="am-meta">{hint}</span>
      <button type="button" disabled={!count} onClick={onClear}>
        Clear
      </button>
      <button
        type="button"
        className={`am-danger${armed ? ' am-confirming' : ''}`}
        disabled={!count || removing}
        onClick={() => (armed ? onRemove() : setArmed(true))}
      >
        {removing
          ? 'Removing…'
          : armed
            ? `Click again to remove ${count} for everyone`
            : count
              ? `Remove ${count} ${plural}`
              : `Remove ${noun}s`}
      </button>
    </div>
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
  // Where they can go: Glass icons and Custom icons, whether or not the
  // library has either yet, then any older set it still has.
  const groups = [
    { id: GLASS_SET, name: sets.find((x) => x.id === GLASS_SET)?.name ?? 'Glass icons' },
    { id: CUSTOM_SET, name: sets.find((x) => x.id === CUSTOM_SET)?.name ?? 'Custom icons' },
    ...sets.filter((x) => x.id !== GLASS_SET && x.id !== CUSTOM_SET).map((x) => ({ id: x.id, name: x.name })),
  ];
  // Flat 24px icons that meet the custom rule go to Custom icons; anything
  // else — glass, with its dark and light — to Glass icons.
  const allCustom = icons.every((i) => !i.svgLight && 'd' in customShape(i.svg));
  const [choice, setChoice] = useState<string>(preferGraphics ? '__graphics' : allCustom ? CUSTOM_SET : GLASS_SET);
  const [category, setCategory] = useState('');
  const toGraphics = choice === '__graphics';
  const fileCategories = [...new Set(icons.map((i) => iconParts({ name: i.name }).category))].filter(
    (c) => c !== 'Uncategorized',
  );
  const chosen = sets.find((s) => s.id === choice);
  const setCategories = chosen ? foldersOf(chosen) : [];
  const isNew = choice !== '__graphics' && !sets.some((x) => x.id === choice);
  const ready = true;

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
          onAdd({ id: choice, name: groups.find((g) => g.id === choice)!.name, isNew }, category.trim() || undefined);
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
                <img src={iconSrc(i.svg)} alt="" />
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
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id === CUSTOM_SET ? `${g.name} — flat 24px icons the builder offers beside MingCute` : g.name}
                </option>
              ))}
            </select>
          </label>
          {!toGraphics && (
            <label className="am-field" htmlFor="icon-category">
              <span>Folder</span>
              <input
                id="icon-category"
                list="icon-categories"
                value={category}
                placeholder={
                  fileCategories.length
                    ? `From the file names — ${fileCategories.slice(0, 3).join(', ')}${fileCategories.length > 3 ? '…' : ''}`
                    : 'Unfiled — or a folder, new or existing'
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

/** TOOLS — what the team makes assets with. */
function Tools({
  writable,
  onNew,
  onGlass,
}: {
  writable: boolean;
  onNew: (template: TemplateName) => void;
  onGlass: () => void;
}) {
  return (
    <div className="am-tools-grid">
      <article className="am-tool">
        <div className="am-tool-mark am-tool-mark-glass" aria-hidden />
        <div className="am-tool-body">
          <h2>Glass Icon Builder</h2>
          <p>
            Make a glass icon in the set’s own style from two of MingCute’s 1,600 icons — one as frosted glass in
            front, one as a gradient behind it — in dark and light, in one of the set’s layouts: glass, equal or
            gradient leading, or centered. Add it to the library by category, and the builder offers it as a Glass
            icon; <b>Edit in builder</b> on the icon opens it again.
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
            Compose marketing illustrations from the Liferay component library — frames, charts, badges,
            chat bubbles, glass icons — in dark and light from one document. Start blank, or from <b>Mockup</b>: a
            3:2 product screenshot with frames meeting its edges. It opens right here: saving an illustration
            puts it in this library for everyone, and <b>Edit in builder</b> on any illustration opens it again.
          </p>
          <div className="am-tool-actions">
            {writable ? (
              <NewMenu className="am-primary" onPick={onNew} />
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
  selecting,
  selected,
  onToggle,
}: {
  items: GraphicItem[];
  theme: Theme;
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
  /** Select mode: tiles toggle in and out of `selected` instead of opening. */
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  // Select mode replaces the single-graphic bar.
  useEffect(() => {
    if (selecting) setPicked(null);
  }, [selecting]);
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
      <ul className={`am-graphic-grid ${theme}${selecting ? ' am-selecting' : ''}`}>
        {items.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className={(selecting ? selected.has(g.id) : picked === g.id) ? 'am-on' : ''}
              // Built-in graphics ship with the code; they can't be removed.
              disabled={selecting && g.builtIn}
              aria-pressed={selecting ? selected.has(g.id) : undefined}
              onClick={() => (selecting ? onToggle(g.id) : setPicked(picked === g.id ? null : g.id))}
            >
              {selecting && !g.builtIn && <span className="am-check" aria-hidden />}
              <img src={svgSrc(graphicSvg(g, theme))} alt="" loading="lazy" />
              <span className="am-graphic-name">{g.name}</span>
              {g.builtIn && <span className="am-badge">Built in</span>}
            </button>
          </li>
        ))}
      </ul>
      {sel && !selecting && (
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
