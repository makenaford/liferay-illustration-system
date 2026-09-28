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
 * Surfaces renamed. The glass was condensed to three — glass1 and glass2 (the
 * old default card) became basic, glass3 elevated, and the glass-over surfaces
 * made for the Mockup template highlighted — and those three then took the
 * `glass-` prefix, so the glass reads as glass beside the solid surfaces.
 */
const RENAMED_SURFACES: Record<string, string> = {
  glass1: 'glass-default',
  glass2: 'glass-default',
  glass3: 'glass-elevated',
  glassOver: 'glass-highlighted',
  glassOverDark: 'glass-highlighted',
  glassOverLight: 'glass-highlighted',
  mockup: 'glass-highlighted',
  basic: 'glass-default',
  elevated: 'glass-elevated',
  highlighted: 'glass-highlighted',
};

function migrateElement(el: Element): Element {
  const s = (el as { surface?: string }).surface;
  if (s && RENAMED_SURFACES[s]) el = { ...el, surface: RENAMED_SURFACES[s] } as Element;
  const c = el as WithKids;
  if (!c.children) return el;
  const gap = c.layout ? (c.layout.gap ?? LAYOUT.gap) : 4;
  return { ...el, children: absorbChartLabels(c.children.map(migrateElement), gap) } as Element;
}

/**
 * A mockup made before documents recorded their screenshot slot: the
 * template's (and the rebuilt mockups') first element is the screenshot, a
 * bare canvas's image covering most of it. Its own box becomes the slot, so
 * the builder shows the guide and a dropped screenshot fills it — nothing on
 * it moves. A box that isn't 3:2 keeps its size; the guide says so.
 */
function withMockupSlot(doc: Doc): Doc {
  if (doc.mockup || doc.layout !== 'bare') return doc;
  const first = doc.elements[0];
  if (first?.type !== 'image') return doc;
  const { width: cw, height: ch } = doc.artboard ?? doc.canvas;
  if (first.width * first.height < 0.5 * cw * ch) return doc;
  return { ...doc, mockup: { x: first.x, y: first.y, width: first.width, height: first.height } };
}

export function migrateDoc(doc: Doc): Doc {
  doc = withMockupSlot(doc);
  const panels = doc.panels?.map((p) =>
    p.surface && RENAMED_SURFACES[p.surface] ? { ...p, surface: RENAMED_SURFACES[p.surface] as typeof p.surface } : p,
  );
  return { ...doc, ...(panels && { panels }), elements: doc.elements.map(migrateElement) };
}
