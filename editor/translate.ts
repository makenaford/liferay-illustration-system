import type { Doc } from '../src/document.ts';
import { fontWeights, renderDocument, type RenderOptions } from '../src/render.ts';
import type { ThemeName } from '../src/tokens.ts';
import { collectStrings, LANGUAGES, localizedDoc, type Lang, type Translations } from '../src/translate.ts';

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
  /** For Figma's import — see `RenderOptions.figma`. */
  figma = false,
): Promise<string> {
  // Its edited version in `lang`, where it has one.
  const translated = localizedDoc(doc, lang, table);
  const options: RenderOptions = { figma };

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

/*
 * DRAFTS — machine translations nobody has reviewed, kept per language and
 * shared by every illustration, so "Dashboard" is translated once for the
 * whole library, and switching back to a language is instant. Kept in this
 * browser (a per-viewer convenience: a draft is cheap to make again), and
 * never written to a document — only a review in the builder does that.
 */
const DRAFTS_KEY = 'translation-drafts-v1';
type Drafts = Partial<Record<Lang, Record<string, string>>>;
const drafts: Drafts = (() => {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}') as Drafts;
  } catch {
    return {};
  }
})();
const keepDrafts = () => {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* storage full or blocked: the drafts last the session */
  }
};

/** The table a document draws in `lang` with: its reviewed strings, drafts for the rest. */
export function tableNow(doc: Doc, lang: Lang): { table: Record<string, string>; drafted: number; missing: number } {
  const reviewed = doc.translations?.[lang] ?? {};
  const known = drafts[lang] ?? {};
  const table: Record<string, string> = {};
  let drafted = 0;
  let missing = 0;
  const machine = new Set(doc.machineTranslated?.[lang] ?? []);
  for (const s of collectStrings(doc)) {
    if (reviewed[s]?.trim()) {
      table[s] = reviewed[s];
      if (machine.has(s)) drafted++;
    }
    else if (known[s]) {
      table[s] = known[s];
      drafted++;
    } else missing++;
  }
  return { table, drafted, missing };
}

/** Strings per request, and requests at once: a library is hundreds of strings. */
const CHUNK = 40;
const AT_ONCE = 4;
const inFlight = new Map<string, Promise<void>>();

/**
 * Draft every string in `docs` that has neither a review nor a draft in
 * `lang`, `AT_ONCE` requests at a time. `onProgress` is called as each
 * request lands, with how many strings are still to come, so the library can
 * redraw as translations arrive rather than all at the end.
 */
export async function draftAll(docs: Doc[], lang: Lang, onProgress: (remaining: number) => void): Promise<void> {
  const t = await translator();
  if (!t) return;
  const known = (drafts[lang] ??= {});
  const todo = [
    ...new Set(
      docs.flatMap((d) => {
        const reviewed = d.translations?.[lang] ?? {};
        return collectStrings(d).filter((s) => !reviewed[s]?.trim() && !known[s]);
      }),
    ),
  ];
  let remaining = todo.length;
  onProgress(remaining);
  const chunks: string[][] = [];
  for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));
  const run = async (chunk: string[]) => {
    const key = `${lang}:${chunk.join('\u0000')}`;
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        t.strings(lang, chunk).then((out) => {
          chunk.forEach((s, i) => (known[s] = out[i]));
          keepDrafts();
        }).finally(() => inFlight.delete(key)),
      );
    }
    await inFlight.get(key);
    remaining -= chunk.length;
    onProgress(remaining);
  };
  const queue = [...chunks];
  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) await run(c);
    }),
  );
}

/**
 * The document's reviewed table for `lang`, with a machine draft for every
 * string it lacks — for a download from the library, where nobody reviews.
 * `drafted` counts the strings nobody has checked.
 */
export async function tableFor(doc: Doc, lang: Lang): Promise<{ table: Record<string, string>; drafted: number }> {
  if (tableNow(doc, lang).missing) await draftAll([doc], lang, () => {});
  const { table, drafted } = tableNow(doc, lang);
  return { table, drafted };
}

/* ---- on save ----------------------------------------------------------- */

type Additions = Partial<Record<Lang, Record<string, string>>>;

/**
 * Machine translations for every string `doc` has no translation of, in
 * every language — what a save sets off, so an illustration is translated
 * as soon as it exists and whoever made it only has to correct it. Null
 * where there is no translator (the Artifact build, local Vite).
 */
export async function draftMissing(doc: Doc): Promise<Additions | null> {
  if (!(await translator())) return null;
  const strings = collectStrings(doc);
  const out: Additions = {};
  for (const lang of Object.keys(LANGUAGES) as Lang[]) {
    const have = doc.translations?.[lang] ?? {};
    const missing = strings.filter((s) => !have[s]?.trim());
    if (!missing.length) continue;
    await draftAll([doc], lang, () => {});
    const known = drafts[lang] ?? {};
    const got = Object.fromEntries(missing.filter((s) => known[s]).map((s) => [s, known[s]]));
    if (Object.keys(got).length) out[lang] = got;
  }
  return out;
}

/**
 * `doc` with `additions` merged in — onto the document as it is now, which
 * may have changed while they were made: a string edited away since takes
 * nothing, one translated by hand meanwhile keeps its translation. What it
 * no longer has is dropped from its translations, so they do not pile up as
 * the copy changes. Added strings are marked as machine drafts.
 */
export function withTranslations(doc: Doc, additions: Additions): { doc: Doc; added: number } {
  const strings = new Set(collectStrings(doc));
  const translations: Translations = {};
  const machine: Partial<Record<Lang, string[]>> = {};
  let added = 0;
  for (const lang of Object.keys(LANGUAGES) as Lang[]) {
    const table: Record<string, string> = {};
    const drafted = new Set((doc.machineTranslated?.[lang] ?? []).filter((s) => strings.has(s)));
    for (const [s, t] of Object.entries(doc.translations?.[lang] ?? {})) if (strings.has(s) && t.trim()) table[s] = t;
    for (const [s, t] of Object.entries(additions[lang] ?? {})) {
      if (!strings.has(s) || table[s]) continue;
      table[s] = t;
      drafted.add(s);
      added++;
    }
    if (Object.keys(table).length) translations[lang] = table;
    if (drafted.size) machine[lang] = [...drafted];
  }
  return {
    doc: {
      ...doc,
      translations: Object.keys(translations).length ? translations : undefined,
      machineTranslated: Object.keys(machine).length ? machine : undefined,
    },
    added,
  };
}
