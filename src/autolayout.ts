import type { Doc, Element, LayoutSpec } from './document.ts';
import { TYPE_ROLES, typeStyle } from './primitives/text.ts';
import { badgeWidth } from './primitives/badge.ts';
import { CHAT_HEIGHT } from './primitives/chatBubble.ts';
import { CURSOR_ASPECT } from './primitives/cursor.ts';
import { axisBand } from './primitives/lineChart.ts';
import { textBox, VERTICAL } from './fontMetrics.generated.ts';
import { LAYOUT, SPACE } from './tokens.ts';

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
      const style = typeStyle(el.role, el.weight);
      return textBox(el.content, style.size, style.weight);
    }
    case 'stat': {
      const vr = TYPE_ROLES[el.valueRole ?? 'title'];
      const lr = TYPE_ROLES[el.labelRole ?? 'caption'];
      const v = textBox(el.value, vr.size, vr.weight);
      const l = el.label ? textBox(el.label, lr.size, lr.weight) : { width: 0, height: 0 };
      return {
        width: Math.max(v.width, l.width),
        height: v.height + (el.label ? l.height + 2 : 0),
      };
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
    case 'input':
      return { width: el.width, height: el.height ?? 28 };
    case 'cursor': {
      const w = el.size ?? 85.5953;
      return { width: w, height: w * CURSOR_ASPECT };
    }
    case 'lineChart':
      // The labels hang below the plot, inside the chart's box.
      return { width: el.width, height: el.height + axisBand(el) };
    case 'chat':
      return { width: el.width, height: el.height ?? CHAT_HEIGHT };
    case 'image':
    case 'svg':
      return { width: el.width, height: el.height };
    case 'card':
    case 'subCard':
    case 'group': {
      if (!el.layout) return { width: el.width, height: el.height };
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
      const role = typeStyle(el.role, el.weight);
      return textBox(el.content, role.size, role.weight).baseline;
    }
    case 'stat': {
      const vr = TYPE_ROLES[el.valueRole ?? 'title'];
      const above = el.labelPosition === 'above' && el.label;
      const lr = TYPE_ROLES[el.labelRole ?? 'caption'];
      const rise = above ? (VERTICAL.ascent + VERTICAL.descent) * lr.size + 2 : 0;
      return rise + textBox(el.value, vr.size, vr.weight).baseline;
    }
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

function containerSize(el: Container): Size {
  const spec = el.layout!;
  const p = pad(spec);
  const kids = el.children ?? [];
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
  return {
    width: round(hugW ? (horizontal ? along : across) + p.left + p.right : el.width),
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
    const vr = TYPE_ROLES[el.valueRole ?? 'title'];
    const b = textBox(el.value, vr.size, vr.weight);
    const lr = TYPE_ROLES[el.labelRole ?? 'caption'];
    const rise =
      el.labelPosition === 'above' && el.label
        ? 14 - lr.size * 0.2 + VERTICAL.ascent * lr.size - VERTICAL.ascent * lr.size
        : 0;
    const anchorX =
      el.anchor === 'middle' ? x + size.width / 2 : el.anchor === 'end' ? x + size.width : x;
    return { ...el, x: round(anchorX), y: round(y + b.baseline + rise) };
  }
  return { ...el, x: round(x), y: round(y) } as Element;
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
  const kids = el.children ?? [];
  if (!kids.length) return { ...el, children: [] } as Element;

  const size = containerSize({ ...el, children: kids });
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
    if (growTotal > 0 && grows[i] > 0 && slack > 0) {
      const extra = (slack * grows[i]) / growTotal;
      if (horizontal) s.width += extra;
      else s.height += extra;
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
      const band = next.type === 'lineChart' ? axisBand(next) : 0;
      next = { ...next, height: round(s.height - band) };
    }

    cursor += mainOf(s) + gap + spread;
    return resolveElement(placeAt(next as Element, x, y, s));
  });

  return {
    ...el,
    width: round(size.width),
    height: round(size.height),
    children: placed,
  } as Element;
}

/** Resolve one element, recursing into containers. */
function resolveElement(el: Element): Element {
  if (isContainer(el) && el.layout) return layoutContainer(el);
  const kids = (el as { children?: Element[] }).children;
  if (kids?.length) {
    return { ...el, children: kids.map(resolveElement) } as Element;
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
    const role = TYPE_ROLES[el.role];
    const b = textBox(el.content, role.size, role.weight);
    const x =
      el.anchor === 'middle' ? e.x - b.width / 2 : el.anchor === 'end' ? e.x - b.width : e.x;
    return { x, y: e.y - b.baseline, width: size.width, height: size.height };
  }
  if (el.type === 'stat') {
    const vr = TYPE_ROLES[el.valueRole ?? 'title'];
    const b = textBox(el.value, vr.size, vr.weight);
    const x =
      el.anchor === 'middle' ? e.x - size.width / 2 : el.anchor === 'end' ? e.x - size.width : e.x;
    return { x, y: e.y - b.baseline, width: size.width, height: size.height };
  }
  if (el.type === 'progress') {
    return { x: e.x, y: e.y - progressLabelRise(el), width: size.width, height: size.height };
  }
  return { x: e.x, y: e.y, width: size.width, height: size.height };
}

/** Apply auto-layout across a whole document. */
export function resolveLayout(doc: Doc): Doc {
  const needed = hasLayout(doc.elements);
  if (!needed) return doc;
  return { ...doc, elements: doc.elements.map(resolveElement) };
}

function hasLayout(els: Element[]): boolean {
  return els.some(
    (e) =>
      (isContainer(e) && !!e.layout) ||
      hasLayout(((e as { children?: Element[] }).children ?? []) as Element[]),
  );
}

/** The three element types that can position children. */
export function isContainer(el: Element): el is Container {
  return el.type === 'card' || el.type === 'subCard' || el.type === 'group';
}
