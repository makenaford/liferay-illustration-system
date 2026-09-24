import { createElement, type ReactNode } from 'react';
import type { VNode } from '../src/vsvg.ts';

/**
 * VNode -> JSX.
 *
 * This is the adapter the architecture was designed around: primitives emit
 * plain data, `toSVGString` serialises it for export, and this renders the
 * *same tree* as React for the editor canvas. One implementation of every
 * primitive, so what you drag is exactly what you export.
 */

/**
 * Attributes whose React name is not simply the camelCase of the SVG one —
 * the namespaced ones. Everything else is handled by the rule below, because
 * maintaining an exhaustive list is a losing game: `flood-color` was missing
 * and every glass icon that used it logged a React warning.
 */
const SPECIAL: Record<string, string> = {
  'xmlns:xlink': 'xmlnsXlink',
  'xlink:href': 'xlinkHref',
};

/**
 * React wants SVG presentation attributes camelCased: `flood-color` becomes
 * `floodColor`. `data-` and `aria-` stay hyphenated, which is why they are
 * checked before this runs.
 */
const camel = (name: string) =>
  SPECIAL[name] ?? name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Kept for the handful of names that were already correct; see `camel`. */
const CAMEL: Record<string, string> = {
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'letter-spacing': 'letterSpacing',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'text-anchor': 'textAnchor',
  'flood-opacity': 'floodOpacity',
  'gradient-units': 'gradientUnits',
  gradientUnits: 'gradientUnits',
  gradientTransform: 'gradientTransform',
  filterUnits: 'filterUnits',
  preserveAspectRatio: 'preserveAspectRatio',
  'xmlns:xlink': 'xmlnsXlink',
  'xlink:href': 'xlinkHref',
  'font-style': 'fontStyle',
};

/** `style` arrives as a CSS string; React needs an object. */
function parseStyle(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of value.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = decl.slice(i + 1).trim();
  }
  return out;
}

let keySeq = 0;

export function toReact(node: VNode): ReactNode {
  const props: Record<string, unknown> = { key: `n${keySeq++}` };

  for (const [k, v] of Object.entries(node.attrs)) {
    if (v === undefined) continue;
    if (k === 'style' && typeof v === 'string') {
      props.style = parseStyle(v);
    } else if (k.startsWith('data-') || k.startsWith('aria-')) {
      props[k] = v;
    } else {
      props[CAMEL[k] ?? camel(k)] = v;
    }
  }

  // Pre-built markup (the design system's glass icons). Ids inside are already
  // namespaced by the generator, so React only has to plant it.
  if (node.raw !== undefined) {
    props.dangerouslySetInnerHTML = { __html: node.raw };
    return createElement(node.tag, props);
  }
  if (node.text !== undefined) {
    return createElement(node.tag, props, node.text);
  }
  return createElement(
    node.tag,
    props,
    node.children.length ? node.children.map(toReact) : undefined,
  );
}

/** Reset the key counter before each full render so keys stay stable-ish. */
export function resetKeys() {
  keySeq = 0;
}
