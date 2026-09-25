import type { Doc } from '../src/document.ts';
import { migrateDoc } from '../src/migrate.ts';
import { MAX_DOC_BYTES } from './store.ts';

/**
 * UPLOADS — what a dropped or picked file becomes.
 *
 *   .json  an illustration from the builder (its `.json` button), or a
 *          library file from the builder's Export: every illustration in it
 *   .svg   an icon. Files named "… - Dark" and "… - Light" pair up into one
 *          icon with both variants, which is how the glass icons ship.
 */

export interface ParsedIcon {
  name: string;
  svg: string;
  svgLight?: string;
}

export interface Parsed {
  illustrations: Doc[];
  icons: ParsedIcon[];
  /** Files that could not be used, each with the reason, for the status line. */
  skipped: string[];
}

const isDoc = (d: unknown): d is Doc =>
  !!d && typeof (d as Doc).id === 'string' && Array.isArray((d as Doc).elements);

/**
 * Keep an uploaded SVG from running anything once someone downloads and
 * opens it. On the page icons only ever draw through `<img>`, which runs
 * nothing, so this is about the file handed on.
 */
export function cleanSvg(src: string): string | null {
  let s = src.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').trim();
  if (!/^<svg\b/i.test(s.replace(/<!--[\s\S]*?-->/g, '').trim())) return null;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, '');
  s = s.replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
  return s;
}

/** "Business - Costly - Dark.svg" -> ["Business - Costly", "dark"]. */
function variantOf(filename: string): [string, 'dark' | 'light' | null] {
  const base = filename.replace(/\.svg$/i, '').trim();
  const m = base.match(/^(.*?)[\s_-]*[-–_ ]\s*(dark|light)$/i);
  return m ? [m[1].trim(), m[2].toLowerCase() as 'dark' | 'light'] : [base, null];
}

export async function parseFiles(files: File[]): Promise<Parsed> {
  const out: Parsed = { illustrations: [], icons: [], skipped: [] };
  const pairs = new Map<string, { dark?: string; light?: string; plain?: string }>();

  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.json')) {
        const data = JSON.parse(await file.text()) as unknown;
        const docs = isDoc(data)
          ? [data]
          : Array.isArray((data as { docs?: unknown[] }).docs)
            ? ((data as { docs: unknown[] }).docs.filter(isDoc) as Doc[])
            : [];
        if (!docs.length) {
          out.skipped.push(`${file.name}: not an illustration from the builder`);
          continue;
        }
        for (const d of docs) {
          const doc = migrateDoc(d);
          if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
            out.skipped.push(`${doc.name}: over 250 KB — usually a large embedded photo; shrink it in the builder`);
            continue;
          }
          out.illustrations.push(doc);
        }
      } else if (lower.endsWith('.svg')) {
        const svg = cleanSvg(await file.text());
        if (!svg) {
          out.skipped.push(`${file.name}: not an SVG file`);
          continue;
        }
        if (svg.length > MAX_DOC_BYTES / 2) {
          out.skipped.push(`${file.name}: over 125 KB, too large for an icon`);
          continue;
        }
        const [name, variant] = variantOf(file.name);
        const slot = pairs.get(name) ?? {};
        slot[variant ?? 'plain'] = svg;
        pairs.set(name, slot);
      } else {
        out.skipped.push(`${file.name}: only builder .json files and .svg icons can be added`);
      }
    } catch {
      out.skipped.push(`${file.name}: could not be read`);
    }
  }

  for (const [name, v] of pairs) {
    const svg = v.dark ?? v.plain ?? v.light!;
    const svgLight = v.dark && v.light ? v.light : undefined;
    out.icons.push({ name, svg, ...(svgLight ? { svgLight } : {}) });
  }
  out.icons.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** A URL-safe id from a name. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';

/** An `<img>` source for SVG markup. */
export const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
