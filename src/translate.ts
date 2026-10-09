import type { Doc, Element } from './document.ts';
import { fitTranslation } from './fit.ts';

/**
 * TRANSLATED EXPORTS — the same illustration, its copy in another language.
 *
 * A translation is never applied to the document itself. It is a table from
 * each source string to its translation, kept on the document under
 * `translations` (which the renderer never reads), and `translateDoc` makes a
 * translated COPY at export time. So the illustration stays in English in the
 * library and on the canvas, and a correction made to one translation is
 * remembered for the next export.
 *
 * Keyed by the string rather than by where it sits, so moving or duplicating
 * an element keeps its translation, and "Deploy" used twice is translated
 * once. A string with no entry exports as it is.
 */

export const LANGUAGES = {
  ja: { name: 'Japanese', native: '日本語' },
  es: { name: 'Spanish', native: 'Español' },
} as const;

export type Lang = keyof typeof LANGUAGES;

/** Source string -> translation, per language. */
export type Translations = Partial<Record<Lang, Record<string, string>>>;

/**
 * Copy worth translating: it has a word in it. Figures, currencies,
 * percentages and "15x" are the same in every language, and leaving them out
 * keeps a machine translation from "localising" a number.
 */
export const isCopy = (s: string) => /\p{L}{2,}/u.test(s);

/*
 * Every string an element draws, as a get/set pair over a copy. One place
 * lists them, so collecting and replacing cannot disagree. Names in a chat
 * bubble and avatar initials are people, not copy, and are left alone.
 */
type Visit = (s: string) => string;

function visitElement(el: Element, f: Visit): Element {
  const list = (xs: string[] | undefined) => xs?.map(f);
  switch (el.type) {
    case 'text':
      return { ...el, content: f(el.content) };
    case 'pill':
    case 'badge':
      return { ...el, label: f(el.label) };
    case 'button':
      return { ...el, label: f(el.label), lines: list(el.lines) };
    case 'input':
      return { ...el, placeholder: f(el.placeholder) };
    case 'radio':
      return { ...el, label: f(el.label) };
    case 'dropdown':
      return { ...el, label: el.label === undefined ? undefined : f(el.label), items: el.items.map((i) => ({ ...i, label: f(i.label) })) };
    case 'field':
      return {
        ...el,
        label: el.label === undefined ? undefined : f(el.label),
        value: el.value === undefined ? undefined : f(el.value),
        lines: list(el.lines),
        placeholder: el.placeholder === undefined ? undefined : f(el.placeholder),
      };
    case 'chat':
      return { ...el, message: f(el.message) };
    case 'chrome':
      return el.title === undefined ? el : { ...el, title: f(el.title) };
    case 'lineChart':
    case 'barChart':
      return { ...el, labels: list(el.labels) };
    case 'progress':
      return el.label === undefined ? el : { ...el, label: f(el.label) };
    case 'stat':
      return { ...el, value: f(el.value), label: el.label === undefined ? undefined : f(el.label) };
    case 'table':
      return {
        ...el,
        columns: el.columns.map((c) => ({ ...c, label: f(c.label) })),
        // A bar column's cells are the numbers its bars are drawn from.
        rows: el.rows.map((row) => row.map((cell, i) => (el.columns[i]?.kind === 'bar' ? cell : f(cell)))),
      };
    case 'card':
    case 'subCard':
    case 'group':
      return el.children ? { ...el, children: el.children.map((c) => visitElement(c, f)) } : el;
    default:
      return el;
  }
}

/** The document's distinct copy, in reading order. */
export function collectStrings(doc: Doc): string[] {
  const seen = new Set<string>();
  const f: Visit = (s) => {
    const t = s.trim();
    if (t && isCopy(t)) seen.add(s);
    return s;
  };
  doc.elements.forEach((el) => visitElement(el, f));
  return [...seen];
}

/**
 * The document with its copy in `lang`, for export. The original is not
 * touched; `translations` is dropped from the copy so it never ships.
 * Every element is refitted to its translated copy — a button whose label
 * got longer gets wider — see src/fit.ts.
 */
export function translateDoc(doc: Doc, table: Record<string, string>, opts: { canvas?: boolean } = {}): Doc {
  const f: Visit = (s) => table[s]?.trim() || s;
  const { translations: _, machineTranslated: __, localized: ___, ...rest } = doc;
  return fitTranslation(rest, { ...rest, elements: doc.elements.map((el) => visitElement(el, f)) }, opts);
}

/* ---- edited versions ----------------------------------------------------- */

/**
 * An illustration's own version in one language, edited by hand — to break
 * a line differently, nudge a card, shorten a label — and saved for everyone
 * (`Doc.localized`). Where there is one, it is what that language shows and
 * downloads, in place of the automatic translation. The English is never
 * touched by it. `from` is the English it was made from (`fingerprint`), so
 * a change to the English can be flagged.
 */
export interface Localized {
  elements: Element[];
  panels?: Doc['panels'];
  canvas: Doc['canvas'];
  artboard?: Doc['artboard'];
  glow?: Doc['glow'];
  mockup?: Doc['mockup'];
  cardArea?: Doc['cardArea'];
  from: string;
  savedAt: number;
}

/** What shape the English is and what it says — changes when either does. */
export function fingerprint(doc: Doc): string {
  const shape = (els: Element[]): unknown[] =>
    els.map((e) => [e.type, ...((e as { children?: Element[] }).children ? [shape((e as { children: Element[] }).children)] : [])]);
  const text = JSON.stringify([shape(doc.elements), collectStrings(doc)]);
  // FNV-1a: short and stable, not a secret.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The document as `lang` shows it: its edited version if it has one, else translated by `table`. */
export function localizedDoc(doc: Doc, lang: Lang, table: Record<string, string>): Doc {
  const own = doc.localized?.[lang];
  if (!own) return translateDoc(doc, table);
  const { translations: _, machineTranslated: __, localized: ___, ...rest } = doc;
  const { from: _f, savedAt: _s, ...drawing } = own;
  return { ...rest, ...drawing };
}

/** Whether `lang`'s edited version was made from different English than the document has now. */
export const isStale = (doc: Doc, lang: Lang) => !!doc.localized?.[lang] && doc.localized[lang]!.from !== fingerprint(doc);

/** `english` with `working` saved as its `lang` version. */
export function withLocalized(english: Doc, lang: Lang, working: Doc, savedAt: number): Doc {
  const own: Localized = {
    elements: working.elements,
    panels: working.panels,
    canvas: working.canvas,
    artboard: working.artboard,
    glow: working.glow,
    mockup: working.mockup,
    cardArea: working.cardArea,
    from: fingerprint(english),
    savedAt,
  };
  // What is the document's own and no one language's — its name, its themes,
  // its background — is the document's whichever language it was changed
  // in. Kept only in the working copy, a rename made while editing Japanese
  // was dropped on save.
  const {
    elements: _e, panels: _p, canvas: _c, artboard: _a, glow: _g, mockup: _m, cardArea: _ca,
    id: _id, translations: _t, machineTranslated: _mt, localized: _l,
    ...document
  } = working;
  return { ...english, ...document, localized: { ...english.localized, [lang]: own } };
}

/** `english` without its `lang` version — back to the automatic translation. */
export function withoutLocalized(english: Doc, lang: Lang): Doc {
  const { [lang]: _, ...others } = english.localized ?? {};
  const { localized: __, ...rest } = english;
  return Object.keys(others).length ? { ...rest, localized: others } : rest;
}

/** Whether the copy is itself Japanese — a translated copy, with no English to translate. */
export const writtenInJapanese = (doc: Doc) => collectStrings(doc).some((s) => /[\u3040-\u30ff\u3400-\u9fff]/.test(s));

/** `doc` with its `lang` version made the document itself, and that version gone. */
export function adoptLocalized(doc: Doc, lang: Lang): Doc {
  const own = doc.localized?.[lang];
  if (!own) return doc;
  const { from: _f, savedAt: _s, ...drawing } = own;
  return { ...withoutLocalized(doc, lang), ...drawing };
}
