import { h, text as textNode, type Ctx, type VNode } from '../vsvg.ts';
import { measureText, textBox } from '../fontMetrics.generated.ts';

/**
 * TYPE SCALE — nine sizes, from the design system's own scale.
 *
 * This replaces seventeen ad-hoc roles that conflated three independent
 * things: size, weight and colour. `metricXL` and `tileValue` differed only
 * in weight; `sectionTitle` and `labelSmall` were the same size with
 * different names; `micro` and `rowLabel` were 0.4px apart. Splitting the
 * axes leaves nine steps a designer can actually hold in their head, with
 * `weight` and `tone` as separate props.
 *
 * SIZES come from `tokens/figma/typography.desktop.tokens.json`, multiplied
 * by 0.58, so the ladder is the site's ladder rather than a parallel
 * invention.
 *
 * The factor was 0.45, measured off a single hero title, and it made every
 * illustration read too small. Node `792:13843` in the Marketing UI Assets
 * Repo is the Figma source for `deploy-daily` — the same 560x372 canvas this
 * system renders — so its text nodes are a direct answer rather than an
 * inference:
 *
 *   "15x"            24px   was 19.4  (display)
 *   "Deploy Cadece"  16px   was 12.6  (heading)
 *   "Daily"          14px   was 10.8  (subheading)
 *
 * Three independent anchors agreeing on 1.24-1.30x is a scale error, not
 * three rounding accidents. 0.45 x 1.29 = 0.58, which lands display on 24.9,
 * heading on 16.2 and subheading on 13.9 — within a rounding step of all
 * three.
 */
const SCALE = 0.58;

/** Rounded to 0.1px: the metrics table is a ratio, so this stays exact. */
const step = (dsSize: number) => Math.round(dsSize * SCALE * 10) / 10;

export const TYPE_SIZES = {
  /** `Size/Display/Display Lg` — the biggest hero figure. */
  displayLarge: step(49),
  /** `Size/Display/Display Sm` — a hero number. */
  display: step(43),
  /** `Size/Heading/F1` — the title of a panel. */
  title: step(37),
  /** `Size/Heading/F2` — between a panel's title and a card's. */
  headline: step(32),
  /** `Size/Heading/F3` — a card's own title. */
  heading: step(28),
  /** `Size/Heading/F4` */
  subheading: step(24),
  /** `Size/Paragraph/Large` */
  body: step(21),
  /** `Size/Heading/F5` */
  bodySmall: step(18),
  /** `Size/Paragraph/Base` */
  caption: step(16),
  /** `Size/Heading/F6` — the smallest heading: a group's title inside a card. */
  smallHeading: step(14),
  /** `Size/Paragraph/Small Caps` — an eyebrow over a title: capitals, tracked. */
  eyebrow: step(14),
  /** `Size/Paragraph/Small` */
  label: step(13),
  /** `Size/Paragraph/Small Caps XS` — a smaller eyebrow, a column head. */
  eyebrowSmall: step(12),
  /** `Size/Paragraph/X-Small` — the smallest legible step. */
  micro: step(11),
} as const;
// Not taken: `Size/Paragraph/Tiny` (9) lands on 5.2px, below `micro`, the
// smallest step that still reads in an exported illustration.

export type TypeRole = keyof typeof TYPE_SIZES;

export type TypeWeight = 'regular' | 'semibold' | 'bold';

const WEIGHT_VALUE: Record<TypeWeight, number> = {
  regular: 400,
  semibold: 600,
  bold: 700,
};

/** The weight a step takes when none is given. */
const DEFAULT_WEIGHT: Record<TypeRole, TypeWeight> = {
  displayLarge: 'bold',
  display: 'bold',
  title: 'semibold',
  headline: 'semibold',
  heading: 'semibold',
  subheading: 'semibold',
  body: 'regular',
  bodySmall: 'semibold',
  caption: 'regular',
  smallHeading: 'semibold',
  eyebrow: 'semibold',
  label: 'semibold',
  eyebrowSmall: 'semibold',
  micro: 'regular',
};

/** Optical tracking: large type tightens, the smallest steps open up. */
const TRACKING: Partial<Record<TypeRole, number>> = {
  displayLarge: -0.5,
  display: -0.4,
  title: -0.2,
  headline: -0.15,
  heading: -0.1,
};

export function typeStyle(role: TypeRole, weight?: TypeWeight) {
  const w = weight ?? DEFAULT_WEIGHT[role];
  return {
    size: TYPE_SIZES[role],
    weight: WEIGHT_VALUE[w],
    tracking: TRACKING[role] ?? 0,
  };
}

/**
 * Kept as a lookup so the rest of the library can read `.size` / `.weight`
 * off a role without threading a weight through every call site.
 */
/**
 * SMALL CAPS — the Marketing UI Assets `Small Caps` text style (the "CART
 * TOTAL" over the Cart Summary card's figure, Figma 665:13337): set in
 * capitals, semibold, letter-spaced 6% of the size. Any step on the scale can
 * take it. The capitals are in the text itself rather than a CSS
 * `text-transform`, which rasterisers and a paste into Figma ignore.
 */
const SMALL_CAPS_TRACKING = 0.06;

/** Roles set in small caps unless the text says otherwise — the eyebrows. */
const CAPS_ROLES: ReadonlySet<TypeRole> = new Set(['eyebrow', 'eyebrowSmall']);
/** Whether text is in small caps: its own `smallCaps`, else its role's default. */
const capsOf = (t: { role?: TypeRole; smallCaps?: boolean }) => t.smallCaps ?? (t.role ? CAPS_ROLES.has(t.role) : false);

type Styled = { role: TypeRole; weight?: TypeWeight; smallCaps?: boolean; maxWidth?: number };

/** `typeStyle`, with small caps applied: semibold unless the weight is set, and tracked. */
export function textStyle(t: Styled) {
  const caps = capsOf(t);
  const base = typeStyle(t.role, t.weight ?? (caps ? 'semibold' : undefined));
  return caps ? { ...base, tracking: Math.round(base.size * SMALL_CAPS_TRACKING * 100) / 100 } : base;
}

/** The characters actually drawn. */
export function shownText(t: { content: string; role?: TypeRole; smallCaps?: boolean }): string {
  return capsOf(t) ? t.content.toUpperCase() : t.content;
}

/**
 * A text element's line box, as drawn. Small caps counts its letter-spacing
 * in the width; the scale's own optical tracking has never been counted, and
 * counting it now would shift the shipped layouts.
 */
export function measureTextEl(t: Styled & { content: string }) {
  const style = textStyle(t);
  const content = shownText(t);
  const tracked = (s: string) =>
    measureText(s, style.size, style.weight) + (capsOf(t) ? style.tracking * [...s].length : 0);
  const lines = t.maxWidth ? wrapLines(content, tracked, t.maxWidth) : [content];
  const box = textBox(content, style.size, style.weight);
  const width = Math.max(...lines.map(tracked));
  const height = box.height + (lines.length - 1) * lineLead(style.size);
  return { ...box, width, height, style, content, lines };
}

/** From one line's baseline to the next. */
export const lineLead = (size: number) => size * 1.25;

/*
 * Characters a line may not start with (Japanese line-breaking, kinsoku):
 * closing brackets, the small kana and the stops. A break that would put one
 * at the head of a line moves back a character, so it ends the line before.
 */
const NO_START = /[、。，．・：；？！ー）」』】〉》〕ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ,.;:!?)\]}%]/u;
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

/**
 * `text` in lines no wider than `max`, as `width` measures them. Latin text
 * breaks at spaces; Japanese, which has none, between any two characters —
 * except before a mark that may not start a line. A word longer than the
 * line breaks where it must. One line when it fits.
 */
export function wrapLines(text: string, width: (s: string) => number, max: number): string[] {
  if (width(text) <= max) return [text];
  const chars = [...text];
  const lines: string[] = [];
  let start = 0;
  while (start < chars.length) {
    // The longest run from `start` that fits.
    let end = start + 1;
    while (end < chars.length && width(chars.slice(start, end + 1).join('')) <= max) end++;
    if (end < chars.length) {
      // Back to a break the script allows: after a space, or between CJK characters.
      let brk = end;
      while (brk > start + 1 && !(chars[brk - 1] === ' ' || (CJK.test(chars[brk - 1]) || CJK.test(chars[brk])) && !NO_START.test(chars[brk]))) brk--;
      if (brk > start + 1) end = brk;
    }
    const line = chars.slice(start, end).join('').trim();
    if (line) lines.push(line);
    start = end;
    while (chars[start] === ' ') start++;
  }
  return lines.length ? lines : [text];
}

export const TYPE_ROLES = Object.fromEntries(
  (Object.keys(TYPE_SIZES) as TypeRole[]).map((r) => [r, typeStyle(r)]),
) as Record<TypeRole, { size: number; weight: number; tracking: number }>;



export interface TextProps {
  x: number;
  /** Baseline y. */
  y: number;
  role: TypeRole;
  content: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Overrides the step's default weight. */
  weight?: TypeWeight;
  /** Resolved colour. See `resolveTone` in render.ts. */
  color?: string;
  underline?: boolean;
  strikethrough?: boolean;
  /** Capitals, semibold, tracked — see `textStyle`. */
  smallCaps?: boolean;
  /** Wrap onto more lines rather than run wider than this — see `wrapLines`. */
  maxWidth?: number;
}

/**
 * Where the decoration lines sit, as fractions of the font size — Source
 * Sans 3's own underline position and stroke, and a strike through the
 * middle of the lowercase (half its 0.486 x-height).
 */
const DECORATION = { underline: 0.09, strike: -0.243, thickness: 0.05 } as const;

/**
 * TEXT — a real `<text>` node, which the current exports do not have.
 *
 * This is the single biggest functional win of the rebuild: copy becomes
 * editable, translatable, searchable, and re-themable, and the analytics
 * illustration drops from 739 paths to a couple of dozen nodes.
 */
export function Text(ctx: Ctx, props: TextProps): VNode {
  // Wrapped: each line a text of its own, a lead apart, from the first baseline.
  if (props.maxWidth) {
    const { lines, style } = measureTextEl(props);
    if (lines.length > 1) {
      return h(
        'g',
        { 'data-el': 'text-wrapped' },
        lines.map((line, i) =>
          Text(ctx, { ...props, maxWidth: undefined, content: line, y: props.y + i * lineLead(style.size) }),
        ),
      );
    }
  }
  const role = textStyle(props);
  const content = shownText(props);
  const f = ctx.tokens.font;
  const fill = props.color ?? ctx.tokens.text.primary;

  const node = textNode(
    'text',
    {
      x: props.x,
      y: props.y,
      'font-family': f.family,
      'font-size': role.size,
      'font-weight': role.weight,
      'letter-spacing': role.tracking || undefined,
      fill,
      'text-anchor': props.anchor === 'start' ? undefined : props.anchor,
      'data-el': 'text',
    },
    content,
  );
  if (!props.underline && !props.strikethrough) return node;

  /*
   * Drawn as lines rather than SVG's `text-decoration`, which rasterisers
   * and a paste into Figma handle unevenly. The width comes from the same
   * metrics table the layout uses, plus the tracking the text is set with,
   * so the line spans exactly the words.
   */
  const width =
    measureText(content, role.size, role.weight) + (role.tracking || 0) * [...content].length;
  const x0 =
    props.anchor === 'middle' ? props.x - width / 2 : props.anchor === 'end' ? props.x - width : props.x;
  const t = Math.max(role.size * DECORATION.thickness, 0.5);
  const rule = (dy: number) =>
    h('rect', { x: x0, y: props.y + dy * role.size - t / 2, width, height: t, fill });

  return h('g', { 'data-el': 'text-decorated' }, [
    node,
    props.underline ? rule(DECORATION.underline) : null,
    props.strikethrough ? rule(DECORATION.strike) : null,
  ]);
}
