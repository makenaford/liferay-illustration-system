import type { Doc } from '../src/document.ts';
import { fontWeights, renderDocument, type RenderOptions } from '../src/render.ts';
import type { ThemeName } from '../src/tokens.ts';
import { collectStrings, translateDoc, type Lang } from '../src/translate.ts';

/**
 * The translated export, on the page's side — see src/translate.ts for the
 * model and cloudflare/Translate.ts for the Worker.
 *
 * Machine translation and the Japanese font both come from the Worker, as a
 * `translate` capability the Cloudflare runtime installs (cloudflare/
 * runtime.ts). In the Artifact build or local Vite there is none, and the
 * dialog says so rather than offering a button that cannot work.
 */

interface TranslateNamespace {
  strings(to: Lang, strings: string[]): Promise<string[]>;
  /** Noto Sans JP at `weight`, cut to the characters of `text`, base64 woff2. */
  font(weight: number, text: string): Promise<string>;
}

let cached: Promise<TranslateNamespace | null> | undefined;

export function translator(): Promise<TranslateNamespace | null> {
  if (!cached) {
    const use = window.claude?.use;
    cached = use
      ? Promise.resolve(use.call(window.claude, 'translate'))
          .then((ns) => (ns as TranslateNamespace) ?? null)
          .catch(() => null)
      : Promise.resolve(null);
  }
  return cached;
}

/** Characters Source Sans 3 cannot draw — what the fallback face has to cover. */
const needsFallback = (s: string) => [...s].filter((ch) => ch.codePointAt(0)! > 0x24f).join('');

/*
 * Fonts fetched this session, by weight and character set, so switching
 * theme or format does not refetch.
 */
const faces = new Map<string, Promise<string>>();

/**
 * The export SVG of `doc` in `lang`, from the reviewed `table`. A Japanese
 * export embeds Noto Sans JP, cut to exactly the characters it draws.
 */
export async function renderTranslated(
  doc: Doc,
  lang: Lang,
  table: Record<string, string>,
  theme: ThemeName,
): Promise<string> {
  const translated = translateDoc(doc, table);
  const options: RenderOptions = {};

  // From what the copy draws, not the whole table: a stale entry adds nothing.
  const chars = [...new Set(needsFallback(collectStrings(translated).join('')))].sort().join('');
  if (lang === 'ja' && chars) {
    const t = await translator();
    if (!t) throw new Error('the Japanese font is only available on the Marketing Assets site');
    // Only the weights the Japanese is set in: a bold figure needs no Japanese bold.
    const weights = fontWeights(translated, theme, (text) => needsFallback(text) !== '');
    const got = await Promise.all(
      weights.map((w) => {
        const key = `${w}:${chars}`;
        if (!faces.has(key)) {
          const p = t.font(w, chars);
          p.catch(() => faces.delete(key));
          faces.set(key, p);
        }
        return faces.get(key)!.then((b64) => [w, b64] as const);
      }),
    );
    options.fallbackFont = { family: 'Noto Sans JP', faces: Object.fromEntries(got) };
  }
  return renderDocument(translated, theme, options);
}

/**
 * The document's reviewed table for `lang`, with a machine draft for every
 * string it lacks — for a download from the library, where nobody reviews.
 * `drafted` counts the strings nobody has checked.
 */
export async function tableFor(doc: Doc, lang: Lang): Promise<{ table: Record<string, string>; drafted: number }> {
  const reviewed = doc.translations?.[lang] ?? {};
  const missing = collectStrings(doc).filter((s) => !reviewed[s]?.trim());
  if (!missing.length) return { table: reviewed, drafted: 0 };
  const t = await translator();
  if (!t) return { table: reviewed, drafted: 0 };
  const out = await t.strings(lang, missing);
  return { table: { ...reviewed, ...Object.fromEntries(missing.map((s, i) => [s, out[i]])) }, drafted: missing.length };
}
