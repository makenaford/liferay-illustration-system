import type { Doc, Element } from '../src/document.ts';
import {
  appendTo,
  commit,
  elementAt,
  getState,
  insertAfter,
  isContainer,
  parentOf,
  removeAt,
  setUI,
} from './state.ts';
import { movedDeep } from './geometry.ts';

/**
 * COPY / CUT / PASTE / DUPLICATE.
 *
 * Two clipboards, deliberately:
 *
 *   - an in-memory one, which always works and remembers *where* the element
 *     came from, so pasting into a different card can preserve the element's
 *     offset within its container rather than its absolute canvas position;
 *   - the system clipboard, as JSON, so an element can move between two
 *     documents, two browser tabs, or into a code review.
 *
 * ON READING THE SYSTEM CLIPBOARD: `navigator.clipboard.readText()` is
 * permission-gated and is refused outright in plenty of contexts — it was
 * denied the first time this was tested, which would have made cross-document
 * paste silently dead. The native `copy`/`cut`/`paste` events carry
 * `clipboardData` with no permission prompt at all, so those are the primary
 * path and the async API is only a best-effort mirror for the toolbar button.
 */

const TAG = '__illustrationElement';
const CASCADE = 8;

interface ClipEntry {
  element: Element;
  /** Container the element was copied out of, if any. */
  sourceOrigin: { x: number; y: number } | null;
  /** Bumped on each paste so repeated pastes cascade instead of stacking. */
  pastes: number;
}

let clip: ClipEntry | null = null;

/** Origin of a container element, used to rebase a paste into a new parent. */
function originOf(doc: Doc, path: string | null): { x: number; y: number } | null {
  if (!path) return null;
  const el = elementAt(doc, path);
  if (!el || !isContainer(el)) return null;
  const c = el as unknown as { x: number; y: number };
  return { x: c.x, y: c.y };
}

function describe(el: Element): string {
  const e = el as unknown as Record<string, unknown>;
  for (const k of ['content', 'label', 'value', 'placeholder', 'name']) {
    if (typeof e[k] === 'string' && e[k]) return `${el.type} “${e[k] as string}”`;
  }
  return el.type;
}

export function serialise(el: Element): string {
  return JSON.stringify({ [TAG]: el }, null, 2);
}

/** Parse an element out of arbitrary clipboard text, or null. */
export function deserialise(text: string | null | undefined): Element | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const candidate = (parsed[TAG] ?? parsed) as Element;
    if (candidate && typeof candidate === 'object' && typeof candidate.type === 'string') {
      return candidate;
    }
  } catch {
    // Not JSON, or not one of ours.
  }
  return null;
}

/**
 * Put the selection on both clipboards. Returns the JSON payload so a native
 * `copy` handler can hand it to `clipboardData`, plus a label for the UI.
 */
export function copySelected(): { label: string; payload: string } | null {
  const { doc, selected } = getState();
  if (!selected) return null;
  const el = elementAt(doc, selected);
  if (!el) return null;

  clip = {
    element: structuredClone(el),
    sourceOrigin: originOf(doc, parentOf(selected)),
    pastes: 0,
  };

  return { label: describe(el), payload: serialise(clip.element) };
}

export function cutSelected(): { label: string; payload: string } | null {
  const copied = copySelected();
  if (!copied) return null;
  const { doc, selected } = getState();
  commit(removeAt(doc, selected!));
  setUI({ selected: null });
  return copied;
}

export function duplicateSelected(): string | null {
  const { doc, selected } = getState();
  if (!selected) return null;
  const el = elementAt(doc, selected);
  if (!el) return null;

  // Offset so the copy is visibly distinct, and land it directly above the
  // original in draw order — which is what "duplicate" means visually.
  const copy = movedDeep(structuredClone(el), CASCADE, CASCADE);
  const { doc: next, path } = insertAfter(doc, selected, copy);
  commit(next);
  setUI({ selected: path });
  return describe(el);
}

/**
 * Paste. `text` is the system clipboard's contents when called from a native
 * `paste` event; pass null to use the in-memory clipboard.
 */
export function paste(text?: string | null): string | null {
  const { doc, selected } = getState();

  const external = deserialise(text);
  const sameAsMemory =
    external !== null && clip !== null && JSON.stringify(external) === JSON.stringify(clip.element);

  // Prefer the in-memory entry when they hold the same element, because only
  // it knows which container the element came out of.
  const entry: ClipEntry | null =
    external !== null && !sameAsMemory
      ? { element: external, sourceOrigin: null, pastes: 0 }
      : clip;
  if (!entry) return null;

  const sel = elementAt(doc, selected);

  // Selecting a container pastes inside it; selecting anything else pastes as
  // its next sibling. This matches how the library palette already behaves.
  const intoContainer = isContainer(sel) ? selected : null;
  const targetParent = intoContainer ?? parentOf(selected ?? '');

  let element = structuredClone(entry.element);
  const targetOrigin = originOf(doc, targetParent);

  if (entry.sourceOrigin && targetOrigin) {
    // Moving between containers: keep the element's offset within its card
    // rather than its absolute position, so it lands where it "was".
    element = movedDeep(
      element,
      targetOrigin.x - entry.sourceOrigin.x,
      targetOrigin.y - entry.sourceOrigin.y,
    );
    // Pasting back into the same card would land exactly on the original.
    if (targetOrigin.x === entry.sourceOrigin.x && targetOrigin.y === entry.sourceOrigin.y) {
      const step = CASCADE * (entry.pastes + 1);
      element = movedDeep(element, step, step);
    }
  } else {
    const step = CASCADE * (entry.pastes + 1);
    element = movedDeep(element, step, step);
  }

  const result =
    intoContainer !== null
      ? appendTo(doc, intoContainer, element)
      : selected !== null
        ? insertAfter(doc, selected, element)
        : appendTo(doc, null, element);

  commit(result.doc);
  setUI({ selected: result.path });
  entry.pastes += 1;
  if (entry !== clip) clip = entry;

  return describe(element);
}

export const hasClipboard = () => clip !== null;
