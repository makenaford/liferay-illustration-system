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
export function translateDoc(doc: Doc, table: Record<string, string>): Doc {
  const f: Visit = (s) => table[s]?.trim() || s;
  const { translations: _, machineTranslated: __, ...rest } = doc;
  return fitTranslation(rest, { ...rest, elements: doc.elements.map((el) => visitElement(el, f)) });
}
