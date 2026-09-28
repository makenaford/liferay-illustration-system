import type { Doc, Element } from './document.ts';
import { measureText } from './fontMetrics.generated.ts';
import { typeStyle, type TypeRole } from './primitives/text.ts';
import { badgeWidth } from './primitives/badge.ts';
import { tableLayout } from './primitives/table.ts';
import { CHAT_HEIGHT } from './primitives/chatBubble.ts';
import { boundingBox, isContainer, measureElement, resolveLayout, shifted } from './autolayout.ts';
import { LAYOUT } from './tokens.ts';

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
 * Three passes, because they need different things. Leaves and auto-layout
 * containers are fitted on sizes alone, before layout, so a container that
 * lays out its children measures them at their grown size. A card whose
 * children are placed by hand needs their resolved positions, so it is
 * fitted after: it extends on whichever side a child now spills further past
 * its padding than it did in the original. A hero panel is fitted last, the
 * same way, around the elements that sit on it.
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
    case 'chat': {
      const height = el.height ?? CHAT_HEIGHT;
      const text = Math.max(lineWidth(el.name, 'caption', 'semibold'), lineWidth(el.message, 'subheading', 'regular'));
      return { width: 5 + (height - 10) + 8 + text + 17, centred: el.variant === 'sender' };
    }
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
  const extra = Math.ceil(b.width - Math.max(a.width, e.width));
  if (extra <= 0) return t;
  return { ...e, x: round(b.centred ? e.x - extra / 2 : e.x), width: e.width + extra } as Element;
}

/** Pass one: leaves and auto-layout containers, inside out. */
function fitSizes(o: Element, t: Element): Element {
  const ok = (o as { children?: Element[] }).children;
  const tk = (t as { children?: Element[] }).children;
  if (ok && tk && ok.length === tk.length) {
    t = { ...t, children: tk.map((c, i) => fitSizes(ok[i], c)) } as Element;
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
  tr = { ...tr, children: fitted.map((f) => f.tr) } as Element;
  ta = { ...ta, children: fitted.map((f) => f.ta) } as Element;

  if ((tr.type !== 'card' && tr.type !== 'subCard') || (isContainer(tr) && tr.layout)) return { tr, ta };
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
export function fitTranslation(original: Doc, translated: Doc): Doc {
  if (original.elements.length !== translated.elements.length) return translated;
  const sized = { ...translated, elements: translated.elements.map((t, i) => fitSizes(original.elements[i], t)) };
  const or = resolveLayout(original);
  const tr = resolveLayout(sized);
  const free = {
    ...sized,
    elements: sized.elements.map((ta, i) => fitFree(or.elements[i], tr.elements[i], ta).ta),
  };
  return fitPanels(original, free);
}
