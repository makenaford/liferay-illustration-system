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
  ChatBubble,
  WindowChrome,
  ProgressRow,
  SkeletonBar,
  IconTile,
  IconGrid,
  StatBlock,
  Avatar,
  Connector,
  Arrow,
  Cursor,
  MapDots,
} from './primitives/index.ts';
import { ICONS } from './icons.ts';
import { GLASS_ICONS } from './glassIcons.generated.ts';
import { GRAPHICS } from './graphics.generated.ts';
import { BACKDROP_SLOT } from './figmaGlass.ts';
import { FONT_FACES } from './font.generated.ts';
import type { Doc, Element } from './document.ts';
import { boundingBox, resolveLayout } from './autolayout.ts';
import { reattach } from './attach.ts';
import { paintOf } from './colors.ts';
import { cssAngleLine } from './primitives/surface.ts';

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
export function resolveTone(
  ctx: Ctx,
  tone: string | undefined,
  /**
   * The box a gradient spans, in user space. Needed where the painted shape
   * can have no area — a flat rule — since a gradient sized to the shape's
   * own bounding box then draws nothing. Omit it and the gradient spans
   * whatever it paints.
   */
  box?: { x: number; y: number; width: number; height: number },
): string | undefined {
  const paint = paintOf(ctx.tokens, tone);
  if (!paint) return undefined;
  if ('color' in paint) return paint.color;
  const { angle, stops } = paint.gradient;
  const id = ctx.uid('tonegrad');
  const line = box
    ? cssAngleLine(angle, box.x, box.y, Math.max(box.width, 1), Math.max(box.height, 1))
    : cssAngleLine(angle, 0, 0, 1, 1);
  ctx.defs.push(
    h(
      'linearGradient',
      { id, ...line, gradientUnits: box ? 'userSpaceOnUse' : 'objectBoundingBox' },
      stops.map((st, k) =>
        h('stop', {
          offset: st.offset ?? (stops.length > 1 ? k / (stops.length - 1) : 0),
          'stop-color': st.color,
          'stop-opacity': st.opacity,
        }),
      ),
    ),
  );
  return `url(#${id})`;
}

const toneColor = resolveTone;

/** Callouts, which a clipping hero panel leaves whole. See `PanelSpec.clip`. */
const FLOATING = new Set<Element['type']>([
  'cursor', 'button', 'pill', 'badge', 'icon', 'spotIcon', 'connector', 'arrow',
]);

/** `nodes`, cut to a rounded rectangle. */
function clipTo(
  ctx: Ctx,
  box: { x: number; y: number; width: number; height: number; radius?: number },
  nodes: (VNode | null)[],
): VNode {
  const id = ctx.uid('clip');
  const { x, y, width, height } = box;
  ctx.defs.push(h('clipPath', { id }, [h('rect', { x, y, width, height, rx: box.radius ?? 0 })]));
  return h('g', { 'clip-path': `url(#${id})`, 'data-el': 'clip' }, nodes);
}

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
  // A container's children, cut to its own shape when it clips content.
  const contents = (
    c: { x: number; y: number; width: number; height: number; clip?: boolean; children?: Element[] },
    radius: number,
  ) => (c.clip ? [clipTo(ctx, { ...c, radius }, kid(c.children))] : kid(c.children));

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
        children: contents(el, el.radius ?? ctx.tokens.radius.panel),
      });

    case 'group':
      // Positioning only — a group draws nothing itself.
      return h('g', { 'data-el': 'group' }, contents(el, 0));

    case 'subCard':
      return SubCard(ctx, {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        radius: el.radius,
        variant: el.variant,
        surface: el.surface,
        children: contents(el, el.radius ?? 4),
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

    case 'chat':
      return ChatBubble(ctx, el);

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
        color: resolveTone(ctx, el.tone),
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

    case 'cursor':
      return Cursor(ctx, el);

    case 'line': {
      const x2 = el.x + el.width;
      const y2 = el.y + el.height;
      return h('g', { 'data-el': 'line' }, [
        h('line', {
          x1: el.x,
          y1: el.y,
          x2,
          y2,
          stroke: toneColor(ctx, el.tone ?? 'neutral-02', {
            x: Math.min(el.x, x2),
            y: Math.min(el.y, y2),
            width: Math.abs(el.width),
            height: Math.abs(el.height),
          }),
          'stroke-width': el.thickness ?? 1,
          'stroke-linecap': el.rounded ? 'round' : 'butt',
        }),
        // A hairline is nearly impossible to click, so the editor gets a wide
        // invisible stroke to hit. Exports (no path) leave it out.
        path !== undefined
          ? h('line', { x1: el.x, y1: el.y, x2, y2, stroke: 'transparent', 'stroke-width': 8 })
          : null,
      ]);
    }

    case 'map':
      return MapDots(ctx, el);

    case 'spotIcon':
      return renderSpotIcon(ctx, el);

    case 'graphic':
      return renderGraphic(ctx, el);

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
      // The source <svg> carries `fill="none"`, which the generator drops with
      // the wrapper; without it here, an unfilled shape paints black wherever
      // the icon is not inside an SVG that happens to set it too.
      fill: 'none',
      'data-el': 'spot-icon',
      'data-icon': el.name,
    },
    body,
  );
}

/**
 * A graphic in the current theme, fitted inside its box and centred — so a
 * resize never distorts it. An unknown graphic draws a visible placeholder.
 */
function renderGraphic(ctx: Ctx, el: Extract<Element, { type: 'graphic' }>): VNode {
  const g = el.art ?? (el.name ? GRAPHICS[el.name] : undefined);
  if (!g) {
    return h('g', { 'data-el': 'graphic-missing' }, [
      h('rect', {
        x: el.x, y: el.y, width: el.width, height: el.height, rx: 6,
        fill: ctx.tokens.text.subtle, 'fill-opacity': 0.25,
      }),
    ]);
  }
  const art = ctx.tokens.name === 'light' ? g.light : g.dark;
  const [vx, vy, vw, vh] = art.viewBox;
  const s = Math.min(el.width / vw, el.height / vh);
  const ox = el.x + (el.width - vw * s) / 2;
  const oy = el.y + (el.height - vh * s) / 2;
  let body = art.body.replaceAll('__NS__', `${ctx.uid('gr')}-`);

  /*
   * The glass frosts the illustration behind it, not just its own artwork:
   * each glass shape's slot gets the backdrop — everything drawn before this
   * graphic, see `buildDocument` — blurred. The copy is placed back in canvas
   * space (the inverse of the graphic's own transform), so it lines up with
   * what it covers and the blur is in canvas px. It is opaque, so nothing
   * sharp shows through the glass.
   */
  const blur = el.blur ?? 12;
  if (body.includes(BACKDROP_SLOT)) {
    let pane = '';
    if (ctx.backdropId && blur > 0) {
      const fid = ctx.uid('grblur');
      const pad = blur * 3;
      ctx.defs.push(
        h(
          'filter',
          {
            id: fid,
            x: -pad,
            y: -pad,
            width: ctx.canvas.width + pad * 2,
            height: ctx.canvas.height + pad * 2,
            filterUnits: 'userSpaceOnUse',
            'color-interpolation-filters': 'sRGB',
          },
          [h('feGaussianBlur', { stdDeviation: blur / 2 })],
        ),
      );
      const inverse = `translate(${vx} ${vy}) scale(${1 / s}) translate(${-ox} ${-oy})`;
      pane =
        `<g transform="${inverse}"><use href="#${ctx.backdropId}" xlink:href="#${ctx.backdropId}" ` +
        `filter="url(#${fid})"/></g>`;
    }
    body = body.split(BACKDROP_SLOT).join(pane);
  }
  return rawNode(
    'g',
    {
      transform: `translate(${ox} ${oy}) scale(${s}) translate(${-vx} ${-vy})`,
      fill: 'none',
      'data-el': 'graphic',
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
  /**
   * Embed the Source Sans 3 faces the drawing uses (`renderDocument` only).
   * On by default, because an exported file cannot load the font any other
   * way. Off where the host page already has it, e.g. the builder's library.
   */
  embedFont?: boolean;
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
  // A document edited outside the builder still draws attached connectors on
  // their elements.
  doc = reattach(doc);
  // Everything is drawn in the ARTBOARD's coordinate space and scaled to the
  // canvas on the way out; the two are the same unless the document says
  // otherwise. See `Doc.artboard`.
  const out = doc.canvas;
  const { width, height } = doc.artboard ?? out;
  const fit = Math.min(out.width / width, out.height / height);
  const ctx = createCtx(themes[theme], `${doc.id}-${theme}`, { width, height });
  const ns = `${doc.id}-${theme}`;

  const stageId = `${ns}-bd-stage`;
  const baseId = `${ns}-bd-base`;

  // Stage first, with no backdrop of its own.
  const stage = Stage(ctx, { width, height, glow: doc.glow, mesh: doc.background });

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

  /*
   * Cursors and graphics float over the content, so their glass blurs it too:
   * each top-level one gets a copy of everything drawn before it, and
   * blurs that. The copy is unannotated, so the editor still hits the real
   * elements. An earlier one inside the copy blurs its own copy, never the
   * one being built, which would be a reference to itself.
   */
  /**
   * The clipping panel an element sits in, by its centre; the last one wins.
   * Callouts float over the window's edge rather than being part of what is
   * on the screen, so they are never clipped.
   */
  const clipping = (doc.panels ?? []).filter((p) => p.clip);
  const panelOf = (el: Element) => {
    if (!clipping.length || FLOATING.has(el.type)) return undefined;
    const b = boundingBox(el);
    if (!b) return undefined;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return [...clipping].reverse().find(
      (p) => cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height,
    );
  };
  const draw = (el: Element, path?: string) => {
    const node = renderElement(ctx, el, path);
    const p = panelOf(el);
    return p && node
      ? clipTo(ctx, { ...p, radius: p.radius ?? ctx.tokens.radius.panel }, [node])
      : node;
  };

  const under = new Map<number, string>();
  const beneath = (i: number) => {
    const id = `${ns}-bd-under${i}`;
    ctx.defs.push(
      h('g', { id }, [
        h('use', { href: `#${baseId}`, 'xlink:href': `#${baseId}` }),
        ...doc.elements.slice(0, i).map((el, j) => {
          ctx.backdropId = under.get(j) ?? baseId;
          const node = draw(el);
          ctx.backdropId = baseId;
          return node;
        }),
      ]),
    );
    under.set(i, id);
    return id;
  };

  const content = h(
    'g',
    { 'data-el': 'content' },
    doc.elements.map((el, i) => {
      // Cursors and graphics are glass over the content: they blur it.
      if (el.type === 'cursor' || el.type === 'graphic') ctx.backdropId = beneath(i);
      const node = draw(el, options.annotate ? String(i) : undefined);
      ctx.backdropId = baseId;
      return node;
    }),
  );

  const backdrops = [
    h('g', { id: stageId }, [stage]),
    h('g', { id: baseId }, [
      h('use', { href: `#${stageId}`, 'xlink:href': `#${stageId}` }),
      ...panels,
    ]),
  ];

  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const body = [
    h('use', { href: `#${baseId}`, 'xlink:href': `#${baseId}` }),
    content,
  ];

  return h(
    'svg',
    {
      width: out.width,
      height: out.height,
      viewBox: `0 0 ${out.width} ${out.height}`,
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      'data-illustration': doc.id,
      'data-theme': theme,
    },
    [
      h('defs', {}, [...backdrops, ...ctx.defs]),
      // No wrapper when the artboard IS the canvas, so the seven documents
      // that never needed one keep byte-identical output.
      ...(fit === 1
        ? body
        : [h(
            'g',
            {
              'data-el': 'artboard',
              transform:
                `translate(${round4((out.width - width * fit) / 2)} ` +
                `${round4((out.height - height * fit) / 2)}) scale(${round4(fit)})`,
            },
            body,
          )]),
    ],
  );
}

export function renderDocument(
  doc: Doc,
  theme: ThemeName,
  options: RenderOptions = {},
): string {
  const tree = buildDocument(doc, theme, options);
  if (options.embedFont !== false) embedFont(tree);
  return toSVGString(tree);
}

/**
 * Add an `@font-face` for each Source Sans 3 weight the tree draws text in,
 * as a data URI, so the file renders in its own face with no network — as an
 * `<img>`, opened directly, or dropped into a page that never loaded the font.
 * Only the weights actually used are embedded; about 20 KB each.
 */
function embedFont(tree: VNode) {
  const weights = new Set<keyof typeof FONT_FACES>();
  const walk = (n: VNode) => {
    if (n.attrs['font-family'] !== undefined) {
      const w = Number(n.attrs['font-weight'] ?? 400);
      // Snap to the three faces the type scale uses.
      weights.add(w >= 650 ? 700 : w >= 500 ? 600 : 400);
    }
    n.children.forEach(walk);
  };
  walk(tree);
  if (!weights.size) return;

  const css = [...weights]
    .sort()
    .map(
      (w) =>
        `@font-face{font-family:'Source Sans 3';font-style:normal;font-weight:${w};` +
        `src:url(data:font/woff2;base64,${FONT_FACES[w]}) format('woff2')}`,
    )
    .join('');
  const defs = tree.children.find((c) => c.tag === 'defs');
  // Raw because it is CSS, not text to escape — and it is our own generated
  // data, never user input, which is the condition `rawNode` asks for.
  defs?.children.unshift(rawNode('style', {}, css));
}
