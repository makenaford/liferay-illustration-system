import type { Element, LayoutSpec } from './document.ts';
import type { TypeRole } from './primitives/text.ts';
import { LAYOUT } from './tokens.ts';

/**
 * DENSITY — a dashboard drawn regular or condensed.
 *
 * A dashboard's content is always stored at its regular sizes. `condensed`
 * is applied as the layout is resolved (`resolveLayout`), so switching it is
 * lossless both ways and nothing in the document has to be rewritten:
 *
 *   - spacing — padding, gaps, corners — at 60%, to the nearest half pixel
 *   - every type role down the scale: a figure from `display` to
 *     `subheading`, a card title from `subheading` to `caption`, a caption
 *     to `micro`, which is the floor
 *   - icons, badges, bars and fixed-size charts at 60%; a chart that grows
 *     to fill its slot still fills it
 *
 * The dashboard keeps its own size: condensed fits more into the same box,
 * and the box is resized like any other. The resolved tree carries no
 * `density`, so a resolved element stored back into a document (a preset
 * being placed) is never condensed twice.
 */
export type Density = 'regular' | 'condensed';

const SCALE = 0.6;
const half = (n: number) => Math.round(n * SCALE * 2) / 2;

const ROLE_DOWN: Record<TypeRole, TypeRole> = {
  displayLarge: 'heading',
  display: 'subheading',
  title: 'body',
  headline: 'body',
  heading: 'bodySmall',
  subheading: 'caption',
  body: 'caption',
  bodySmall: 'label',
  caption: 'micro',
  smallHeading: 'micro',
  eyebrow: 'eyebrowSmall',
  label: 'micro',
  eyebrowSmall: 'micro',
  micro: 'micro',
};
const down = (r: TypeRole | undefined, fallback: TypeRole): TypeRole => ROLE_DOWN[r ?? fallback] ?? fallback;

function spacing(layout: LayoutSpec): LayoutSpec {
  const p = layout.padding ?? LAYOUT.cardPadding;
  return {
    ...layout,
    padding: typeof p === 'number' ? half(p) : (p.map(half) as typeof p),
    gap: half(layout.gap ?? LAYOUT.gap),
  };
}

type Any = Element & Record<string, unknown>;

/** `el` and everything inside it condensed. `own` keeps a dashboard's own width and height. */
function condense(el: Element, own = false): Element {
  const e = { ...el } as Any;
  // A dashboard nested in a condensed one is condensed with it, once.
  delete e.density;
  const num = (k: string, fallback?: number) => {
    const v = (e[k] as number | undefined) ?? fallback;
    if (typeof v === 'number') e[k] = half(v);
  };
  switch (el.type) {
    case 'text':
      e.role = down(el.role, 'body');
      num('maxWidth');
      break;
    case 'stat':
      e.valueRole = down(el.valueRole, 'display');
      e.labelRole = down(el.labelRole, 'caption');
      break;
    case 'badge':
      // Not below 9: its label is `micro` already, which needs the room.
      e.height = Math.max(9, half(el.height ?? 13));
      num('width');
      break;
    case 'pill':
    case 'button':
    case 'input':
      num('height');
      num('width');
      if ('role' in el && el.role) e.role = down(el.role as TypeRole, 'body');
      break;
    case 'progress':
      e.height = Math.max(1.5, half(el.height ?? 3));
      num('labelGap', 5);
      break;
    case 'icon':
      num('size', 20);
      break;
    case 'spotIcon':
      num('size', 48);
      break;
    case 'avatar':
      num('r', 11.875);
      break;
    case 'lineChart':
    case 'barChart':
    case 'pieChart':
      num('width');
      num('height');
      break;
  }
  const kids = (el as { children?: Element[] }).children;
  if (el.type === 'card' || el.type === 'subCard' || el.type === 'group') {
    if (el.layout) e.layout = spacing(el.layout);
    num('radius');
    if (!own) {
      num('width');
      num('height');
    }
  }
  if (kids) e.children = kids.map((k) => condense(k));
  return e as Element;
}

/**
 * Every condensed dashboard in `els` condensed, with its `density` taken
 * off — so what comes out is drawn as it is, and a nested dashboard inside
 * a condensed one is condensed once, not twice.
 */
export function applyDensity(els: Element[]): Element[] {
  return els.map((el) => {
    const d = (el as { density?: Density }).density;
    const kids = (el as { children?: Element[] }).children;
    if (d === 'condensed') {
      const { density: _d, ...rest } = el as Element & { density?: Density };
      return condense(rest as Element, true);
    }
    if (d) {
      const { density: _d, ...rest } = el as Element & { density?: Density };
      return kids ? ({ ...rest, children: applyDensity(kids) } as Element) : (rest as Element);
    }
    return kids ? ({ ...el, children: applyDensity(kids) } as Element) : el;
  });
}

/** Whether any element in `els` sets a density. */
export function hasDensity(els: Element[]): boolean {
  return els.some((e) => !!(e as { density?: Density }).density || hasDensity((e as { children?: Element[] }).children ?? []));
}
