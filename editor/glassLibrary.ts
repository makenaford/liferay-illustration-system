import type { GraphicArt } from '../src/document.ts';
import { GLASS_ICONS } from '../src/glassIcons.generated.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';

/**
 * GLASS ICONS FROM THE LIBRARY — the Marketing Assets site's Glass icons set
 * (shared database, `iconSets/glass-icons/icons`), which is what the builder
 * offers when it runs inside that site: an icon removed there is no longer
 * offered. One the builder also ships (the same "Category - Name") is
 * offered as the shipped icon, `builtin`, so documents keep referring to it
 * by name; the rest are made portable here (src/figmaGlass.ts) and carried in
 * the document.
 */
export interface LibraryGlassIcon {
  id: string;
  label: string;
  category: string;
  dark: GraphicArt;
  light: GraphicArt;
  /** The shipped icon this is, by key into GLASS_ICONS. */
  builtin?: string;
  /** The file as it is stored, in each variant — what a dropped file is matched against. */
  raw: { dark: string; light: string };
}

/** The library's glass icons, or null when there is no library — the builder on its own. */
export type LibraryGlass = LibraryGlassIcon[] | null;

interface Row {
  id?: string;
  name?: string;
  category?: string;
  svg?: string;
  svgLight?: string;
}

interface DbLike {
  collection(path: string): {
    get(): Promise<{ docs: { data(): Record<string, unknown> | undefined }[] }>;
  };
}

const SHIPPED = new Map(Object.entries(GLASS_ICONS).map(([key, g]) => [g.source, key]));
/** The same, by library id — the Figma name slugged, as the site files uploads — which survives a move or rename. */
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const SHIPPED_BY_ID = new Map(Object.entries(GLASS_ICONS).map(([key, g]) => [slugOf(g.source), key]));

function parts(r: Row): { category: string; name: string } {
  if (r.category) return { category: r.category, name: r.name ?? '' };
  const n = r.name ?? '';
  const i = n.indexOf(' - ');
  return i > 0 ? { category: n.slice(0, i), name: n.slice(i + 3) } : { category: 'Uncategorized', name: n };
}

let cached: Promise<LibraryGlass> | undefined;

export function libraryGlassIcons(refresh = false): Promise<LibraryGlass> {
  if (!cached || refresh) {
    const c = (window as { claude?: { use?(n: string): Promise<unknown> } }).claude;
    cached = (async () => {
      const db = c?.use ? ((await c.use('db')) as DbLike | null) : null;
      let rows: Row[] | null;
      if (db) {
        // No set at all — the standalone builder's own database — is no
        // library, not an empty one: the builder then offers its own set.
        const docs = (await db.collection('iconSets/glass-icons/icons').get()).docs;
        rows = docs.length ? docs.map((d) => d.data() as Row) : null;
      } else {
        // Run locally, the Marketing Assets site keeps its icon sets in this browser.
        try {
          const raw = localStorage.getItem('marketing-assets-icons');
          const sets = raw ? (JSON.parse(raw) as { id: string; icons: Row[] }[]) : null;
          rows = sets?.find((s) => s.id === 'glass-icons')?.icons ?? null;
        } catch {
          rows = null;
        }
      }
      if (!rows) return null;
      return rows
        .filter((r) => r?.id && r.svg && r.svgLight)
        .map((r) => {
          const p = parts(r);
          return {
            id: r.id!,
            label: p.name,
            category: p.category,
            dark: normaliseFigmaSvg(r.svg!, `lg-${r.id}-d-`),
            light: normaliseFigmaSvg(r.svgLight!, `lg-${r.id}-l-`),
            builtin: SHIPPED_BY_ID.get(r.id!) ?? SHIPPED.get(`${p.category} - ${p.name}`),
            raw: { dark: r.svg!, light: r.svgLight! },
          };
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
    })().catch(() => null);
  }
  return cached;
}

/**
 * The library glass icon a file is, by its contents — either variant, as the
 * site downloads them — or null. So a glass icon dropped on the canvas comes
 * in as a glass icon, with both variants, and follows the theme, rather than
 * as a flat SVG of whichever variant was downloaded.
 */
export async function glassIconForSvg(svg: string): Promise<LibraryGlassIcon | null> {
  const icons = await libraryGlassIcons();
  const text = svg.trim();
  return icons?.find((g) => g.raw.dark.trim() === text || g.raw.light.trim() === text) ?? null;
}
