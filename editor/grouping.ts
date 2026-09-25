import type { Doc, Element, LayoutSpec } from '../src/document.ts';
import { LAYOUT } from '../src/tokens.ts';
import { resolveLayout } from '../src/autolayout.ts';
import { boundsOf, type Box } from './bounds.ts';
import { commit, elementAt, getState, parentOf, replaceAt, setUI } from './state.ts';

/**
 * GROUP / UNGROUP — and the multi-selection they need.
 *
 * Shift-click adds siblings to the selection; ⌘G wraps them in a `group`,
 * the container that draws nothing and only positions; ⇧⌘G puts a group's
 * children back where the group was. Coordinates in a document are absolute,
 * so wrapping moves nothing: the group's box is just the union of what it
 * holds, and its children keep their own x/y.
 */

/** Every selected path, primary first. */
export function selection(): string[] {
  const { selected, also } = getState();
  return selected ? [selected, ...also] : [];
}

const lastIndex = (path: string) => Number(path.slice(path.lastIndexOf('.') + 1));

/**
 * Shift-click. Adds a sibling of the current selection, or removes one
 * already in it. Something that is not a sibling starts a new selection —
 * grouping across containers would have to move elements between them,
 * which is a different operation from grouping.
 */
export function toggleSelect(path: string) {
  const st = getState();
  const all = selection();
  if (!st.selected || parentOf(path) !== parentOf(st.selected)) {
    setUI({ selected: path });
    return;
  }
  if (all.includes(path)) {
    const rest = all.filter((p) => p !== path);
    setUI({ selected: rest[0] ?? null, also: rest.slice(1) });
  } else {
    setUI({ selected: st.selected, also: [...st.also, path] });
  }
}

/** Replace the sibling list at `parent` (null for the root). */
function withSiblings(doc: Doc, parent: string | null, fn: (list: Element[]) => Element[]): Doc {
  if (!parent) return { ...doc, elements: fn(doc.elements) };
  const p = elementAt(doc, parent) as Element & { children?: Element[] };
  return replaceAt(doc, parent, { ...p, children: fn(p.children ?? []) } as Element);
}

const pathOf = (parent: string | null, i: number) => (parent ? `${parent}.${i}` : String(i));

/** An element's box as drawn, measured the same way the selection box is. */
function measured(resolved: Doc, path: string): Box | null {
  const el = elementAt(resolved, path);
  if (!el) return null;
  const node = document.querySelector<SVGGraphicsElement>(`.doc [data-path="${path}"]`);
  return boundsOf(el, node);
}

/**
 * Wrap the selection in a group. Returns a message for the status line.
 *
 * Inside an auto-layout card, the group gets a layout of its own, which is
 * how a card arranges things both ways: a column card holding a row of two
 * items, or the reverse. With no `direction`, it runs across the parent's
 * flow — grouping in a column makes a row — since that is the only reason to
 * group there; the same direction would change nothing. The group hugs what
 * it holds and keeps the parent's gap, and takes the place of the first
 * selected item so the flow's order holds.
 *
 * Outside auto-layout a group only positions, unless a direction is asked
 * for, in which case it arranges its children the same way.
 */
export function groupSelection(direction?: LayoutSpec['direction']): string {
  const st = getState();
  const paths = selection();
  if (!paths.length) return 'Select something to group';

  const parent = parentOf(paths[0]);
  const parentEl = parent ? elementAt(st.doc, parent) : null;
  const flow = (parentEl as { layout?: LayoutSpec } | null)?.layout;
  const dir = direction ?? (flow ? (flow.direction === 'vertical' ? 'horizontal' : 'vertical') : undefined);
  const layout: LayoutSpec | undefined = dir && {
    direction: dir,
    gap: flow?.gap ?? LAYOUT.gap,
    padding: 0,
    align: dir === 'horizontal' ? 'center' : 'start',
    hugWidth: true,
    hugHeight: true,
  };

  const resolved = resolveLayout(st.doc);
  const boxes = paths.map((p) => measured(resolved, p)).filter((b): b is Box => !!b);
  if (!boxes.length) return 'Nothing measurable to group';
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));

  // Children keep their stacking order, and the group takes the place of the
  // frontmost of them — so nothing jumps in front of or behind anything else.
  const indices = paths.map(lastIndex).sort((a, b) => a - b);
  const top = indices[indices.length - 1];
  // In a flow, order is position: the group sits where its first item was.
  const at = flow ? indices[0] : top - (indices.length - 1);

  let group: Element | null = null;
  const next = withSiblings(st.doc, parent, (list) => {
    group = {
      type: 'group',
      x: r2(x),
      y: r2(y),
      width: r2(right - x),
      height: r2(bottom - y),
      // A plain group fits its content, the way a Figma group does.
      ...(layout ? { layout } : { hugWidth: true, hugHeight: true }),
      children: indices.map((i) => list[i]),
    } as Element;
    const rest = list.filter((_, i) => !indices.includes(i));
    rest.splice(at, 0, group);
    return rest;
  });
  if (!group) return 'Nothing to group';

  commit(next);
  setUI({ selected: pathOf(parent, at) });
  const n = `${paths.length} element${paths.length === 1 ? '' : 's'}`;
  return layout
    ? `${layout.direction === 'horizontal' ? 'Put' : 'Stacked'} ${n} ${layout.direction === 'horizontal' ? 'side by side' : 'in a column'}`
    : `Grouped ${n}`;
}

/** Put a group's children back in its place. */
export function ungroupSelected(): string {
  const st = getState();
  if (!st.selected || st.also.length) return 'Select one group to ungroup';
  const el = elementAt(st.doc, st.selected);
  if (el?.type !== 'group') return 'Only a group can be ungrouped';

  const parent = parentOf(st.selected);
  const at = lastIndex(st.selected);
  // A group with auto-layout computed its children's positions. Take them
  // from the resolved tree so ungrouping leaves everything where it was.
  const source = el.layout ? elementAt(resolveLayout(st.doc), st.selected) : el;
  const kids = ((source as { children?: Element[] }).children ?? []).map((k) => {
    const { grow: _g, alignSelf: _a, ...rest } = k as Element & { grow?: number; alignSelf?: string };
    return rest as Element;
  });

  const next = withSiblings(st.doc, parent, (list) => {
    const out = [...list];
    out.splice(at, 1, ...kids);
    return out;
  });
  commit(next);

  const paths = kids.map((_, i) => pathOf(parent, at + i));
  setUI({ selected: paths[0] ?? null, also: paths.slice(1) });
  return kids.length ? `Ungrouped ${kids.length} element${kids.length === 1 ? '' : 's'}` : 'Removed an empty group';
}

/** Delete everything selected. Siblings, so removing back to front is safe. */
export function deleteSelection() {
  const st = getState();
  const paths = selection();
  if (!paths.length) return;
  const parent = parentOf(paths[0]);
  const drop = new Set(paths.map(lastIndex));
  commit(withSiblings(st.doc, parent, (list) => list.filter((_, i) => !drop.has(i))));
  setUI({ selected: null });
}
