import type { Doc, Element, LayoutSpec } from '../src/document.ts';
import { isContainer, resolveLayout } from '../src/autolayout.ts';
import { elementAt, parentOf, replaceAt } from './state.ts';

/**
 * HUG AND FILL — how a container and what is in it size, in Figma's terms.
 *
 * A container HUGS on an axis when it shrinks or grows to fit its content
 * there. An element inside an auto-layout container FILLS an axis when it
 * takes the container's room on it: across the container's direction that
 * is `alignSelf: 'stretch'`, along it `grow`. The two cannot both hold for
 * one element on one axis — a box cannot both fit its content and fill its
 * parent — so turning either on turns the other off.
 */

export type Axis = 'w' | 'h';
type Container = Extract<Element, { type: 'card' | 'subCard' | 'group' }>;

/** Whether the container at `path` hugs `axis`. */
export function hugs(doc: Doc, path: string, axis: Axis): boolean {
  const el = elementAt(doc, path);
  if (!el || !isContainer(el)) return false;
  const key = axis === 'w' ? 'hugWidth' : 'hugHeight';
  return el.layout ? !!el.layout[key] : !!(el as { hugWidth?: boolean; hugHeight?: boolean })[key];
}

/** The auto-layout container the element at `path` is placed by, or null. */
function flowParent(doc: Doc, path: string): { spec: LayoutSpec } | null {
  const p = parentOf(path);
  const parent = p ? elementAt(doc, p) : null;
  const spec = parent && isContainer(parent) ? parent.layout : undefined;
  return spec ? { spec } : null;
}

/** Whether `axis` runs across its container's flow — where filling is stretching. */
const across = (spec: LayoutSpec, axis: Axis) => (spec.direction === 'vertical') === (axis === 'w');

/** Whether the element at `path` fills `axis` of its auto-layout container. */
export function fills(doc: Doc, path: string, axis: Axis): boolean {
  const flow = flowParent(doc, path);
  const el = elementAt(doc, path) as (Element & { grow?: number; alignSelf?: string }) | null;
  if (!flow || !el) return false;
  return across(flow.spec, axis) ? (el.alignSelf ?? flow.spec.align) === 'stretch' : (el.grow ?? 0) > 0;
}

/** The container's hug on `axis`, set — clearing its fill there. */
export function setHug(doc: Doc, path: string, axis: Axis, on: boolean): Doc {
  if (on && fills(doc, path, axis)) doc = setFill(doc, path, axis, false);
  const el = elementAt(doc, path);
  if (!el || !isContainer(el)) return doc;
  const key = axis === 'w' ? 'hugWidth' : 'hugHeight';
  const next: Container = el.layout
    ? { ...el, layout: { ...el.layout, [key]: on || undefined } }
    : ({ ...el, [key]: on || undefined } as Container);
  return replaceAt(doc, path, next);
}

/** Where a stretched element sits once let go: its own side, for a chat bubble — a sender's the far one. */
export const letGo = (el: Element) => (el.type === 'chat' && el.variant === 'sender' ? 'end' : 'start');

/** The element's fill on `axis` of its auto-layout container, set — clearing its own hug there. */
export function setFill(doc: Doc, path: string, axis: Axis, on: boolean): Doc {
  const flow = flowParent(doc, path);
  if (!flow) return doc;
  if (on && hugs(doc, path, axis)) doc = setHug(doc, path, axis, false);
  const el = elementAt(doc, path) as Element & { grow?: number; alignSelf?: string; width?: number; height?: number };
  let next: Element & { width?: number; height?: number } = across(flow.spec, axis)
    ? // Stretching, or — where the container stretches everything — not.
      { ...el, alignSelf: on ? 'stretch' : flow.spec.align === 'stretch' ? letGo(el) : undefined }
    : { ...el, grow: on ? 1 : undefined };
  // Let go, it keeps the size it was filling to, rather than falling back to
  // whatever its own stored size was — a slot's chart stores next to none.
  if (!on) {
    const shown = elementAt(resolveLayout(doc), path) as (Element & { width?: number; height?: number }) | null;
    const key = axis === 'w' ? 'width' : 'height';
    if (shown && typeof shown[key] === 'number' && typeof next[key] === 'number') next = { ...next, [key]: Math.round(shown[key]!) };
  }
  return replaceAt(doc, path, next as Element);
}

/**
 * For an element in a container laid out by hand: its box set to the
 * container's content box on `axis` — inside the padding — once. There is
 * no layout to keep it filled, so this is a resize, not a setting.
 */
export function fillOnce(doc: Doc, path: string, axis: Axis, padding: number): Doc {
  const p = parentOf(path);
  // The container as stored: its children are stored in the same space.
  const parent = p ? (elementAt(doc, p) as (Element & { x: number; y: number; width: number; height: number }) | null) : null;
  const el = elementAt(doc, path) as (Element & { x: number; y: number; width?: number; height?: number }) | null;
  if (!parent || !el || typeof el.width !== 'number') return doc;
  const pad = parent.type === 'group' ? 0 : padding;
  const next =
    axis === 'w'
      ? { ...el, x: parent.x + pad, width: parent.width - pad * 2 }
      : typeof el.height === 'number'
        ? { ...el, y: parent.y + pad, height: parent.height - pad * 2 }
        : el;
  return replaceAt(doc, path, next as Element);
}

/** Whether `fillOnce` can size this element — it has a box of its own on `axis`. */
export const canFillOnce = (el: Element | null, axis: Axis) =>
  !!el && typeof (el as { width?: number }).width === 'number' && (axis === 'w' || typeof (el as { height?: number }).height === 'number');
