import { h, text, rawNode, createCtx, toSVGString, type Ctx, type VNode } from './vsvg.ts';
import { PANEL_SURFACE, themes, type ThemeName } from './tokens.ts';
import {
  Stage,
  GlassPanel,
  SubCard,
  Text,
  LineChart,
  BarChart,
  Table,
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
  PieChart,
  Radio,
  FormField,
} from './primitives/index.ts';
import { iconArt } from './icons.ts';
import { GLASS_ICONS } from './glassIcons.generated.ts';
import { GRAPHICS } from './graphics.generated.ts';
import { BACKDROP_SLOT } from './figmaGlass.ts';
import { FONT_FACES } from './font.generated.ts';
import type { Doc, Element, Ink } from './document.ts';
import { boundingBox, resolveLayout } from './autolayout.ts';
import { reattach } from './attach.ts';
import { paintOf } from './colors.ts';
import { cssAngleLine } from './primitives/surface.ts';
import { coverRect } from './imageCrop.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

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
/**
 * An element's colour overrides (`textColor`, `accentColor`), applied to the
 * tokens it draws with. Returns what undoes them. Only a plain colour can
 * stand in for an ink; a gradient key is ignored here.
 */
function applyOverrides(ctx: Ctx, el: { textColor?: string; accentColor?: string }): () => void {
  if (!el.textColor && !el.accentColor) return () => {};
  const outer = ctx.tokens;
  const plain = (key?: string) => {
    const p = paintOf(outer, key);
    return p && 'color' in p ? p.color : undefined;
  };
  const text = plain(el.textColor);
  const accent = plain(el.accentColor);
  ctx.tokens = {
    ...outer,
    // Every ink text is set in, including the one on a filled control.
    ...(text && { text: { ...outer.text, primary: text, muted: text, subtle: text, onAccent: text } }),
    // The accent, and the gradients that stand in for it on toggles and
    // gradient buttons, all in the one colour.
    ...(accent && {
      accent: { ...outer.accent, base: accent, soft: accent, gradient: [accent, accent, accent] as [string, string, string] },
      brandGradient: {
        ...outer.brandGradient,
        line: accent,
        stops: outer.brandGradient.stops.map((st) => ({ ...st, color: accent })),
      },
    }),
  };
  return () => {
    ctx.tokens = outer;
  };
}

function renderElement(ctx: Ctx, el: Element, path?: string): VNode | null {
  const restore = applyOverrides(ctx, el as { textColor?: string; accentColor?: string });
  let node: VNode | null;
  try {
    node = renderElementInner(ctx, el, path);
  } finally {
    restore();
  }
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
  // A container's children, cut to its own shape when it clips content, and
  // drawn in the other theme's ink when the card asks (`Ink`).
  const contents = (
    c: { x: number; y: number; width: number; height: number; clip?: boolean; ink?: Ink; children?: Element[] },
    radius: number,
  ) => {
    const outer = ctx.tokens;
    // The other theme's inks — then the container's own overrides again, which win.
    let undo = () => {};
    if (c.ink) {
      ctx.tokens = themes[c.ink === 'dark' ? 'light' : 'dark'];
      undo = applyOverrides(ctx, c as { textColor?: string; accentColor?: string });
    }
    try {
      return c.clip ? [clipTo(ctx, { ...c, radius }, kid(c.children))] : kid(c.children);
    } finally {
      undo();
      ctx.tokens = outer;
    }
  };

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

    case 'pieChart':
      return PieChart(ctx, el);

    case 'radio':
      return Radio(ctx, el);

    case 'field':
      return FormField(ctx, el);

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

    case 'table':
      return Table(ctx, el);

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
        icon: iconArt(el.icon, el.iconStyle),
      });

    case 'iconGrid':
      return IconGrid(ctx, {
        ...el,
        tone: undefined,
        color: resolveTone(ctx, el.tone ?? 'soft'),
        hitAreas: path !== undefined,
      });

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
      // Placed by hand (src/imageCrop.ts): the picture at its own rectangle,
      // clipped to the frame.
      const placed = coverRect(el);
      if (placed) {
        const id = ctx.uid('imgclip');
        ctx.defs.push(
          h('clipPath', { id }, [h('rect', { x: el.x, y: el.y, width: el.width, height: el.height, rx: el.radius || undefined })]),
        );
        return h('g', { 'data-el': 'image' }, [
          h('image', {
            x: r2(placed.x),
            y: r2(placed.y),
            width: r2(placed.width),
            height: r2(placed.height),
            'xlink:href': el.href,
            preserveAspectRatio: 'none',
            'clip-path': `url(#${id})`,
          }),
        ]);
      }
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
          // One attribute, not both: an embedded image's data is most of an
          // illustration's size. xlink:href is the one every renderer and
          // design tool reads; a browser reads it as well as href.
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
  const icon = el.art ?? GLASS_ICONS[el.name];

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

  const art = (el.variant ?? ctx.tokens.name) === 'light' ? icon.light : icon.dark;
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
  /**
   * A second face for glyphs Source Sans 3 does not have — Noto Sans JP for a
   * Japanese export (see editor/translate.ts). Embedded beside it and named
   * after it in every `font-family`, so Latin text keeps its own face and
   * the rest falls through per character. `faces` is base64 woff2 by weight.
   */
  fallbackFont?: { family: string; faces: Partial<Record<FontWeight, string>> };
}

/**
 * The backdrop blurs of every glass surface in an element and its children —
 * empty when there is no glass in it. A card with no surface draws the
 * default glass; a sub-card's legacy `variant` is resolved by `SubCard`, so
 * one without a surface is taken as glass too.
 */
function glassBlurs(ctx: Ctx, el: Element): number[] {
  const out: number[] = [];
  const walk = (e: Element) => {
    if (e.type === 'card' || e.type === 'subCard') {
      const spec = ctx.tokens.surfaces[e.surface ?? 'glass-default'];
      if (spec?.blur && !spec.recessed) out.push(spec.blur);
    }
    // A table's background is glass only when it has one.
    if (e.type === 'table' && e.surface) {
      const spec = ctx.tokens.surfaces[e.surface];
      if (spec?.blur && !spec.recessed) out.push(spec.blur);
    }
    for (const c of (e as { children?: Element[] }).children ?? []) walk(c);
  };
  walk(el);
  return out;
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
  // A gradient cannot be one bloom's colour; the duo accent takes colours only.
  const accentPaint = doc.background === 'duo' ? paintOf(ctx.tokens, doc.backgroundAccent ?? 'base-aqua') : null;
  const accent = accentPaint && 'color' in accentPaint ? accentPaint.color : undefined;
  // No background: an empty stage, and the glass knows there is nothing under it.
  ctx.transparent = doc.background === 'none';
  const stage = ctx.transparent
    ? h('g', { 'data-el': 'stage' }, [])
    : Stage(ctx, { width, height, glow: doc.glow, mesh: doc.background === 'none' ? undefined : doc.background, accent });

  // Panels blur the stage.
  ctx.backdropId = stageId;
  const panels = (doc.panels ?? []).map((p) =>
    GlassPanel(ctx, {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      radius: p.radius,
      // A hero panel is the pane the composition sits on; cards default to glass-default.
      surface: p.surface ?? PANEL_SURFACE,
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

  /**
   * What lies beneath element `i`: the base, then every element drawn before
   * it — by reference to those elements as drawn (`elId`), never a second
   * drawing, so an image under two frosted panels is still stored once. Each
   * referenced element was itself drawn with its own backdrop, so the copy is
   * exact, and it can only point backwards, so never at itself.
   */
  const elId = (j: number) => `${ns}-el${j}`;
  /*
   * Only what the glass could show: an element clear of it by more than the
   * blur's reach is left out. Beyond saving work, it keeps a stack of glass
   * cards from compounding — each copy holds its own copies of what is under
   * it, so copying everything would double with every card.
   */
  const reach = (el: Element) => {
    const b = boundingBox(el);
    const pad = Math.max(0, ...glassBlurs(ctx, el)) * 1.5;
    return b && { x: b.x - pad, y: b.y - pad, x2: b.x + b.width + pad, y2: b.y + b.height + pad };
  };
  const beneath = (i: number) => {
    const id = `${ns}-bd-under${i}`;
    const r = reach(doc.elements[i]);
    const under = doc.elements.slice(0, i).flatMap((el, j) => {
      const b = r && boundingBox(el);
      const clear = b && (b.x > r.x2 || b.y > r.y2 || b.x + b.width < r.x || b.y + b.height < r.y);
      return clear ? [] : [h('use', { href: `#${elId(j)}`, 'xlink:href': `#${elId(j)}` })];
    });
    ctx.defs.push(h('g', { id }, [h('use', { href: `#${baseId}`, 'xlink:href': `#${baseId}` }), ...under]));
    return id;
  };

  const content = h(
    'g',
    { 'data-el': 'content' },
    doc.elements.map((el, i) => {
      // Glass is glass over the content: cursors, graphics and any card with
      // a glass surface blur what is really beneath them — a screenshot, a
      // photo, the cards before them — not only the stage.
      if (el.type === 'cursor' || el.type === 'graphic' || glassBlurs(ctx, el).length) {
        ctx.backdropId = beneath(i);
      }
      const node = draw(el, options.annotate ? String(i) : undefined);
      ctx.backdropId = baseId;
      // Named, so what floats above it can frost it by reference (`beneath`).
      return node ? h('g', { id: elId(i) }, [node]) : node;
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
  if (options.embedFont !== false) embedFont(tree, options.fallbackFont);
  return toSVGString(tree);
}

type FontWeight = keyof typeof FONT_FACES;

/** Snap to the three faces the type scale uses. */
const snapWeight = (w: number): FontWeight => (w >= 650 ? 700 : w >= 500 ? 600 : 400);

/** The weights a tree sets text in — only text that passes `drawn`, when given. */
function weightsOf(tree: VNode, drawn?: (text: string) => boolean): Set<FontWeight> {
  const weights = new Set<FontWeight>();
  const walk = (n: VNode) => {
    if (n.attrs['font-family'] !== undefined && (!drawn || drawn(n.text ?? ''))) {
      weights.add(snapWeight(Number(n.attrs['font-weight'] ?? 400)));
    }
    n.children.forEach(walk);
  };
  walk(tree);
  return weights;
}

/**
 * The font weights a document's export sets text in, counting only the text
 * that passes `drawn` — what a fallback face has to cover.
 */
export function fontWeights(doc: Doc, theme: ThemeName, drawn?: (text: string) => boolean): FontWeight[] {
  return [...weightsOf(buildDocument(doc, theme), drawn)].sort();
}

/**
 * Add an `@font-face` for each Source Sans 3 weight the tree draws text in,
 * as a data URI, so the file renders in its own face with no network — as an
 * `<img>`, opened directly, or dropped into a page that never loaded the font.
 * Only the weights actually used are embedded; about 20 KB each.
 */
function embedFont(tree: VNode, fallback?: RenderOptions['fallbackFont']) {
  const weights = weightsOf(tree);
  if (!weights.size) return;

  const face = (family: string, w: FontWeight, b64: string) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};` +
    `src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  let css = [...weights].sort().map((w) => face('Source Sans 3', w, FONT_FACES[w])).join('');

  if (fallback) {
    css += [...weights]
      .sort()
      .flatMap((w) => (fallback.faces[w] ? [face(fallback.family, w, fallback.faces[w])] : []))
      .join('');
    const named = `"${fallback.family}"`;
    const rename = (n: VNode) => {
      const f = n.attrs['font-family'];
      if (typeof f === 'string' && !f.includes(named)) {
        n.attrs['font-family'] = f.replace('"Source Sans 3"', `"Source Sans 3", ${named}`);
      }
      n.children.forEach(rename);
    };
    rename(tree);
  }
  const defs = tree.children.find((c) => c.tag === 'defs');
  // Raw because it is CSS, not text to escape — and it is our own generated
  // data, never user input, which is the condition `rawNode` asks for.
  defs?.children.unshift(rawNode('style', {}, css));
}
