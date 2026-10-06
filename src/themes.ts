import type { Doc } from './document.ts';
import type { ThemeName } from './tokens.ts';

/**
 * WHICH THEMES AN ILLUSTRATION COMES IN — both, or only one.
 *
 * `Doc.onlyTheme` says so for one illustration. Without it, the folder it is
 * filed in can: every illustration in an Industry folder is dark only, so a
 * new one filed there needs no setting of its own. `both` on the document
 * overrides the folder, for the one industry illustration that has a light
 * version after all. What comes back is what the library shows, what every
 * download writes and what the builder offers — never an empty list.
 */
const FOLDER_DEFAULTS: { match: RegExp; only: ThemeName }[] = [{ match: /^industr/i, only: 'dark' }];

export const BOTH: ThemeName[] = ['dark', 'light'];

/**
 * The folder default for a folder named `name`, if it has one. Given a path
 * — the folder's names from the top level down — the nearest folder that has
 * one decides, so a subfolder of Industries is dark-only too.
 */
export function folderTheme(name: string | readonly string[] | null | undefined): ThemeName | undefined {
  if (!name) return undefined;
  for (const n of typeof name === 'string' ? [name] : [...name].reverse()) {
    const only = FOLDER_DEFAULTS.find((d) => d.match.test(n.trim()))?.only;
    if (only) return only;
  }
  return undefined;
}

export function themesOf(doc: Pick<Doc, 'onlyTheme'>, folderName?: string | readonly string[] | null): ThemeName[] {
  const only = doc.onlyTheme ?? folderTheme(folderName);
  return only === 'dark' || only === 'light' ? [only] : BOTH;
}

/** `wanted` when the illustration comes in it, otherwise the one it does. */
export const themeFor = (allowed: ThemeName[], wanted: ThemeName): ThemeName =>
  allowed.includes(wanted) ? wanted : allowed[0];
