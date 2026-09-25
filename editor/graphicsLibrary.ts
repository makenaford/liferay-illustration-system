import type { GraphicArt } from '../src/document.ts';

/**
 * GRAPHICS FROM THE LIBRARY — the ones the team uploaded to the Marketing
 * Assets site, which the builder can use when it runs inside that site
 * (they share its database, `graphics/<id>`). Anywhere else — the standalone
 * builder, GitHub Pages — there are none, and only the built-in graphics show.
 */
export interface LibraryGraphic {
  id: string;
  label: string;
  dark: GraphicArt;
  light: GraphicArt;
}

interface DbLike {
  collection(path: string): {
    get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }>;
  };
}

let cached: Promise<LibraryGraphic[]> | undefined;

export function libraryGraphics(refresh = false): Promise<LibraryGraphic[]> {
  if (!cached || refresh) {
    const c = (window as { claude?: { use?(n: string): Promise<unknown> } }).claude;
    cached = (async () => {
      const db = c?.use ? ((await c.use('db')) as DbLike | null) : null;
      // Run locally, the Marketing Assets site keeps its graphics in this
      // browser (assets-site/store.ts); the builder reads the same place.
      const rows: unknown[] = db
        ? (await db.collection('graphics').get()).docs.map((d) => d.data())
        : (() => {
            try {
              const v = JSON.parse(localStorage.getItem('marketing-assets-graphics') ?? '[]');
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          })();
      return rows
        .map((d) => d as { id?: string; name?: string; dark?: GraphicArt; light?: GraphicArt } | undefined)
        .filter((g): g is { id: string; name: string; dark: GraphicArt; light: GraphicArt } => !!g?.id && !!g.dark)
        .map((g) => ({ id: g.id, label: g.name, dark: g.dark, light: g.light ?? g.dark }))
        .sort((a, b) => a.label.localeCompare(b.label));
    })().catch(() => []);
  }
  return cached;
}
