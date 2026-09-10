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

/** SVG attributes React insists on receiving camelCased. */
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
      props[CAMEL[k] ?? k] = v;
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
