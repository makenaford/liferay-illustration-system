/**
 * Minimal virtual-SVG layer.
 *
 * Primitives return plain data (VNode trees) rather than JSX. That keeps the
 * library framework-agnostic: `toSVGString` below is the export path, and a
 * ~30-line `toReact` adapter can render the identical tree as JSX inside the
 * editor. One renderer, two targets, no duplicated drawing logic.
 */

export type Attrs = Record<string, string | number | undefined>;

export interface VNode {
  tag: string;
  attrs: Attrs;
  children: VNode[];
  /** Raw text content, for <text> nodes. */
  text?: string;
  /**
   * Pre-built SVG markup, emitted verbatim.
   *
   * The one escape hatch, and it exists for exactly one job: the design
   * system's glass icons are authored artwork, not something to re-model as
   * VNodes. They arrive as pre-processed markup with their ids already
   * namespaced (see scripts/build-glass-icons.ts), so nothing here needs to
   * understand their internals. Never put user-supplied text through this.
   */
  raw?: string;
}

export function h(
  tag: string,
  attrs: Attrs = {},
  children: (VNode | null | undefined)[] = [],
): VNode {
  return { tag, attrs, children: children.filter(Boolean) as VNode[] };
}

export function text(tag: string, attrs: Attrs, content: string): VNode {
  return { tag, attrs, children: [], text: content };
}

/** A node whose children are pre-built markup. See `VNode.raw`. */
export function rawNode(tag: string, attrs: Attrs, markup: string): VNode {
  return { tag, attrs, children: [], raw: markup };
}

/**
 * Render context. Carries the resolved token set, a defs sink, and a uid
 * factory for gradient/filter ids.
 *
 * ON THE NAMESPACE: a per-render counter is NOT enough. SVG ids are global to
 * the host document, so two illustrations inlined on the same page — a
 * comparison view, a feature grid, any marketing page with two of these —
 * collide, and the second one's gradients silently repaint the first. This bit
 * us during the port: an illustration grew a hard-edged rectangle that
 * vanished when rendered alone. Seeding the namespace with the document id and
 * theme makes ids stable across rebuilds and unique across documents.
 */
export interface Ctx {
  tokens: import('./tokens.ts').Tokens;
  defs: VNode[];
  uid(prefix: string): string;
  /** Canvas size, needed to size backdrop-blur filter regions. */
  canvas: { width: number; height: number };
  /**
   * Id of the group a glass surface should blur to fake translucency.
   *
   * Real background blur, not the Figma export's `foreignObject` +
   * CSS `backdrop-filter` (which renders in browsers and is ignored by every
   * SVG rasteriser). Because we own the whole scene graph we know exactly
   * what sits behind each surface, so we can blur a `<use>` copy of it and
   * clip that to the card shape — genuine frosted glass that survives
   * rasterisation. Swapped as rendering descends: panels blur the stage,
   * cards blur the stage plus panels.
   */
  backdropId?: string;
}

export function createCtx(
  tokens: import('./tokens.ts').Tokens,
  namespace = '',
  canvas: { width: number; height: number } = { width: 0, height: 0 },
): Ctx {
  let n = 0;
  const ns = namespace ? `${namespace}-` : '';
  return {
    tokens,
    defs: [],
    canvas,
    uid: (prefix: string) => `${ns}${prefix}${++n}`,
  };
}

/**
 * A blurred, clipped copy of the current backdrop — the frosted pane itself.
 *
 * Emits both `href` and `xlink:href`: browsers take the former, several SVG
 * rasterisers still only understand the latter.
 */
export function backdropPane(
  ctx: Ctx,
  clipShape: VNode,
  blur: number,
): VNode | null {
  if (!ctx.backdropId || blur <= 0) return null;

  const clipId = ctx.uid('paneclip');
  const blurId = ctx.uid('paneblur');
  const pad = blur * 3;

  ctx.defs.push(
    h('clipPath', { id: clipId }, [clipShape]),
    h(
      'filter',
      {
        id: blurId,
        x: -pad,
        y: -pad,
        width: ctx.canvas.width + pad * 2,
        height: ctx.canvas.height + pad * 2,
        filterUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      },
      // Figma's "background blur: 20" is a radius; feGaussianBlur takes sigma.
      [h('feGaussianBlur', { stdDeviation: blur / 2 })],
    ),
  );

  return h('g', { 'clip-path': `url(#${clipId})`, 'data-el': 'backdrop-pane' }, [
    h('use', {
      href: `#${ctx.backdropId}`,
      'xlink:href': `#${ctx.backdropId}`,
      filter: `url(#${blurId})`,
    }),
  ]);
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** Round numbers to 3dp — keeps exported files small without visible drift. */
function attrValue(v: string | number): string {
  return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : escape(v);
}

export function toSVGString(node: VNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const attrs = Object.entries(node.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${attrValue(v as string | number)}"`)
    .join('');

  if (node.raw !== undefined) {
    return `${pad}<${node.tag}${attrs}>${node.raw}</${node.tag}>`;
  }
  if (node.text !== undefined) {
    return `${pad}<${node.tag}${attrs}>${escape(node.text)}</${node.tag}>`;
  }
  if (node.children.length === 0) {
    return `${pad}<${node.tag}${attrs}/>`;
  }
  const inner = node.children.map((c) => toSVGString(c, indent + 1)).join('\n');
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}
