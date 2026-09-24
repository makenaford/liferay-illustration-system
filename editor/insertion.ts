import type { Doc, Element } from '../src/document.ts';
import { commit, elementAt, isContainer, parentOf, replaceAt, setUI } from './state.ts';

/**
 * WHERE NEW THINGS GO — the rule shared by the Library and file drops.
 *
 * Content belongs in the card you are working in. So an addition goes into
 * the selected container, or — when something INSIDE a container is
 * selected — into that element's container, right after it. In an
 * auto-layout container that position is the flow order, so it lands next to
 * what you were looking at instead of at the far end.
 */

export interface Slot {
  /** The container's path, or null for the top level. */
  parent: string | null;
  /** Index in the parent's children; undefined appends. */
  index?: number;
}

const lastIndex = (path: string) => Number(path.slice(path.lastIndexOf('.') + 1));

/** Where the Library should add, given the current selection. */
export function slotForSelection(doc: Doc, selected: string | null): Slot {
  if (!selected) return { parent: null };
  if (isContainer(elementAt(doc, selected))) return { parent: selected };
  const parent = parentOf(selected);
  if (parent && isContainer(elementAt(doc, parent))) {
    return { parent, index: lastIndex(selected) + 1 };
  }
  return { parent: null };
}

/**
 * Where a file dropped at `point` (artboard units) should go: the innermost
 * container under the cursor, at the flow position nearest the cursor if
 * that container lays itself out.
 */
export function slotForDrop(doc: Doc, resolved: Doc, hit: string | null, point: { x: number; y: number }): Slot {
  let parent: string | null = null;
  for (let p = hit; p; p = parentOf(p)) {
    if (isContainer(elementAt(doc, p))) {
      parent = p;
      break;
    }
  }
  if (!parent) return { parent: null };

  const container = elementAt(resolved, parent) as Element & {
    layout?: { direction: 'vertical' | 'horizontal' };
    children?: Element[];
  };
  if (!container.layout) return { parent };

  // Before the first child whose centre is past the cursor on the flow axis.
  const vertical = container.layout.direction === 'vertical';
  const kids = container.children ?? [];
  const index = kids.findIndex((k) => {
    const b = k as Element & { x?: number; y?: number; width?: number; height?: number };
    const start = vertical ? b.y : b.x;
    const size = vertical ? b.height : b.width;
    if (typeof start !== 'number') return false;
    return (vertical ? point.y : point.x) < start + (size ?? 0) / 2;
  });
  return { parent, index: index < 0 ? undefined : index };
}

/** The container's content width, for sizing what goes into it. */
export function contentWidth(doc: Doc, slot: Slot): number | null {
  if (!slot.parent) return null;
  const c = elementAt(doc, slot.parent) as Element & {
    width?: number;
    layout?: { padding?: number | number[] };
  };
  if (typeof c.width !== 'number') return null;
  const p = c.layout?.padding;
  const [, right, , left] =
    p === undefined ? [0, 0, 0, 0]
    : typeof p === 'number' ? [p, p, p, p]
    : p.length === 2 ? [p[0], p[1], p[0], p[1]]
    : p;
  return Math.max(c.width - (left ?? 0) - (right ?? 0), 0);
}

/** Insert at a slot. Returns the new document and the element's path. */
export function insertAt(doc: Doc, slot: Slot, el: Element): { doc: Doc; path: string } {
  const splice = (list: Element[]) => {
    const i = slot.index === undefined ? list.length : Math.min(slot.index, list.length);
    const next = [...list];
    next.splice(i, 0, el);
    return { next, i };
  };
  if (!slot.parent) {
    const { next, i } = splice(doc.elements);
    return { doc: { ...doc, elements: next }, path: String(i) };
  }
  const p = elementAt(doc, slot.parent) as Element & { children?: Element[] };
  const { next, i } = splice(p.children ?? []);
  return {
    doc: replaceAt(doc, slot.parent, { ...p, children: next } as Element),
    path: `${slot.parent}.${i}`,
  };
}

/** Insert, commit and select — the common case. */
export function addAt(doc: Doc, slot: Slot, el: Element): string {
  const { doc: next, path } = insertAt(doc, slot, el);
  commit(next);
  setUI({ selected: path });
  return path;
}
