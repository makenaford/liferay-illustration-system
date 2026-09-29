import { h, backdropPane, type Ctx, type VNode } from '../vsvg.ts';

export interface CursorProps {
  /** Top left of the artwork's box, which includes the drop shadow's room. */
  x: number;
  y: number;
  /** Width of that box. The height follows at the artwork's 86:99. */
  size?: number;
  /** `arrow`, the pointer (default), or `hand`, an open hand for dragging. */
  variant?: 'arrow' | 'hand';
}

/**
 * The cursor from the Marketing UI Assets file (node 268:5172), in its own
 * 86 x 99 box: a gradient arrow, and over it, offset up and left, a glass
 * arrow in `Blue Light` at 30% with a white inner glow and a navy drop shadow.
 */
const BOX = { width: 85.5953, height: 98.2979 };
export const CURSOR_ASPECT = BOX.height / BOX.width;

const BACK =
  'M29.1591 24.007C25.4842 20.2914 19.1524 22.8937 19.1524 28.1197V58.0403C19.1524 63.2121 25.3722 65.8387 29.0792 62.2323L34.4247 57.0319C34.9551 56.5675 35.6365 56.312 36.3416 56.3132L47.1094 56.3309C52.309 56.3394 54.9337 50.0664 51.2772 46.3696L29.1591 24.007Z';
const GLASS =
  'M24.9268 69.3363C20.5987 73.5322 13.3541 70.4653 13.3541 64.4373V17.0367C13.3541 10.9566 20.7061 7.91282 25.0038 12.2136L59.7158 46.9499C64.0119 51.249 60.9671 58.5962 54.8894 58.5962H37.0988C36.467 58.5962 35.8547 58.8151 35.3661 59.2157L24.9268 69.3363Z';

/**
 * The drag hand, drawn to the arrow's recipe in the same box: a glass hand —
 * four fingers, palm and thumb as rounded strokes, unioned by the fill — over
 * the same hand in the gradient, a little smaller and offset down and right,
 * so the blue sits under the glass as it does under the arrow's. Every subpath winds clockwise, so the union has no holes
 * for the clip and the inner glow. Generated from those shapes, not traced.
 */
const HAND_BACK =
  'M34.94 32.5L34.94 50.5A5.04 5.04 0 0 1 24.86 50.5L24.86 32.5A5.04 5.04 0 0 1 34.94 32.5ZM45.29 28L45.29 50.5A5.04 5.04 0 0 1 35.21 50.5L35.21 28A5.04 5.04 0 0 1 45.29 28ZM55.64 29.8L55.64 50.5A5.04 5.04 0 0 1 45.56 50.5L45.56 29.8A5.04 5.04 0 0 1 55.64 29.8ZM65.99 36.1L65.99 52.3A5.04 5.04 0 0 1 55.91 52.3L55.91 36.1A5.04 5.04 0 0 1 65.99 36.1ZM36.56 41.5H54.29A11.7 11.7 0 0 1 65.99 53.2V62.2A11.7 11.7 0 0 1 54.29 73.9H36.56A11.7 11.7 0 0 1 24.86 62.2V53.2A11.7 11.7 0 0 1 36.56 41.5ZM23.619 45.726L32.169 57.426A5.04 5.04 0 0 1 24.031 63.374L15.481 51.674A5.04 5.04 0 0 1 23.619 45.726Z';
const HAND_GLASS =
  'M29.6 24L29.6 44A5.6 5.6 0 0 1 18.4 44L18.4 24A5.6 5.6 0 0 1 29.6 24ZM41.1 19L41.1 44A5.6 5.6 0 0 1 29.9 44L29.9 19A5.6 5.6 0 0 1 41.1 19ZM52.6 21L52.6 44A5.6 5.6 0 0 1 41.4 44L41.4 21A5.6 5.6 0 0 1 52.6 21ZM64.1 28L64.1 46A5.6 5.6 0 0 1 52.9 46L52.9 28A5.6 5.6 0 0 1 64.1 28ZM31.4 34H51.1A13 13 0 0 1 64.1 47V57A13 13 0 0 1 51.1 70H31.4A13 13 0 0 1 18.4 57V47A13 13 0 0 1 31.4 34ZM17.021 38.696L26.521 51.696A5.6 5.6 0 0 1 17.479 58.304L7.979 45.304A5.6 5.6 0 0 1 17.021 38.696Z';

/**
 * Figma's background blur on the glass: 4.38639, which it exports as CSS
 * `blur(2.19px)`. `backdropPane` halves what it is given for the sigma, so
 * this is the Figma value, scaled with the cursor.
 */
const GLASS_BLUR = 4.38639;

/**
 * CURSOR — a pointer, or a drag hand, that keeps its frosted glass.
 *
 * Figma exports the glass's background blur as a `foreignObject` with CSS
 * `backdrop-filter`, which only a browser renders and which blurs nothing an
 * SVG rasteriser can see. Here the blur is real: whatever the document draws
 * under the cursor (the stage, panels, and every element before it — see
 * `buildDocument`) plus the cursor's own gradient arrow is blurred and
 * clipped to the glass arrow. The blurred copy is opaque, so nothing sharp
 * shows through the 30% glass.
 */
export function Cursor(ctx: Ctx, props: CursorProps): VNode {
  const { x, y } = props;
  const size = props.size ?? BOX.width;
  const s = size / BOX.width;
  const place = `translate(${x} ${y}) scale(${s})`;
  const hand = props.variant === 'hand';
  const [backD, glassD] = hand ? [HAND_BACK, HAND_GLASS] : [BACK, GLASS];
  // The hand's parts overlap, and must union rather than cut each other out.
  const rule = hand ? 'nonzero' : 'evenodd';

  const gradId = ctx.uid('cursorgrad');
  const fxId = ctx.uid('cursorfx');
  ctx.defs.push(
    h(
      'linearGradient',
      { id: gradId, x1: 54.8191, y1: 13.8896, x2: 20.3217, y2: 55.4157, gradientUnits: 'userSpaceOnUse' },
      [
        h('stop', { 'stop-color': '#1514A4' }),
        h('stop', { offset: 0.605769, 'stop-color': '#0B5FFF' }),
        h('stop', { offset: 1, 'stop-color': '#47FFFC' }),
      ],
    ),
    // Figma's own drop shadow and two white inner glows, unchanged. Inside the
    // placed group, so its user space is the artwork's.
    h(
      'filter',
      {
        id: fxId,
        x: 0,
        y: 0,
        width: BOX.width,
        height: BOX.height,
        filterUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      },
      [
        h('feFlood', { 'flood-opacity': 0, result: 'bg' }),
        h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
        h('feOffset', { dx: 5.25751, dy: 8.41201 }),
        h('feGaussianBlur', { stdDeviation: 9.30579 }),
        h('feComposite', { in2: 'hardAlpha', operator: 'out' }),
        h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.0275957 0 0 0 0 0 0 0 0 0 0.331149 0 0 0 0.5 0' }),
        h('feBlend', { mode: 'normal', in2: 'bg', result: 'drop' }),
        h('feBlend', { mode: 'normal', in: 'SourceGraphic', in2: 'drop', result: 'shape' }),
        h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
        h('feGaussianBlur', { stdDeviation: 1.65708 }),
        h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }),
        h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0' }),
        h('feBlend', { mode: 'normal', in2: 'shape', result: 'inner1' }),
        h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
        h('feGaussianBlur', { stdDeviation: 4.48387 }),
        h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }),
        h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0' }),
        h('feBlend', { mode: 'normal', in2: 'inner1' }),
      ],
    ),
  );

  const back = () =>
    h('path', { d: backD, transform: place, 'fill-rule': rule, 'clip-rule': rule, fill: `url(#${gradId})` });

  // What the glass sees: the document beneath it, then the gradient arrow.
  let pane: VNode | null = null;
  if (ctx.backdropId) {
    const underId = ctx.uid('cursorunder');
    ctx.defs.push(
      h('g', { id: underId }, [
        h('use', { href: `#${ctx.backdropId}`, 'xlink:href': `#${ctx.backdropId}` }),
        back(),
      ]),
    );
    const outer = ctx.backdropId;
    ctx.backdropId = underId;
    pane = backdropPane(ctx, h('path', { d: glassD, transform: place }), GLASS_BLUR * s);
    ctx.backdropId = outer;
  }

  return h('g', { 'data-el': 'cursor' }, [
    back(),
    pane,
    h('g', { transform: place }, [
      h('path', {
        d: glassD,
        'fill-rule': rule,
        'clip-rule': rule,
        fill: '#70A1FF',
        'fill-opacity': 0.3,
        filter: `url(#${fxId})`,
      }),
    ]),
  ]);
}
