import type { Doc, Element } from './document.ts';
import { LAYOUT } from './tokens.ts';

/**
 * DOCUMENT MIGRATIONS — older documents brought up to the current shape as
 * they load, so a saved copy never needs hand-editing.
 */

type WithKids = Element & { children?: Element[]; layout?: { gap?: number } };

/**
 * Axis labels used to be a row of texts beside a line chart: a horizontal
 * group, `justify: between`, as wide as the chart. Resizing the chart left
 * the row behind. They are now the chart's own `labels`; this folds a row
 * that looks exactly like that into the chart it sits under. Rows styled any
 * other way (not `micro`, a colour other than muted) are left as they are,
 * since the chart would draw them differently.
 */
function absorbChartLabels(kids: Element[], gap: number): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    const next = kids[i + 1] as WithKids | undefined;
    if (
      el.type === 'lineChart' &&
      !el.labels &&
      next?.type === 'group' &&
      next.layout?.direction === 'horizontal' &&
      next.layout.justify === 'between' &&
      Math.abs(next.width - el.width) <= 1 &&
      next.children?.length &&
      next.children.every(
        (t) => t.type === 'text' && t.role === 'micro' && (t.tone ?? 'muted') === 'muted' && !t.weight,
      )
    ) {
      out.push({
        ...el,
        labels: next.children.map((t) => (t.type === 'text' ? t.content : '')),
        labelGap: gap,
      });
      i++;
      continue;
    }
    out.push(el);
  }
  return out;
}

/**
 * Surfaces renamed. The glass was condensed to three: basic (was glass1, and
 * glass2, the old default card), elevated (was glass3) and highlighted —
 * which took in the glass-over surfaces made for the Mockup template.
 */
const RENAMED_SURFACES: Record<string, string> = {
  glass1: 'basic',
  glass2: 'basic',
  glass3: 'elevated',
  glassOver: 'highlighted',
  glassOverDark: 'highlighted',
  glassOverLight: 'highlighted',
  mockup: 'highlighted',
};

function migrateElement(el: Element): Element {
  const s = (el as { surface?: string }).surface;
  if (s && RENAMED_SURFACES[s]) el = { ...el, surface: RENAMED_SURFACES[s] } as Element;
  const c = el as WithKids;
  if (!c.children) return el;
  const gap = c.layout ? (c.layout.gap ?? LAYOUT.gap) : 4;
  return { ...el, children: absorbChartLabels(c.children.map(migrateElement), gap) } as Element;
}

export function migrateDoc(doc: Doc): Doc {
  return { ...doc, elements: doc.elements.map(migrateElement) };
}
