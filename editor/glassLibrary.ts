import type { GraphicArt } from '../src/document.ts';
import { GLASS_ICONS } from '../src/glassIcons.generated.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';

/**
 * GLASS ICONS FROM THE LIBRARY — ones the team added to the Marketing Assets
 * site's Glass icons set, or made with its Glass Icon Builder, which the
 * builder offers when it runs inside that site (shared database,
 * `iconSets/glass-icons/icons`). Icons the builder already ships are left
 * out, so nothing is listed twice. Made portable here, the same way the
 * shipped set is (src/figmaGlass.ts).
 */
export interface LibraryGlassIcon {
  id: string;
  label: string;
  category: string;
  dark: GraphicArt;
  light: GraphicArt;
}

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

const SHIPPED = new Set(Object.values(GLASS_ICONS).map((g) => g.source));

function parts(r: Row): { category: string; name: string } {
  if (r.category) return { category: r.category, name: r.name ?? '' };
  const n = r.name ?? '';
  const i = n.indexOf(' - ');
  return i > 0 ? { category: n.slice(0, i), name: n.slice(i + 3) } : { category: 'Uncategorized', name: n };
}

let cached: Promise<LibraryGlassIcon[]> | undefined;

export function libraryGlassIcons(refresh = false): Promise<LibraryGlassIcon[]> {
  if (!cached || refresh) {
    const c = (window as { claude?: { use?(n: string): Promise<unknown> } }).claude;
    cached = (async () => {
      const db = c?.use ? ((await c.use('db')) as DbLike | null) : null;
      let rows: Row[];
      if (db) {
        rows = (await db.collection('iconSets/glass-icons/icons').get()).docs.map((d) => d.data() as Row);
      } else {
        // Run locally, the Marketing Assets site keeps its icon sets in this browser.
        try {
          const sets = JSON.parse(localStorage.getItem('marketing-assets-icons') ?? '[]') as { id: string; icons: Row[] }[];
          rows = sets.find((s) => s.id === 'glass-icons')?.icons ?? [];
        } catch {
          rows = [];
        }
      }
      return rows
        .filter((r) => r?.id && r.svg && r.svgLight)
        .filter((r) => {
          const p = parts(r);
          return !SHIPPED.has(`${p.category} - ${p.name}`);
        })
        .map((r) => {
          const p = parts(r);
          return {
            id: r.id!,
            label: p.name,
            category: p.category,
            dark: normaliseFigmaSvg(r.svg!, `lg-${r.id}-d-`),
            light: normaliseFigmaSvg(r.svgLight!, `lg-${r.id}-l-`),
          };
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
    })().catch(() => []);
  }
  return cached;
}
