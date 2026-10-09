import type { Doc, Element } from './document.ts';
import { measureText } from './fontMetrics.generated.ts';
import { typeStyle, type TypeRole } from './primitives/text.ts';
import { badgeWidth } from './primitives/badge.ts';
import { tableLayout } from './primitives/table.ts';
import { boundingBox, isContainer, measureElement, resolveLayout, shifted } from './autolayout.ts';
import { LAYOUT } from './tokens.ts';
import { slotIndex } from './imageBase.ts';

/**
 * GROW TO FIT, FOR A TRANSLATION — an element widens by as much as its copy
 * did.
 *
 * A translated export has the same elements as its original with different
 * strings (src/translate.ts), and a longer string must not spill out of its
 * button, pill, input, badge, chat bubble, table or card. So each one is
 * measured twice, in the original and in the translation, and grows by the
 * difference: an element whose English fitted widens to fit the translation;
 * one the designer set a touch tight keeps exactly that tightness. Nothing
 * shrinks — a shorter translation leaves the width as it was — and the
 * original is never touched, because only the translated copy is refitted.
 *
 * Centred content grows about its centre, so it stays where it was placed;
 * content set from the left grows to the right.
 *
 * Four passes, because they need different things. Leaves and auto-layout
 * containers are fitted on sizes alone, before layout, so a container that
 * lays out its children measures them at their grown size. A card whose
 * children are placed by hand needs their resolved positions, so it is
 * fitted after: it extends on whichever side a child now spills further past
 * its padding than it did in the original. Elements placed by hand keep
 * their places — one that grew never moves or resizes another, so moving one
 * never changes where the rest are drawn. A hero panel is fitted the same way, around the
 * elements that sit on it. Last, a translation that no longer fits the
 * canvas is scaled down onto it — see `fitCanvas`.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/** Width of a line of text as a role draws it. */
const lineWidth = (s: string, role: TypeRole, weight?: 'regular' | 'semibold' | 'bold') => {
  const st = typeStyle(role, weight);
  return measureText(s, st.size, st.weight);
};

/** The width an element's own content needs, and whether it is centred — or null. */
function need(el: Element): { width: number; centred: boolean } | null {
  switch (el.type) {
    case 'button': {
      const role = el.role ?? 'subheading';
      const pad = el.padding ?? 12;
      const icon = el.icon ? Math.min(el.height * 0.5, 16) + 7 : 0;
      const text = Math.max(...(el.lines ?? [el.label]).map((l) => lineWidth(l, role)));
      return { width: pad * 2 + icon + text, centred: (el.align ?? 'center') === 'center' };
    }
    case 'pill': {
      const role = el.variant === 'accent' || !el.variant ? 'body' : 'bodySmall';
      return { width: lineWidth(el.label, role) + el.height, centred: true };
    }
    case 'input': {
      const height = el.height ?? 28;
      const lead = el.icon ? 6 + Math.min(16, height - 12) + 4 : 8;
      return { width: lead + lineWidth(el.placeholder, el.role ?? 'micro', 'regular') + 8, centred: false };
    }
    case 'badge':
      return el.width === undefined ? null : { width: badgeWidth(el.label, el.dot, el.tone), centred: !el.dot };
    // A chat bubble wraps its message instead: its box is not widened.
    case 'chat':
      return null;
    case 'table': {
      // Laid out at zero width, the flexible columns take nothing and every
      // text column its content: the narrowest the table can be.
      const at0 = tableLayout({ ...el, width: 0 });
      const last = at0.columns[at0.columns.length - 1];
      const pad = el.surface ? Math.max(el.padding ?? 8, 0) : 0;
      return last ? { width: last.x + last.width - el.x + pad, centred: false } : null;
    }
    case 'card':
    case 'subCard':
    case 'group':
      // What an auto-layout container would be if it hugged its children.
      return el.layout
        ? { width: measureElement({ ...el, layout: { ...el.layout, hugWidth: true } }).width, centred: el.layout.align === 'center' }
        : null;
    default:
      return null;
  }
}

/** `t` widened by however much more its content needs than `o`'s did. */
function grow(o: Element, t: Element): Element {
  const a = need(o);
  const b = need(t);
  const e = t as Element & { x: number; width: number };
  if (!a || !b || typeof e.width !== 'number') return t;
  // Never past a `maxWidth`: there, what does not fit wraps instead.
  const cap = (t as { maxWidth?: number }).maxWidth;
  const extra = Math.min(Math.ceil(b.width - Math.max(a.width, e.width)), cap === undefined ? Infinity : Math.max(0, cap - e.width));
  if (extra <= 0) return t;
  return { ...e, x: round(b.centred ? e.x - extra / 2 : e.x), width: e.width + extra } as Element;
}

/** Whether a container's layout sets its child's width, rather than the child. */
function stretches(parent: Element, child: Element): boolean {
  const spec = (parent as { layout?: { direction: string; align?: string } }).layout;
  if (!spec || spec.direction !== 'vertical') return false;
  return ((child as { alignSelf?: string }).alignSelf ?? spec.align) === 'stretch';
}

/** Pass one: leaves and auto-layout containers, inside out. */
function fitSizes(o: Element, t: Element, stretched = false): Element {
  const ok = (o as { children?: Element[] }).children;
  const tk = (t as { children?: Element[] }).children;
  if (ok && tk && ok.length === tk.length) {
    t = { ...t, children: tk.map((c, i) => fitSizes(ok[i], c, stretches(t, c))) } as Element;
  }
  // A stretched child's own width is only what its parent measures to hug
  // it — the layout gives it the parent's — so it carries what its content
  // needs, and the parent grows to that.
  if (stretched) {
    const need0 = need(t);
    const e = t as Element & { width?: number };
    const cap = (t as { maxWidth?: number }).maxWidth ?? Infinity;
    if (need0 && typeof e.width === 'number' && need0.width > e.width) return { ...e, width: Math.min(Math.ceil(need0.width), Math.max(cap, e.width)) } as Element;
  }
  return grow(o, t);
}

type Box = { x: number; y: number; width: number; height: number };

/** How far a container's children reach past its padding on each side (negative: short of it). */
function spill(card: Box, kids: Element[]) {
  const boxes = kids.map(boundingBox).filter((b): b is Box => b !== null);
  if (!boxes.length) return null;
  const pad = LAYOUT.cardPadding;
  return {
    left: card.x - (Math.min(...boxes.map((b) => b.x)) - pad),
    right: Math.max(...boxes.map((b) => b.x + b.width)) + pad - (card.x + card.width),
  };
}

const boxOf = (e: Element): Box | null => (e.type === 'connector' ? null : boundingBox(e));

/**
 * Pass two: cards placed by hand, inside out. `or` and `tr` are the resolved
 * original and translation, `ta` the translation as authored — what is
 * changed. Returns both, the resolved one moved the same way, so the parent
 * measures the grown card.
 */
function fitFree(or: Element, tr: Element, ta: Element): { tr: Element; ta: Element } {
  const ok = (or as { children?: Element[] }).children;
  const rk = (tr as { children?: Element[] }).children;
  const ak = (ta as { children?: Element[] }).children;
  if (!ok || !rk || !ak || ok.length !== rk.length || rk.length !== ak.length) return { tr, ta };

  const fitted = rk.map((c, i) => fitFree(ok[i], c, ak[i]));
  // Placed by hand, each child keeps its own place: one that grew moves nothing else.
  const free = !(isContainer(tr) && tr.layout);
  const kids = { r: fitted.map((f) => f.tr), a: fitted.map((f) => f.ta) };
  tr = { ...tr, children: kids.r } as Element;
  ta = { ...ta, children: kids.a } as Element;

  if ((tr.type !== 'card' && tr.type !== 'subCard') || !free) return { tr, ta };
  const before = spill(or as Element & Box, ok);
  const after = spill(tr as Element & Box, (tr as { children: Element[] }).children);
  if (!before || !after) return { tr, ta };
  const left = Math.ceil(Math.max(0, after.left - Math.max(before.left, 0)));
  const right = Math.ceil(Math.max(0, after.right - Math.max(before.right, 0)));
  if (!left && !right) return { tr, ta };
  const move = (e: Element) => {
    const b = e as Element & Box;
    return { ...b, x: round(b.x - left), width: b.width + left + right } as Element;
  };
  return { tr: move(tr), ta: move(ta) };
}

/** What sits on a hero panel as part of it, not over it. */
const PASSING = new Set<Element['type']>(['connector', 'cursor', 'arrow']);

/**
 * Pass three: the hero panels. A panel is not a container — the elements
 * over it are top-level, and belong to it by where their centre falls, as
 * `buildDocument` decides — so it grows like a card placed by hand, around
 * the elements that sit on it. A clipping panel is a screen running off the
 * window's edge, meant to cut what overflows it, and is left as it is.
 *
 * Panels side by side then keep the gap they were drawn with: one grown
 * into its neighbour pushes it along, with everything on it, and the whole
 * composition is re-centred where it was, so it stays balanced on the
 * canvas rather than running off to one side.
 */
function fitPanels(original: Doc, translated: Doc): Doc {
  const panels = translated.panels;
  if (!panels?.length) return translated;
  const or = resolveLayout(original).elements;
  const tr = resolveLayout(translated).elements;
  const centreIn = (p: Box, e: Element) => {
    const b = boundingBox(e);
    if (!b) return false;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height;
  };
  // Membership from the original, so a grown element stays on its panel;
  // the last panel an element falls in has it, as in `buildDocument`.
  const members = panels.map((p, pi) =>
    or
      .map((_, i) => i)
      .filter((i) => !PASSING.has(or[i].type) && centreIn(p, or[i]))
      .filter((i) => !panels.slice(pi + 1).some((q) => centreIn(q, or[i]))),
  );

  const grown = panels.map((p, pi) => {
    if (p.clip) return p;
    const before = spill(p, members[pi].map((i) => or[i]));
    const after = spill(p, members[pi].map((i) => tr[i]));
    if (!before || !after) return p;
    const left = Math.ceil(Math.max(0, after.left - Math.max(before.left, 0)));
    const right = Math.ceil(Math.max(0, after.right - Math.max(before.right, 0)));
    return left || right ? { ...p, x: round(p.x - left), width: p.width + left + right } : p;
  });
  if (grown.every((p, i) => p === panels[i])) return translated;

  // Left to right, each panel at least its drawn gap past the one before it
  // on the same band. `push[i]` is how far panel i, and what is on it, moves.
  const order = panels.map((_, i) => i).sort((a, b) => panels[a].x - panels[b].x);
  const push = panels.map(() => 0);
  const overlapsY = (a: Box, b: Box) => a.y < b.y + b.height && b.y < a.y + a.height;
  for (let k = 1; k < order.length; k++) {
    const b = order[k];
    for (let m = k - 1; m >= 0; m--) {
      const a = order[m];
      if (!overlapsY(panels[a], panels[b])) continue;
      const gap = panels[b].x - (panels[a].x + panels[a].width);
      if (gap < 0) continue; // drawn overlapping: leave that as it was
      const need = grown[a].x + push[a] + grown[a].width + gap - (grown[b].x + push[b]);
      if (need > 0) push[b] += need;
    }
  }

  // Re-centre: the panels' span, grown and pushed, on the centre it had.
  const span = (xs: { x: number; width: number }[]) => [
    Math.min(...xs.map((p) => p.x)),
    Math.max(...xs.map((p) => p.x + p.width)),
  ];
  const [a0, b0] = span(panels);
  const [a1, b1] = span(grown.map((p, i) => ({ x: p.x + push[i], width: p.width })));
  const centre = round((a0 + b0) / 2 - (a1 + b1) / 2);

  const owner = new Map<number, number>();
  members.forEach((list, pi) => list.forEach((i) => owner.set(i, pi)));
  return {
    ...translated,
    panels: grown.map((p, i) => ({ ...p, x: round(p.x + push[i] + centre) })),
    elements: translated.elements.map((el, i) => shifted(el, round(centre + (push[owner.get(i) ?? -1] ?? 0)), 0)),
  };
}

/**
 * The translated document `translated`, refitted against its `original` so
 * nothing in it is narrower than its copy. See the top of this file.
 */
export function fitTranslation(original: Doc, translated: Doc, opts: { canvas?: boolean } = {}): Doc {
  if (original.elements.length !== translated.elements.length) return translated;
  const sized = { ...translated, elements: translated.elements.map((t, i) => fitSizes(original.elements[i], t)) };
  const or = resolveLayout(original);
  const tr = resolveLayout(sized);
  const fitted = sized.elements.map((ta, i) => fitFree(or.elements[i], tr.elements[i], ta));
  // The top level is placed by hand too: each element where it was put.
  const placed = fitPanels(original, { ...sized, elements: fitted.map((f) => f.ta) });
  /*
   * An image base (or static image) is drawn around its screenshot, which
   * fills its slot: nothing pushes the screenshot aside, and the drawing is
   * never scaled down to fit — that would take the screenshot off its slot
   * and every card off its guide. Its cards are held inside the card guide
   * where they are placed (editor/strict.ts).
   */
  if (original.mockup) {
    const at = slotIndex(original);
    return at >= 0 ? { ...placed, elements: placed.elements.map((e, i) => (i === at ? original.elements[i] : e)) } : placed;
  }
  // Shown in the builder, the translation is drawn where it is edited: not scaled.
  return opts.canvas === false ? placed : fitCanvas(original, placed);
}

/** The canvas's clear margin — the audit's `CANVAS-INSET`. */
const CANVAS_INSET = 20;

/**
 * Pass four: the canvas. Grown and pushed, a translation can need more room
 * than the canvas has; then the drawing is scaled down to fit, uniformly —
 * the artboard (`Doc.artboard`) widened to take in everything with the
 * canvas's margin, kept to the canvas's proportions, and the renderer
 * scales it back onto the canvas. Nothing is cut off at the edge; the
 * translation is a little smaller instead. Only what the translation
 * pushed past the margin counts, so a document already fine is unchanged.
 */
function fitCanvas(original: Doc, translated: Doc): Doc {
  const space = translated.artboard ?? translated.canvas;
  const extent = (d: Doc) => {
    const boxes = [
      ...resolveLayout(d).elements.map(boxOf),
      ...(d.panels ?? []).map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height })),
    ].filter((b): b is Box => b !== null);
    return boxes.length
      ? {
          l: Math.min(...boxes.map((b) => b.x)),
          t: Math.min(...boxes.map((b) => b.y)),
          r: Math.max(...boxes.map((b) => b.x + b.width)),
          b: Math.max(...boxes.map((b) => b.y + b.height)),
        }
      : null;
  };
  const was = extent(original);
  const now = extent(translated);
  if (!was || !now) return translated;
  // What may be used: inside the margin, or as far as the original already went.
  const ok = {
    l: Math.min(CANVAS_INSET, was.l),
    t: Math.min(CANVAS_INSET, was.t),
    r: Math.max(space.width - CANVAS_INSET, was.r),
    b: Math.max(space.height - CANVAS_INSET, was.b),
  };
  if (now.l >= ok.l - 0.5 && now.t >= ok.t - 0.5 && now.r <= ok.r + 0.5 && now.b <= ok.b + 0.5) return translated;
  // The artboard the drawing needs so that, scaled onto the canvas, it keeps
  // the margin there: a content `w` wide needs w / (1 - 2 · inset / canvas).
  const c = translated.canvas;
  const w = now.r - now.l;
  const h = now.b - now.t;
  const k = Math.max(
    space.width / c.width,
    space.height / c.height,
    // Half a pixel spare, so rounding cannot leave it a hair inside the margin.
    w / (c.width - 2 * (CANVAS_INSET + 0.5)),
    h / (c.height - 2 * (CANVAS_INSET + 0.5)),
  );
  // The content centred on it, at the canvas's proportions.
  const l = (now.l + now.r) / 2 - (c.width * k) / 2;
  const t = (now.t + now.b) / 2 - (c.height * k) / 2;
  const r = l + c.width * k;
  const b = t + c.height * k;
  const dx = round(-l);
  const dy = round(-t);
  return {
    ...translated,
    artboard: { width: round(r - l), height: round(b - t) },
    elements: translated.elements.map((e) => shifted(e, dx, dy)),
    panels: translated.panels?.map((p) => ({ ...p, x: round(p.x + dx), y: round(p.y + dy) })),
    glow: translated.glow?.map((g) => ({ ...g, cx: round(g.cx + dx), cy: round(g.cy + dy) })),
    mockup: translated.mockup && { ...translated.mockup, x: round(translated.mockup.x + dx), y: round(translated.mockup.y + dy) },
    cardArea: translated.cardArea && { ...translated.cardArea, x: round(translated.cardArea.x + dx), y: round(translated.cardArea.y + dy) },
  };
}
