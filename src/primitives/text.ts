import { h, text as textNode, type Ctx, type VNode } from '../vsvg.ts';
import { measureText } from '../fontMetrics.generated.ts';

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
  /** `Size/Display/Display Sm` — a hero number. */
  display: step(43),
  /** `Size/Heading/F1` — the title of a panel. */
  title: step(37),
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
  /** `Size/Paragraph/Small` */
  label: step(13),
  /** `Size/Paragraph/X-Small` — the smallest legible step. */
  micro: step(11),
} as const;

export type TypeRole = keyof typeof TYPE_SIZES;

export type TypeWeight = 'regular' | 'semibold' | 'bold';

const WEIGHT_VALUE: Record<TypeWeight, number> = {
  regular: 400,
  semibold: 600,
  bold: 700,
};

/** The weight a step takes when none is given. */
const DEFAULT_WEIGHT: Record<TypeRole, TypeWeight> = {
  display: 'bold',
  title: 'semibold',
  heading: 'semibold',
  subheading: 'semibold',
  body: 'regular',
  bodySmall: 'semibold',
  caption: 'regular',
  label: 'semibold',
  micro: 'regular',
};

/** Optical tracking: large type tightens, the smallest steps open up. */
const TRACKING: Partial<Record<TypeRole, number>> = {
  display: -0.4,
  title: -0.2,
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
  const role = typeStyle(props.role, props.weight);
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
    props.content,
  );
  if (!props.underline && !props.strikethrough) return node;

  /*
   * Drawn as lines rather than SVG's `text-decoration`, which rasterisers
   * and a paste into Figma handle unevenly. The width comes from the same
   * metrics table the layout uses, plus the tracking the text is set with,
   * so the line spans exactly the words.
   */
  const width =
    measureText(props.content, role.size, role.weight) + (role.tracking || 0) * [...props.content].length;
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
