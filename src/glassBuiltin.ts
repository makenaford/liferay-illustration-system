import { GLASS_ICONS, type GlassIcon } from './glassIcons.generated.ts';
import { GLASS_ICON_FOLDERS, GLASS_WAS } from './glassIconFolders.ts';

/**
 * WHICH BUILT GLASS ICON A LIBRARY COPY IS.
 *
 * The shared library holds the glass icons teams uploaded, and a copy of a
 * built icon keeps the artwork it was uploaded with. When the build updates
 * that icon (`pnpm run icons`), the copy is out of date — so wherever a copy
 * can be recognised as a built icon, the built one is drawn instead: on the
 * site's Glass icons set, in the builder's picker, and in an illustration
 * that had the copy's artwork pasted in (`migrateDoc`).
 *
 * A copy is recognised by any of the names it can have:
 *
 *   - its id, the Figma name slugged, as first uploaded: `services-chatbot`
 *   - its Figma name, "Services - Chatbot"
 *   - its folder home from GLASS_ICON_FOLDERS, as the site files it —
 *     "Customers & service - Chatbot", id `customers-service-chatbot` —
 *     which an upload into that folder takes
 *
 * An icon made in the Glass Icon Builder under a name of its own matches
 * none of these and keeps its own artwork.
 */

/** As the site slugs an upload's id (assets-site/uploads.ts `slug`). */
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const BY_NAME = new Map<string, string>();
const BY_ID = new Map<string, string>();
for (const [key, g] of Object.entries(GLASS_ICONS)) {
  BY_NAME.set(g.source.toLowerCase(), key);
  BY_ID.set(slugOf(g.source), key);
}
for (const [id, home] of Object.entries(GLASS_ICON_FOLDERS)) {
  const key = BY_ID.get(id) ?? (GLASS_WAS[id] ? BY_NAME.get(GLASS_WAS[id].toLowerCase()) : undefined);
  if (!key) continue;
  BY_NAME.set(`${home.folder} - ${home.name}`.toLowerCase(), key);
  BY_ID.set(slugOf(`${home.folder} ${home.name}`), key);
}

/** The `GLASS_ICONS` key a library glass icon is a copy of, or undefined. */
export function builtinGlassKey(row: { id?: string; category?: string; name?: string }): string | undefined {
  if (row.id) {
    const hit = BY_ID.get(row.id);
    if (hit) return hit;
  }
  if (row.name) {
    const full = row.category ? `${row.category} - ${row.name}` : row.name;
    return BY_NAME.get(full.toLowerCase());
  }
  return undefined;
}

/** A built glass icon as a standalone SVG file, the way the site offers icons for download. */
export function builtinGlassSvg(key: string, theme: 'dark' | 'light'): string | undefined {
  const g: GlassIcon | undefined = GLASS_ICONS[key];
  if (!g) return undefined;
  const art = theme === 'light' ? g.light : g.dark;
  const [x, y, w, h] = art.viewBox;
  const body = art.body.replaceAll('__NS__', `${key}-${theme[0]}-`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" fill="none">${body}</svg>`;
}
