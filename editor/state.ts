import { useSyncExternalStore } from 'react';
import type { Doc, Element } from '../src/document.ts';
import { LAYOUT, type ThemeName } from '../src/tokens.ts';

/**
 * Store — a ~90-line `useSyncExternalStore` shim instead of a state library.
 *
 * The editor only has one document open at a time, so the whole state is a
 * plain object and every mutation replaces the document. Undo is then just a
 * stack of past documents, which is both trivial and correct.
 */

export interface EditorState {
  doc: Doc;
  theme: ThemeName;
  /** Dot-delimited index path into `doc.elements`, e.g. `"4.1"`. */
  selected: string | null;
  zoom: number;
  pan: { x: number; y: number };
  showOutlines: boolean;
  /** Snap step in canvas px. 0 disables snapping. */
  snapStep: number;
  showGrid: boolean;
  /** Card padding used by the layout actions and the padding guide. */
  padding: number;
}

interface Store {
  state: EditorState;
  past: Doc[];
  future: Doc[];
}

let store: Store;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function initStore(doc: Doc) {
  store = {
    state: {
      doc,
      theme: 'dark',
      selected: null,
      zoom: 1.4,
      pan: { x: 0, y: 0 },
      showOutlines: false,
      snapStep: LAYOUT.grid,
      showGrid: false,
      padding: LAYOUT.cardPadding,
    },
    past: [],
    future: [],
  };
  emit();
}

export function useEditor<T>(select: (s: EditorState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => select(store.state),
  );
}

export const getState = () => store.state;

/** Patch state without touching history (selection, zoom, theme). */
export function setUI(patch: Partial<EditorState>) {
  store.state = { ...store.state, ...patch };
  emit();
}

/**
 * Commit a document change. `coalesce` merges into the previous history entry,
 * which is what makes a drag one undo step instead of sixty.
 */
export function commit(next: Doc, coalesce = false) {
  if (!coalesce) {
    store.past = [...store.past.slice(-99), store.state.doc];
    store.future = [];
  }
  store.state = { ...store.state, doc: next };
  emit();
}

export function undo() {
  const prev = store.past.pop();
  if (!prev) return;
  store.future = [store.state.doc, ...store.future];
  store.state = { ...store.state, doc: prev };
  emit();
}

export function redo() {
  const [next, ...rest] = store.future;
  if (!next) return;
  store.past = [...store.past, store.state.doc];
  store.future = rest;
  store.state = { ...store.state, doc: next };
  emit();
}

export const canUndo = () => store.past.length > 0;
export const canRedo = () => store.future.length > 0;

/* ---- element path helpers --------------------------------------------- */

/** Read the element at a path, or null. */
export function elementAt(doc: Doc, path: string | null): Element | null {
  if (!path) return null;
  const idx = path.split('.').map(Number);
  let list: Element[] | undefined = doc.elements;
  let el: Element | undefined;
  for (const i of idx) {
    if (!list) return null;
    el = list[i];
    if (!el) return null;
    list = (el as { children?: Element[] }).children;
  }
  return el ?? null;
}

/** Structurally replace the element at a path. */
export function replaceAt(doc: Doc, path: string, next: Element): Doc {
  const idx = path.split('.').map(Number);

  const walk = (list: Element[], depth: number): Element[] =>
    list.map((el, i) => {
      if (i !== idx[depth]) return el;
      if (depth === idx.length - 1) return next;
      const kids = (el as { children?: Element[] }).children ?? [];
      return { ...el, children: walk(kids, depth + 1) } as Element;
    });

  return { ...doc, elements: walk(doc.elements, 0) };
}

/** Remove the element at a path. */
export function removeAt(doc: Doc, path: string): Doc {
  const idx = path.split('.').map(Number);

  const walk = (list: Element[], depth: number): Element[] => {
    if (depth === idx.length - 1) return list.filter((_, i) => i !== idx[depth]);
    return list.map((el, i) => {
      if (i !== idx[depth]) return el;
      const kids = (el as { children?: Element[] }).children ?? [];
      return { ...el, children: walk(kids, depth + 1) } as Element;
    });
  };

  return { ...doc, elements: walk(doc.elements, 0) };
}

/** Append an element, either at the root or inside a container path. */
export function appendTo(doc: Doc, parentPath: string | null, el: Element): { doc: Doc; path: string } {
  if (!parentPath) {
    return {
      doc: { ...doc, elements: [...doc.elements, el] },
      path: String(doc.elements.length),
    };
  }
  const parent = elementAt(doc, parentPath) as { children?: Element[] } | null;
  const kids = parent?.children ?? [];
  const next = replaceAt(doc, parentPath, {
    ...(parent as Element),
    children: [...kids, el],
  } as Element);
  return { doc: next, path: `${parentPath}.${kids.length}` };
}

/** Insert an element immediately after the one at `path` (same parent). */
export function insertAfter(
  doc: Doc,
  path: string,
  el: Element,
): { doc: Doc; path: string } {
  const idx = path.split('.').map(Number);
  const at = idx[idx.length - 1];

  const walk = (list: Element[], depth: number): Element[] => {
    if (depth === idx.length - 1) {
      const next = [...list];
      next.splice(at + 1, 0, el);
      return next;
    }
    return list.map((item, i) => {
      if (i !== idx[depth]) return item;
      const kids = (item as { children?: Element[] }).children ?? [];
      return { ...item, children: walk(kids, depth + 1) } as Element;
    });
  };

  return {
    doc: { ...doc, elements: walk(doc.elements, 0) },
    path: [...idx.slice(0, -1), at + 1].join('.'),
  };
}

/** Parent path of a path, or null for a root element. */
export function parentOf(path: string): string | null {
  const i = path.lastIndexOf('.');
  return i < 0 ? null : path.slice(0, i);
}

/** Containers are the only elements that accept children. */
export function isContainer(el: Element | null): boolean {
  return el?.type === 'card' || el?.type === 'subCard' || el?.type === 'group';
}

/**
 * Move an element to the front or back of its siblings.
 *
 * At the root that is z-order — front draws last, so it draws on top. Inside
 * an auto-layout container the same operation moves it to the end or start of
 * the flow, which is why the editor labels it by context.
 */
export function reorderToEdge(
  doc: Doc,
  path: string,
  edge: 'front' | 'back',
): { doc: Doc; path: string } | null {
  const idx = path.split('.').map(Number);
  const at = idx[idx.length - 1];

  const move = (list: Element[]): { list: Element[]; to: number } | null => {
    const to = edge === 'front' ? list.length - 1 : 0;
    if (to === at) return null;
    const next = [...list];
    const [m] = next.splice(at, 1);
    next.splice(to, 0, m);
    return { list: next, to };
  };

  if (idx.length === 1) {
    const r = move(doc.elements);
    return r ? { doc: { ...doc, elements: r.list }, path: String(r.to) } : null;
  }

  const parentPath = idx.slice(0, -1).join('.');
  const parent = elementAt(doc, parentPath) as { children?: Element[] } | null;
  if (!parent?.children) return null;
  const r = move(parent.children);
  if (!r) return null;
  return {
    doc: replaceAt(doc, parentPath, { ...(parent as Element), children: r.list } as Element),
    path: [...idx.slice(0, -1), r.to].join('.'),
  };
}

/**
 * Move an element among its siblings.
 *
 * At the root this is z-order. Inside an auto-layout container it is the
 * layout order — which is the only way to rearrange an auto-placed child,
 * since it cannot be dragged.
 */
export function reorderSibling(doc: Doc, path: string, delta: -1 | 1): { doc: Doc; path: string } | null {
  const idx = path.split('.').map(Number);
  const at = idx[idx.length - 1];
  const to = at + delta;

  const move = (list: Element[]): Element[] | null => {
    if (to < 0 || to >= list.length) return null;
    const next = [...list];
    const [m] = next.splice(at, 1);
    next.splice(to, 0, m);
    return next;
  };

  if (idx.length === 1) {
    const next = move(doc.elements);
    return next ? { doc: { ...doc, elements: next }, path: String(to) } : null;
  }

  const parentPath = idx.slice(0, -1).join('.');
  const parent = elementAt(doc, parentPath) as { children?: Element[] } | null;
  if (!parent?.children) return null;
  const next = move(parent.children);
  if (!next) return null;
  return {
    doc: replaceAt(doc, parentPath, { ...(parent as Element), children: next } as Element),
    path: [...idx.slice(0, -1), to].join('.'),
  };
}
