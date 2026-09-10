import { h, text, rawNode, createCtx, toSVGString, type Ctx, type VNode } from './vsvg.ts';
import { themes, type ThemeName } from './tokens.ts';
import {
  Stage,
  GlassPanel,
  SubCard,
  Text,
  LineChart,
  BarChart,
  Pill,
  Badge,
  Button,
  Toggle,
  InputField,
  WindowChrome,
  ProgressRow,
  SkeletonBar,
  IconTile,
  IconGrid,
  StatBlock,
  Avatar,
  Connector,
  Arrow,
  MapDots,
} from './primitives/index.ts';
import { ICONS } from './icons.ts';
import { paletteDark, paletteLight } from './palette.generated.ts';
import { GLASS_ICONS } from './glassIcons.generated.ts';
import type { Doc, Element } from './document.ts';
import { resolveLayout } from './autolayout.ts';

/**
 * Resolve a document `tone` to a colour.
 *
 * Two layers, in order:
 *
 *   1. The SEMANTIC tones — `accent`, `success`, `muted` — which mean the same
 *      thing in both themes and are what a document should normally say.
 *   2. Any key in the generated palette, as an ESCAPE HATCH. A designer who
 *      needs `brand-primary-darken-3` for one label can have it, and it still
 *      resolves per theme, still comes from the design file, and still cannot
 *      be an arbitrary hex. Overriding stays inside the system.
 *
 * An unknown name resolves to `undefined`, which leaves the primitive's own
 * default — a typo degrades to the normal colour rather than to nothing.
 */
export function resolveTone(ctx: Ctx, tone: string | undefined): string | undefined {
  if (!tone) return undefined;
  const tk = ctx.tokens;
  switch (tone) {
    case 'primary':
      return tk.text.primary;
    case 'accent':
      return tk.accent.base;
    case 'accentSoft':
      return tk.accent.soft;
    case 'product':
      return tk.accent.product;
    case 'success':
      return tk.status.success;
    case 'info':
      return tk.status.info;
    case 'muted':
      return tk.text.muted;
    case 'subtle':
      return tk.text.subtle;
    case 'onAccent':
      return tk.text.onAccent;
    default:
      break;
  }
  const table = tk.name === 'light' ? paletteLight : paletteDark;
  return (table as Record<string, string>)[tone];
}

const toneColor = resolveTone;

/** Dispatch one document element to its primitive. */
function renderElement(ctx: Ctx, el: Element, path?: string): VNode | null {
  const node = renderElementInner(ctx, el, path);
  if (!node || path === undefined) return node;
  // One addressable wrapper per element. `pointer-events: all` so clicks land
  // on the group even where the artwork is transparent.
  return h('g', { 'data-path': path, style: 'pointer-events:all' }, [node]);
}

function renderElementInner(ctx: Ctx, el: Element, path?: string): VNode | null {
  const kid = (children: Element[] | undefined) =>
    (children ?? []).map((c, i) =>
      renderElement(ctx, c, path === undefined ? undefined : `${path}.${i}`),
    );

  switch (el.type) {
    case 'text':
      return Text(ctx, { ...el, color: toneColor(ctx, el.tone) });

    case 'card':
      return GlassPanel(ctx, {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        radius: el.radius,
        surface: el.surface,
        children: kid(el.children),
      });

    case 'group':
      // Positioning only — a group draws nothing itself.
      return h('g', { 'data-el': 'group' }, kid(el.children));

    case 'subCard':
      return SubCard(ctx, {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        radius: el.radius,
        variant: el.variant,
        surface: el.surface,
        children: kid(el.children),
      });

    case 'pill':
      return Pill(ctx, el);

    case 'badge':
      return Badge(ctx, el);

    case 'button':
      return Button(ctx, el);

    case 'toggle':
      return Toggle(ctx, el);

    case 'input':
      return InputField(ctx, el);

    case 'chrome':
      return WindowChrome(ctx, el);

    case 'lineChart':
      return LineChart(ctx, el);

    case 'barChart':
      return BarChart(ctx, el);

    case 'progress':
      return ProgressRow(ctx, el);

    case 'skeleton':
      return SkeletonBar(ctx, el);

    case 'stat':
      return StatBlock(ctx, el);

    case 'icon':
      return IconTile(ctx, {
        x: el.x,
        y: el.y,
        size: el.size,
        tone: el.tone,
        icon: el.icon ? ICONS[el.icon] : undefined,
      });

    case 'iconGrid':
      return IconGrid(ctx, el);

    case 'avatar':
      return Avatar(ctx, el);

    case 'connector':
      return Connector(ctx, el);

    case 'arrow':
      return Arrow(ctx, el);

    case 'map':
      return MapDots(ctx, el);

    case 'spotIcon':
      return renderSpotIcon(ctx, el);

    case 'image': {
      // An element with no file yet would render nothing at all — invisible
      // and unselectable. Draw the empty box so it can be found and filled.
      if (!el.href) return placeholderBox(ctx, el, 'Image');
      const clipId = el.radius ? ctx.uid('imgclip') : null;
      if (clipId) {
        ctx.defs.push(
          h('clipPath', { id: clipId }, [
            h('rect', { x: el.x, y: el.y, width: el.width, height: el.height, rx: el.radius }),
          ]),
        );
      }
      return h('g', { 'data-el': 'image' }, [
        h('image', {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          href: el.href,
          'xlink:href': el.href,
          preserveAspectRatio:
            (el.fit ?? 'cover') === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet',
          'clip-path': clipId ? `url(#${clipId})` : undefined,
        }),
      ]);
    }

    case 'svg': {
      if (!el.body) return placeholderBox(ctx, el, 'SVG');
      const [vx, vy, vw, vh] = el.viewBox;
      // `contain` keeps the aspect ratio by scaling on the tighter axis.
      const sx = el.width / vw;
      const sy = el.height / vh;
      const s = (el.fit ?? 'contain') === 'contain' ? Math.min(sx, sy) : null;
      const ox = s ? (el.width - vw * s) / 2 : 0;
      const oy = s ? (el.height - vh * s) / 2 : 0;
      const scale = s ? `scale(${s})` : `scale(${sx} ${sy})`;
      return rawNode(
        'g',
        {
          transform: `translate(${el.x + ox} ${el.y + oy}) ${scale} translate(${-vx} ${-vy})`,
          'data-el': 'imported-svg',
        },
        // Same per-instance namespacing the glass icons use: two copies of one
        // import on a page must not share gradient ids.
        el.body.replaceAll('__NS__', `${ctx.uid('imp')}-`),
      );
    }
  }
}

/**
 * An asset element with no file yet. Drawn as a dashed box so the empty
 * element is visible and selectable in the editor instead of being a
 * zero-pixel hit target; a finished illustration has none of these.
 */
function placeholderBox(
  ctx: Ctx,
  el: { x: number; y: number; width: number; height: number },
  label: string,
): VNode {
  const t = ctx.tokens;
  return h('g', { 'data-el': 'placeholder' }, [
    h('rect', {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rx: 4,
      fill: 'none',
      stroke: t.text.subtle,
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
    }),
    text(
      'text',
      {
        x: el.x + el.width / 2,
        y: el.y + el.height / 2 + 3,
        'text-anchor': 'middle',
        'font-family': t.font.family,
        'font-size': 8,
        fill: t.text.subtle,
      },
      label,
    ),
  ]);
}

/**
 * SPOT ICON — the design system's glass icons, placed as artwork.
 *
 * These replace the glyphs I hand-drew earlier. They are real, art-directed
 * assets with a *separate* light variant rather than a recolour, which is the
 * only honest way to theme artwork this rich — the dark version is lit from
 * inside, the light one from outside.
 *
 * Each icon carries its own viewBox with its own bleed, so the transform maps
 * that box onto the requested size. A missing key renders a visible
 * placeholder rather than nothing, and a missing *light* variant falls back to
 * the dark art (see `lightIsFallback` — 1 of 19 today).
 */
function renderSpotIcon(
  ctx: Ctx,
  el: Extract<Element, { type: 'spotIcon' }>,
): VNode {
  const size = el.size ?? 48;
  const icon = GLASS_ICONS[el.name];

  if (!icon) {
    return h('g', { 'data-el': 'spot-icon-missing' }, [
      h('rect', {
        x: el.x,
        y: el.y,
        width: size,
        height: size,
        rx: 4,
        fill: ctx.tokens.text.subtle,
        'fill-opacity': 0.4,
      }),
    ]);
  }

  const art = ctx.tokens.name === 'light' ? icon.light : icon.dark;
  const [vx, vy, vw, vh] = art.viewBox;
  const scale = size / Math.max(vw, vh);

  // Substitute the generator's `__NS__` placeholder with a namespace unique to
  // this instance, so the same icon can appear twice on a page — or in two
  // documents inlined side by side — without its gradients colliding.
  const body = art.body.replaceAll('__NS__', `${ctx.uid('gi')}-`);

  return rawNode(
    'g',
    {
      transform: `translate(${el.x} ${el.y}) scale(${scale}) translate(${-vx} ${-vy})`,
      'data-el': 'spot-icon',
      'data-icon': el.name,
    },
    body,
  );
}

export interface RenderOptions {
  /**
   * Tag every element group with `data-path`, so the editor can hit-test a
   * click back to a document element and measure it with `getBBox()`. Left
   * off for exports, which shouldn't carry editor metadata.
   */
  annotate?: boolean;
}

/**
 * Build the document as a virtual-SVG tree.
 *
 * Layering, and why it's shaped this way: glass surfaces need something real
 * to blur. So the stage and the panels go into `<defs>` as referenceable
 * groups, and are drawn via `<use>`. That lets a panel blur the stage, and a
 * card blur the stage *plus* the panels, without rendering either twice.
 *
 *   defs: #bd-stage  = stage layers
 *         #bd-base   = <use #bd-stage> + panels   (panels blur #bd-stage)
 *   body: <use #bd-base>                            visible stage + panels
 *         content                                   (cards blur #bd-base)
 */
export function buildDocument(
  doc: Doc,
  theme: ThemeName,
  options: RenderOptions = {},
): VNode {
  // Auto-layout containers compute their children's positions, so the
  // document is resolved before anything is drawn from it.
  doc = resolveLayout(doc);
  const { width, height } = doc.canvas;
  const ctx = createCtx(themes[theme], `${doc.id}-${theme}`, { width, height });
  const ns = `${doc.id}-${theme}`;

  const stageId = `${ns}-bd-stage`;
  const baseId = `${ns}-bd-base`;

  // Stage first, with no backdrop of its own.
  const stage = Stage(ctx, { width, height, glow: doc.glow });

  // Panels blur the stage.
  ctx.backdropId = stageId;
  const panels = (doc.panels ?? []).map((p) =>
    GlassPanel(ctx, {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      radius: p.radius,
      surface: p.surface,
    }),
  );

  // Content blurs the stage *and* the panels.
  ctx.backdropId = baseId;
  const content = h(
    'g',
    { 'data-el': 'content' },
    doc.elements.map((el, i) =>
      renderElement(ctx, el, options.annotate ? String(i) : undefined),
    ),
  );

  const backdrops = [
    h('g', { id: stageId }, [stage]),
    h('g', { id: baseId }, [
      h('use', { href: `#${stageId}`, 'xlink:href': `#${stageId}` }),
      ...panels,
    ]),
  ];

  return h(
    'svg',
    {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      'data-illustration': doc.id,
      'data-theme': theme,
    },
    [
      h('defs', {}, [...backdrops, ...ctx.defs]),
      h('use', { href: `#${baseId}`, 'xlink:href': `#${baseId}` }),
      content,
    ],
  );
}

export function renderDocument(
  doc: Doc,
  theme: ThemeName,
  options: RenderOptions = {},
): string {
  return toSVGString(buildDocument(doc, theme, options));
}
