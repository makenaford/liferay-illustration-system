import type { Doc, Element, LayoutSpec } from './document.ts';
import { dropdownLayout } from './primitives/dropdown.ts';
import { TYPE_ROLES, measureTextEl, wrapLines, lineLead, typeStyle } from './primitives/text.ts';
import { measureText } from './fontMetrics.generated.ts';
import { badgeWidth } from './primitives/badge.ts';
import { chatHeight } from './primitives/chatBubble.ts';
import { cursorAspect, cursorWidth } from './primitives/cursor.ts';
import { axisBand } from './primitives/axisLabels.ts';
import { tableLayout } from './primitives/table.ts';
import { statLayout } from './primitives/statBlock.ts';
import { textBox, VERTICAL } from './fontMetrics.generated.ts';
import { LAYOUT, SPACE } from './tokens.ts';
import { applyDensity, hasDensity } from './density.ts';
import { buttonFitWidth } from './primitives/button.ts';
import { formFieldLayout } from './primitives/formField.ts';

/**
 * AUTO LAYOUT — containers that reflow.
 *
 * A card with a `layout` spec computes its children's positions instead of
 * reading them, so changing a string, a gap or the card's width reflows
 * everything inside it. Nested containers resolve inside-out: a child that is
 * itself an auto-layout card is measured at its own hugged size first.
 *
 * WHERE THIS RUNS. `resolveLayout` is a document -> document transform applied
 * before rendering, not something the renderer does inline. That matters for
 * the editor: it renders the resolved document AND measures selection bounds
 * from it, so the selection box lands on where an element actually is rather
 * than on the stale coordinates still sitting in the source document.
 */

export interface Size {
  width: number;
  height: number;
}

const pad = (spec: LayoutSpec) => {
  const p = spec.padding ?? LAYOUT.cardPadding;
  return typeof p === 'number'
    ? { top: p, right: p, bottom: p, left: p }
    : { top: p[0], right: p[1], bottom: p[2] ?? p[0], left: p[3] ?? p[1] };
};

/** Intrinsic size of an element, resolving nested containers first. */
export function measureElement(el: Element): Size {
  switch (el.type) {
    case 'text': {
      /*
       * `typeStyle`, not `TYPE_ROLES[role]` — the renderer resolves the
       * element's weight OVERRIDE and this has to resolve the same one.
       * Measuring bold text at regular weight under-measures it, so a
       * container hugging that text came out a couple of pixels short and
       * the text spilled out of its own box. Two pixels, invisible, and
       * wrong everywhere a weight was overridden.
       */
      return measureTextEl(el);
    }
    case 'stat': {
      const L = statLayout(el);
      return { width: L.width, height: L.height };
    }
    case 'avatar': {
      const r = el.r ?? 11.875;
      return { width: r * 2, height: r * 2 };
    }
    case 'icon':
      return { width: el.size ?? 20, height: el.size ?? 20 };
    case 'spotIcon':
      return { width: el.size ?? 48, height: el.size ?? 48 };
    case 'iconGrid': {
      const size = el.size ?? 24;
      const rows = Math.ceil(el.icons.length / el.columns);
      return {
        width: (el.columns - 1) * (el.gapX ?? 43) + size,
        height: (rows - 1) * (el.gapY ?? 40) + size,
      };
    }
    case 'chrome': {
      const r = el.radius ?? 6;
      const gap = el.gap ?? r * 3.5;
      return { width: r * 2 + gap * 2, height: r * 2 };
    }
    case 'connector':
      return {
        width: Math.abs(el.to[0] - el.from[0]),
        height: Math.abs(el.to[1] - el.from[1]),
      };
    case 'arrow':
      return { width: el.width ?? 30, height: el.thickness ?? 9 };
    case 'line':
      return { width: el.width, height: Math.max(el.height, el.thickness ?? 1) };
    case 'badge':
      return {
        width: el.width ?? badgeWidth(el.label, el.dot, el.tone),
        height: el.height ?? 13,
      };
    case 'progress':
      // A labelled progress row draws its label ABOVE `y`, so its box starts
      // above its own origin — see `progressLabelRise`.
      return {
        width: el.width,
        height: (el.height ?? 3) + progressLabelRise(el),
      };
    case 'skeleton':
      return { width: el.width, height: el.height ?? 8 };
    case 'table':
      return { width: el.width, height: tableLayout(el).height };
    case 'input':
      return { width: el.width, height: el.height ?? 28 };
    case 'dropdown':
      return { width: el.width, height: dropdownLayout(el).height };
    case 'cursor': {
      const w = el.size ?? cursorWidth(el.variant);
      return { width: w, height: w * cursorAspect(el.variant) };
    }
    case 'lineChart':
    case 'barChart':
      // The labels hang below the plot, inside the chart's box.
      return { width: el.width, height: el.height + axisBand(el) };
    case 'chat':
      return { width: el.width, height: chatHeight(el) };
    case 'field':
      // Taller than set when its wrapped label or text needs the room.
      return { width: el.width, height: formFieldLayout(el).height };
    case 'image':
    case 'svg':
      return { width: el.width, height: el.height };
    case 'card':
    case 'subCard':
    case 'group': {
      if (!el.layout) {
        const fit = hugged(el);
        return fit ? { width: fit.width, height: fit.height } : { width: el.width, height: el.height };
      }
      return containerSize(el);
    }
    default: {
      const e = el as Element & { width?: number; height?: number };
      return { width: e.width ?? 0, height: e.height ?? 0 };
    }
  }
}

/**
 * Distance from an element's box top to the baseline of its first line of
 * text, or null when it has no text.
 *
 * This is what makes a row of mixed type look right. Aligning a 16.7px title
 * next to a 5px caption by their box tops leaves the caption floating; by
 * their box bottoms, hanging. Designers align them on the baseline, which is
 * why Figma offers it and why a row without it always looks subtly wrong.
 */
export function baselineOf(el: Element): number | null {
  switch (el.type) {
    case 'text': {
      return measureTextEl(el).baseline;
    }
    case 'stat':
      return statLayout(el).baseline;
    // These centre their label vertically, so their baseline is derived from
    // the same expression the primitive uses to place it.
    case 'badge':
      return (el.height ?? 13) / 2 + 2.2;
    case 'pill':
      return el.height / 2 + TYPE_ROLES.body.size * 0.355;
    case 'button':
      return el.height / 2 + TYPE_ROLES[el.role ?? 'subheading'].size * 0.355;
    case 'input':
      return (el.height ?? 28) / 2 + 1.8;
    case 'progress':
      return el.label ? progressLabelRise(el) : null;
    default:
      return null;
  }
}

/** A container's size, hugging its content on any axis set to `hug`. */
const round = (n: number) => Math.round(n * 100) / 100;

type Container = Extract<Element, { type: 'card' | 'subCard' | 'group' }>;

/**
 * A container's children, with their text wrapped where it would run past
 * the container's edge.
 *
 * With a `maxWidth`, a column bounds everything in it to the width inside
 * its padding: text wraps (centred when the column centres it), a button's
 * label breaks onto lines, and a container inside takes the same bound.
 *
 * Without one, text wraps on its own, but only where it does not fit, so
 * what fits is left exactly as it is: in a column at the width inside the
 * padding; in a row in the room its other items leave, the longest text
 * wrapping first; and a hugging container inside a column is held to the
 * column. A container that hugs its width grows to its text instead.
 */
function bounded(el: Container): Element[] {
  const kids = el.children ?? [];
  const spec = el.layout;
  if (!spec) return kids;
  if (el.maxWidth && spec.direction === 'vertical') return boundedTo(el, spec, el.maxWidth);
  if (spec.hugWidth) return kids;
  const p = pad(spec);
  const inner = el.width - p.left - p.right;
  if (!(inner > 0)) return kids;
  const wraps = (k: Element): k is Extract<Element, { type: 'text' }> => k.type === 'text' && inFlow(k);
  const over = (w: number, cap: number) => w > cap + 0.01;
  // Wrapped on its own, text breaks between words, never inside one, as a
  // page does: a word longer than the room stays whole. (Japanese, which has
  // no spaces, still breaks between its characters.)
  const atWords = (t: Extract<Element, { type: 'text' }>, cap: number) => Math.max(cap, longestWord(t));

  if (spec.direction === 'vertical') {
    return kids.map((k) => {
      if (wraps(k)) {
        const cap = Math.min(k.maxWidth ?? Infinity, atWords(k, inner));
        if (!over(measureTextEl(k).width, cap)) return k;
        const self = (k as { alignSelf?: LayoutSpec['align'] }).alignSelf ?? spec.align ?? 'start';
        return { ...k, maxWidth: cap, anchor: self === 'center' ? 'middle' : k.anchor } as Element;
      }
      if (isContainer(k) && inFlow(k) && k.layout?.hugWidth && over(measureElement(k).width, inner)) {
        return { ...k, maxWidth: Math.min(k.maxWidth ?? Infinity, inner) } as Element;
      }
      return k;
    });
  }

  // A row: the room its other items leave, shared among its text. Each takes
  // its own width while it fits its share; what is left is split evenly, so
  // a short label beside a long one stays whole and the long one wraps.
  const flow = kids.filter(inFlow);
  const texts = flow.filter(wraps);
  if (!texts.length) return kids;
  const gap = spec.gap ?? LAYOUT.gap;
  const fixed = flow.filter((k) => !wraps(k)).reduce((n, k) => n + measureElement(k).width, 0);
  const room = inner - fixed - gap * Math.max(flow.length - 1, 0);
  const widths = texts.map((t) => measureTextEl(t).width);
  if (room <= 0 || !over(widths.reduce((a, b) => a + b, 0), room)) return kids;
  const sorted = [...widths].sort((x, y) => x - y);
  let left = room;
  let cap = room;
  for (let i = 0; i < sorted.length; i++) {
    const share = left / (sorted.length - i);
    if (sorted[i] <= share) left -= sorted[i];
    else {
      cap = share;
      break;
    }
  }
  return kids.map((k) =>
    wraps(k) && over(measureTextEl(k).width, cap) ? ({ ...k, maxWidth: Math.min(k.maxWidth ?? Infinity, atWords(k, cap)) } as Element) : k,
  );
}

/** The widest word of a text, as it is drawn — the least it wraps to on its own. */
function longestWord(t: Extract<Element, { type: 'text' }>): number {
  // Japanese and Chinese break between any two characters, so their "word" is one.
  const cjk = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;
  const words = t.content.split(/\s+/).flatMap((w) => (cjk.test(w) ? [...w] : [w])).filter(Boolean);
  return Math.max(0, ...words.map((w) => measureTextEl({ ...t, content: w, maxWidth: undefined }).width));
}

/** A column's children bounded to `maxWidth`: see `bounded`. */
function boundedTo(el: Container, spec: LayoutSpec, maxWidth: number): Element[] {
  const kids = el.children ?? [];
  const p = pad(spec);
  const outer = spec.hugWidth ? maxWidth : Math.min(el.width, maxWidth);
  const inner = outer - p.left - p.right;
  return kids.map((k) => {
    const self = (k as { alignSelf?: LayoutSpec['align'] }).alignSelf ?? spec.align ?? 'start';
    if (k.type === 'text') {
      return {
        ...k,
        maxWidth: Math.min(k.maxWidth ?? Infinity, inner),
        anchor: self === 'center' ? 'middle' : k.anchor,
      } as Element;
    }
    if (k.type === 'button' && !k.lines) {
      const width = self === 'stretch' ? inner : Math.min(k.width, inner);
      const role = k.role ?? 'subheading';
      const st = typeStyle(role);
      const room = width - (k.padding ?? 12) * 2 - (k.icon ? Math.min(k.height * 0.5, 16) + 7 : 0);
      const lines = wrapLines(k.label, (s) => measureText(s, st.size, st.weight), room);
      return lines.length > 1
        ? ({ ...k, lines, height: Math.max(k.height, lines.length * lineLead(st.size) + 12) } as Element)
        : k;
    }
    if (isContainer(k)) return { ...k, maxWidth: Math.min(k.maxWidth ?? Infinity, inner) } as Element;
    return k;
  });
}

/**
 * A card laid out by hand: text that would run past its right edge wraps
 * before it, a card's padding in (or the text's own margin on the left, when
 * that is less). Text that fits, and text not set from its left, is left as
 * it is.
 *
 * The margin was the text's whole left inset, mirrored. A line set well in
 * from the left — a figure beside an avatar and a rating — was then given
 * almost no room, and Japanese, which breaks between any characters, came
 * out one character to a line.
 */
function wrapInFreeCard(el: Container): Element[] {
  const kids = el.children ?? [];
  if (el.type === 'group') return kids;
  return kids.map((k) => {
    if (k.type !== 'text' || (k.anchor && k.anchor !== 'start')) return k;
    const margin = Math.min(Math.max(k.x - el.x, 0), LAYOUT.cardPadding);
    const room = el.x + el.width - margin - k.x;
    if (!(room > 0)) return k;
    const cap = Math.min(k.maxWidth ?? Infinity, Math.max(room, longestWord(k)));
    if (measureTextEl(k).width <= cap + 0.01) return k;
    return { ...k, maxWidth: cap } as Element;
  });
}

/** Whether a child is placed by its container's flow — not `absolute`. */
export const inFlow = (k: Element) => !(k as { absolute?: boolean }).absolute;

function containerSize(el: Container): Size {
  const spec = el.layout!;
  const p = pad(spec);
  const kids = bounded(el).filter(inFlow);
  const gap = spec.gap ?? LAYOUT.gap;
  const sizes = kids.map(measureElement);

  const horizontal = spec.direction === 'horizontal';
  const along = sizes.reduce((n, s) => n + (horizontal ? s.width : s.height), 0) +
    Math.max(kids.length - 1, 0) * gap;
  const across = sizes.reduce((n, s) => Math.max(n, horizontal ? s.height : s.width), 0);

  const hugW = spec.hugWidth ?? false;
  const hugH = spec.hugHeight ?? false;

  // Rounded: hug sizes come from summed text metrics, so without this a
  // width reads as 46.59699999999 in the inspector.
  const width = hugW ? (horizontal ? along : across) + p.left + p.right : el.width;
  return {
    width: round(el.maxWidth ? Math.min(width, el.maxWidth) : width),
    height: round(hugH ? (horizontal ? across : along) + p.top + p.bottom : el.height),
  };
}

/** Reposition an element's own anchor to (x, y) of its bounding box. */
function placeAt(el: Element, x: number, y: number, size: Size): Element {
  if (el.type === 'avatar') {
    const r = el.r ?? 11.875;
    return { ...el, cx: round(x + r), cy: round(y + r) };
  }
  if (el.type === 'connector') {
    const dx = Math.sign(el.to[0] - el.from[0]) >= 0 ? 0 : size.width;
    const dy = Math.sign(el.to[1] - el.from[1]) >= 0 ? 0 : size.height;
    const ox = x + dx - el.from[0];
    const oy = y + dy - el.from[1];
    return {
      ...el,
      from: [round(el.from[0] + ox), round(el.from[1] + oy)],
      to: [round(el.to[0] + ox), round(el.to[1] + oy)],
    };
  }
  if (el.type === 'text') {
    // `y` is a baseline, so drop it an ascent into the line box.
    const role = TYPE_ROLES[el.role];
    const b = textBox(el.content, role.size, role.weight);
    const anchorX =
      el.anchor === 'middle' ? x + size.width / 2 : el.anchor === 'end' ? x + size.width : x;
    return { ...el, x: round(anchorX), y: round(y + b.baseline) };
  }
  if (el.type === 'progress') {
    return { ...el, x: round(x), y: round(y + progressLabelRise(el)) };
  }
  if (el.type === 'stat') {
    const anchorX =
      el.anchor === 'middle' ? x + size.width / 2 : el.anchor === 'end' ? x + size.width : x;
    return { ...el, x: round(anchorX), y: round(y + statLayout(el).baseline) };
  }
  if (isContainer(el) && el.layout && el.children?.some((c) => !inFlow(c))) {
    // An auto-layout container's absolute children move with it, as a free
    // container's all do; the flow places the rest.
    const dx = x - (el.x ?? 0);
    const dy = y - (el.y ?? 0);
    return {
      ...el,
      x: round(x),
      y: round(y),
      children: el.children.map((c) => (inFlow(c) ? c : shifted(c, dx, dy))),
    } as Element;
  }
  if (isContainer(el) && !el.layout && el.children?.length) {
    // A free container's children are absolute, so they move with it —
    // otherwise the flow moves the box and leaves what is in it behind.
    const from = hugged(el) ?? el;
    const dx = x - from.x;
    const dy = y - from.y;
    return {
      ...el,
      x: round(x),
      y: round(y),
      children: el.children.map((c) => shifted(c, dx, dy)),
    } as Element;
  }
  return { ...el, x: round(x), y: round(y) } as Element;
}

/** An element moved by (dx, dy), with everything inside it. */
export function shifted(el: Element, dx: number, dy: number): Element {
  if (!dx && !dy) return el;
  let next: Element;
  if (el.type === 'avatar') next = { ...el, cx: round(el.cx + dx), cy: round(el.cy + dy) };
  else if (el.type === 'connector') {
    next = {
      ...el,
      from: [round(el.from[0] + dx), round(el.from[1] + dy)],
      to: [round(el.to[0] + dx), round(el.to[1] + dy)],
    };
  } else {
    const e = el as Element & { x: number; y: number };
    next = { ...e, x: round(e.x + dx), y: round(e.y + dy) } as Element;
  }
  const kids = (next as { children?: Element[] }).children;
  return kids ? ({ ...next, children: kids.map((c) => shifted(c, dx, dy)) } as Element) : next;
}


/**
 * How far a progress row's label reaches above the row's own `y`.
 *
 * `ProgressRow` puts the track at `y` and the label's baseline at
 * `y - labelGap`, so the element's bounding box starts above its origin.
 * Ignoring that made the label collide with whatever sat above it.
 */
function progressLabelRise(el: Extract<Element, { type: 'progress' }>): number {
  if (!el.label) return 0;
  const role = TYPE_ROLES.micro;
  return (el.labelGap ?? 5) + VERTICAL.ascent * role.size;
}

/**
 * Lay a container's children out along its main axis.
 *
 * `grow` distributes leftover main-axis space, `stretch` fills the cross axis,
 * and `justify: 'between'` pushes the gaps apart — the flexbox rules, because
 * they are the ones a designer already has in their head from Figma's own
 * auto-layout.
 */
function layoutContainer(el: Container): Element {
  const spec = el.layout!;
  const p = pad(spec);
  /*
   * Children are placed FIRST and resolved after.
   *
   * Resolving first was a real bug: a nested container laid its own children
   * out around its authored x/y, and then `placeAt` moved the container
   * without moving what was inside it. The container's box travelled and its
   * contents stayed behind — silently, because the box is invisible.
   * Measuring does not need resolved children, so the order is free.
   */
  const all = bounded(el);
  if (!all.length) return { ...el, children: [] } as Element;
  // An absolute child is left where it is set, out of the flow — see `LayoutChild.absolute`.
  const kids = all.filter(inFlow);

  const size = containerSize(el);
  const horizontal = spec.direction === 'horizontal';
  const gap = spec.gap ?? LAYOUT.gap;

  const inner = {
    x: (el.x ?? 0) + p.left,
    y: (el.y ?? 0) + p.top,
    width: size.width - p.left - p.right,
    height: size.height - p.top - p.bottom,
  };

  const sizes = kids.map(measureElement);
  const mainOf = (s: Size) => (horizontal ? s.width : s.height);
  const crossOf = (s: Size) => (horizontal ? s.height : s.width);
  const mainSpace = horizontal ? inner.width : inner.height;
  const crossSpace = horizontal ? inner.height : inner.width;

  const used = sizes.reduce((n, s) => n + mainOf(s), 0);
  const grows = kids.map((k) => (k as { grow?: number }).grow ?? 0);
  const growTotal = grows.reduce((a, b) => a + b, 0);
  const slack = mainSpace - used - gap * (kids.length - 1);
  const mains = growTotal > 0 ? growSizes(kids, sizes.map(mainOf), grows, mainSpace - gap * (kids.length - 1), horizontal) : null;

  // `between` only spreads when there is slack and nothing is growing.
  const justify = spec.justify ?? 'start';
  const spread =
    justify === 'between' && kids.length > 1 && growTotal === 0 && slack > 0
      ? slack / (kids.length - 1)
      : 0;
  let cursor =
    justify === 'center' && growTotal === 0
      ? Math.max(slack, 0) / 2
      : justify === 'end' && growTotal === 0
        ? Math.max(slack, 0)
        : 0;

  const align = spec.align ?? 'start';

  /*
   * Baseline pass. Only meaningful across a row, so a vertical container
   * treats it as `start`. Children with no text (an icon, an avatar) have no
   * baseline to share, so they centre on the row's own height instead of
   * being dragged to an arbitrary line.
   */
  const baselineRow = horizontal && align === 'baseline';
  const baselines = baselineRow ? kids.map(baselineOf) : [];
  const maxBaseline = baselineRow
    ? Math.max(0, ...baselines.filter((b): b is number => b !== null))
    : 0;
  const rowHeight = baselineRow
    ? Math.max(
        ...kids.map((_, i) => {
          const b = baselines[i];
          const h = sizes[i].height;
          return b === null ? h : maxBaseline + (h - b);
        }),
      )
    : 0;

  const placed = kids.map((kid, i) => {
    const s = { ...sizes[i] };
    if (mains && grows[i] > 0) {
      if (horizontal) s.width = mains[i];
      else s.height = mains[i];
    }

    const self = (kid as { alignSelf?: LayoutSpec['align'] }).alignSelf ?? align;
    if (self === 'stretch') {
      if (horizontal) s.height = crossSpace;
      else s.width = crossSpace;
    }

    let cross: number;
    if (baselineRow && self === 'baseline') {
      const b = baselines[i];
      cross = b === null ? (rowHeight - s.height) / 2 : maxBaseline - b;
    } else if (self === 'center') {
      cross = (crossSpace - crossOf(s)) / 2;
    } else if (self === 'end') {
      cross = crossSpace - crossOf(s);
    } else if (self === 'baseline') {
      cross = 0; // baseline on a column: nothing to align to.
    } else {
      cross = 0;
    }

    const x = horizontal ? inner.x + cursor : inner.x + cross;
    const y = horizontal ? inner.y + cross : inner.y + cursor;

    // A stretched or grown child needs its declared size updated too.
    let next = kid as Element & { width?: number; height?: number };
    if (typeof next.width === 'number' && s.width !== sizes[i].width) {
      next = { ...next, width: round(s.width) };
    }
    if (typeof next.height === 'number' && s.height !== sizes[i].height) {
      // A line chart's `height` is its plot; its labels sit below that.
      const band = next.type === 'lineChart' || next.type === 'barChart' ? axisBand(next) : 0;
      next = { ...next, height: round(s.height - band) };
    }

    cursor += mainOf(s) + gap + spread;
    return resolveElement(placeAt(next as Element, x, y, s));
  });

  // Back in the children's own order, so paths and the draw order hold.
  let next = 0;
  const children = all.map((k) => (inFlow(k) ? placed[next++] : resolveElement(k)));

  return {
    ...el,
    width: round(size.width),
    height: round(size.height),
    children,
  } as Element;
}

/** The smallest plot a growing chart is squeezed to, in px. */
const MIN_PLOT = 24;
/** Drawn across whatever width they are given, so they have no width of their own to keep. */
const ELASTIC = new Set<Element['type']>(['lineChart', 'barChart', 'progress', 'skeleton', 'line']);

/**
 * The least an element can be along one axis: its content, with every part
 * that grows at its smallest — a growing chart at `MIN_PLOT`, a growing
 * container at its own content. What a growing child is never squeezed below.
 */
function minAlong(el: Element, horizontal: boolean): number {
  const grows = ((el as { grow?: number }).grow ?? 0) > 0;
  if (el.type === 'lineChart' || el.type === 'barChart') {
    if (horizontal) return MIN_PLOT * 2;
    if (grows) return MIN_PLOT + axisBand(el);
  }
  if (horizontal && ELASTIC.has(el.type)) return MIN_PLOT * 2;
  if (isContainer(el) && el.layout) {
    const spec = el.layout;
    const p = pad(spec);
    const kids = bounded(el).filter(inFlow);
    const gap = spec.gap ?? LAYOUT.gap;
    const along = spec.direction === 'horizontal' === horizontal;
    const mins = kids.map((k) => minAlong(k, horizontal));
    const content = along
      ? mins.reduce((a, b) => a + b, 0) + Math.max(kids.length - 1, 0) * gap
      : Math.max(0, ...mins);
    // A set size holds unless the container is one that grows to its share.
    const own = measureElement(el);
    const edges = horizontal ? p.left + p.right : p.top + p.bottom;
    return grows || (horizontal ? spec.hugWidth : spec.hugHeight) ? content + edges : horizontal ? own.width : own.height;
  }
  const s = measureElement(el);
  return horizontal ? s.width : s.height;
}

/**
 * Main-axis sizes for a container's growing children.
 *
 * Along a ROW they share the space equally — `flex: 1 1 0`, so the slots of
 * a dashboard row are the same width whatever is in them — except that none
 * is squeezed below its content: one that would be takes its content's width
 * and the rest share what is left.
 *
 * Down a COLUMN each starts at its content, with charts at their smallest,
 * and the space left over is shared — so a row of stat tiles stays as tall
 * as its tiles and the chart rows take the rest, instead of every row being
 * the same height and the charts spilling out of theirs.
 *
 * Children that do not grow keep their own size, as before.
 */
function growSizes(kids: Element[], measured: number[], grows: number[], space: number, horizontal: boolean): number[] {
  const out = [...measured];
  const fixed = kids.reduce((n, _, i) => n + (grows[i] > 0 ? 0 : measured[i]), 0);
  const free = space - fixed;
  const mins = kids.map((k, i) => (grows[i] > 0 ? minAlong(k, horizontal) : 0));
  if (horizontal) {
    let pool = kids.map((_, i) => i).filter((i) => grows[i] > 0);
    // Content wider than the row: squeeze all of them alike, so the row stays
    // inside its card, rather than pushing the last one out past its edge.
    const need = pool.reduce((n, i) => n + mins[i], 0);
    if (need > free) {
      for (const i of pool) out[i] = Math.max((mins[i] * free) / need, 0);
      return out;
    }
    let left = free;
    // Clamp whoever falls below their content, then re-share among the rest.
    for (;;) {
      const total = pool.reduce((n, i) => n + grows[i], 0);
      const under = pool.filter((i) => (left * grows[i]) / total < mins[i]);
      if (!under.length) {
        for (const i of pool) out[i] = Math.max((left * grows[i]) / total, 0);
        break;
      }
      for (const i of under) out[i] = mins[i];
      left -= under.reduce((n, i) => n + mins[i], 0);
      pool = pool.filter((i) => !under.includes(i));
      if (!pool.length) break;
    }
    return out;
  }
  // Spare height goes to the children that can use it — a chart, an empty
  // drop zone — so a row of stat tiles stays at its tiles' height. Only when
  // none can does it fall back to all of them.
  const fill = kids.map((k, i) => (grows[i] > 0 && fillsSpace(k) ? grows[i] : 0));
  const weights = fill.some((w) => w > 0) ? fill : grows;
  const total = weights.reduce((a, b) => a + b, 0);
  const spare = free - mins.reduce((a, b) => a + b, 0);
  kids.forEach((_, i) => {
    if (grows[i] > 0) out[i] = mins[i] + (total ? Math.max(spare, 0) * (weights[i] / total) : 0);
  });
  return out;
}

/** Whether `el` has a use for extra height: an empty zone, or a growing chart somewhere inside. */
function fillsSpace(el: Element): boolean {
  if (el.type === 'lineChart' || el.type === 'barChart' || el.type === 'pieChart') return ((el as { grow?: number }).grow ?? 0) > 0;
  if (!isContainer(el)) return false;
  const kids = (el.children ?? []).filter(inFlow);
  return !kids.length || kids.some(fillsSpace);
}

/**
 * A free container's box fitted to its children, on the axes it hugs — or
 * null when it hugs neither, or holds nothing measurable. One with no
 * layout leaves its children where they are, so hugging moves the box's
 * edge onto theirs rather than moving them: a group's edge sits on them, a
 * card's the card padding outside them, as a card holds its content.
 */
function hugged(el: Container) {
  if (el.layout || (!el.hugWidth && !el.hugHeight)) return null;
  const pad = el.type === 'group' ? 0 : LAYOUT.cardPadding;
  const boxes = (el.children ?? [])
    .map(boundingBox)
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return {
    x: el.hugWidth ? round(x - pad) : el.x,
    y: el.hugHeight ? round(y - pad) : el.y,
    width: el.hugWidth ? round(right - x + pad * 2) : el.width,
    height: el.hugHeight ? round(bottom - y + pad * 2) : el.height,
  };
}

/** Resolve one element, recursing into containers. */
function resolveElement(el: Element): Element {
  if (isContainer(el) && el.layout) return layoutContainer(el);
  const own = (el as { children?: Element[] }).children;
  const kids = own?.length && isContainer(el) ? wrapInFreeCard(el) : own;
  if (kids?.length) {
    const next = { ...el, children: kids.map(resolveElement) } as Element;
    const fit = isContainer(next) ? hugged(next) : null;
    return fit ? ({ ...next, ...fit } as Element) : next;
  }
  return el;
}

/**
 * Guess a layout spec from how the children are already arranged, so turning
 * auto-layout on is close to a no-op rather than a scramble. Direction comes
 * from which axis the children actually vary along; the gap is the median of
 * the existing gaps, rounded onto the spacing scale.
 */
export function inferLayout(card: Element, fallbackPadding: number = LAYOUT.cardPadding): LayoutSpec {
  const kids = (card as { children?: Element[] }).children ?? [];
  const c = card as { x?: number; y?: number };

  const boxes = kids
    .map((k) => {
      const e = k as { x?: number; y?: number };
      if (typeof e.x !== 'number' || typeof e.y !== 'number') return null;
      return { x: e.x, y: e.y, ...measureElement(k) };
    })
    .filter((b): b is { x: number; y: number; width: number; height: number } => b !== null);

  if (boxes.length < 2) {
    return { direction: 'vertical', gap: LAYOUT.gap, padding: fallbackPadding };
  }

  const spanX = Math.max(...boxes.map((b) => b.x)) - Math.min(...boxes.map((b) => b.x));
  const spanY = Math.max(...boxes.map((b) => b.y)) - Math.min(...boxes.map((b) => b.y));
  const direction: LayoutSpec['direction'] = spanX > spanY ? 'horizontal' : 'vertical';

  const sorted = [...boxes].sort((a, b) =>
    direction === 'horizontal' ? a.x - b.x : a.y - b.y,
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    gaps.push(
      direction === 'horizontal'
        ? cur.x - (prev.x + prev.width)
        : cur.y - (prev.y + prev.height),
    );
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : LAYOUT.gap;
  const gap = (SPACE as readonly number[]).reduce((best: number, v: number) =>
    Math.abs(v - median) < Math.abs(best - median) ? v : best,
  );

  const inset =
    typeof c.x === 'number'
      ? Math.min(...boxes.map((b) => b.x)) - c.x
      : fallbackPadding;
  const padding = (SPACE as readonly number[]).reduce((best: number, v: number) =>
    Math.abs(v - inset) < Math.abs(best - inset) ? v : best,
  );

  return { direction, gap, padding, align: 'start', justify: 'start' };
}

/**
 * An element's true bounding box, accounting for the two anchors that are not
 * their box's top-left: text `y` is a BASELINE, and a labelled progress row
 * draws above its origin. Getting this wrong is what made a side-by-side
 * icon-and-caption pair look like a clean vertical stack.
 */
export function boundingBox(el: Element): { x: number; y: number; width: number; height: number } | null {
  const size = measureElement(el);

  if (el.type === 'avatar') {
    const r = el.r ?? 11.875;
    return { x: el.cx - r, y: el.cy - r, width: size.width, height: size.height };
  }
  if (el.type === 'connector') {
    return {
      x: Math.min(el.from[0], el.to[0]),
      y: Math.min(el.from[1], el.to[1]),
      width: size.width,
      height: size.height,
    };
  }

  const e = el as Element & { x?: number; y?: number };
  if (typeof e.x !== 'number' || typeof e.y !== 'number') return null;

  if (el.type === 'text') {
    // At the text's own weight and small caps, as it is drawn and measured
    // everywhere else — the role's default weight under-measures bold text.
    const b = measureTextEl(el);
    const x =
      el.anchor === 'middle' ? e.x - b.width / 2 : el.anchor === 'end' ? e.x - b.width : e.x;
    return { x, y: e.y - b.baseline, width: size.width, height: size.height };
  }
  if (el.type === 'stat') {
    const x =
      el.anchor === 'middle' ? e.x - size.width / 2 : el.anchor === 'end' ? e.x - size.width : e.x;
    return { x, y: e.y - statLayout(el).baseline, width: size.width, height: size.height };
  }
  if (el.type === 'progress') {
    return { x: e.x, y: e.y - progressLabelRise(el), width: size.width, height: size.height };
  }
  return { x: e.x, y: e.y, width: size.width, height: size.height };
}

/** Apply auto-layout across a whole document. */
export function resolveLayout(doc: Doc): Doc {
  // Density first: a condensed dashboard is laid out at its condensed sizes.
  // Then fitted buttons, whose width their label sets, at those sizes.
  const elements = fitButtons(hasDensity(doc.elements) ? applyDensity(doc.elements) : doc.elements);
  if (!hasLayout(elements)) return elements === doc.elements ? doc : { ...doc, elements };
  return { ...doc, elements: elements.map(resolveElement) };
}

/** Every `fit` button its label's width — `els` itself when there are none. */
function fitButtons(els: Element[]): Element[] {
  let changed = false;
  const next = els.map((el) => {
    if (el.type === 'button' && el.fit) {
      const width = buttonFitWidth(el);
      if (width !== el.width) {
        changed = true;
        return { ...el, width };
      }
      return el;
    }
    const kids = (el as { children?: Element[] }).children;
    if (!kids?.length) return el;
    const fitted = fitButtons(kids);
    if (fitted === kids) return el;
    changed = true;
    return { ...el, children: fitted } as Element;
  });
  return changed ? next : els;
}

function hasLayout(els: Element[]): boolean {
  return els.some(
    (e) =>
      (isContainer(e) && !!e.layout) ||
      (e.type === 'group' && !!(e.hugWidth || e.hugHeight)) ||
      hasLayout(((e as { children?: Element[] }).children ?? []) as Element[]),
  );
}

/** The three element types that can position children. */
export function isContainer(el: Element): el is Container {
  return el.type === 'card' || el.type === 'subCard' || el.type === 'group';
}
