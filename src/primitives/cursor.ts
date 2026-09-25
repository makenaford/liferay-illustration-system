import { h, backdropPane, type Ctx, type VNode } from '../vsvg.ts';

export interface CursorProps {
  /** Top left of the artwork's box, which includes the drop shadow's room. */
  x: number;
  y: number;
  /** Width of that box. The height follows at the artwork's 86:99. */
  size?: number;
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
 * Figma's background blur on the glass: 4.38639, which it exports as CSS
 * `blur(2.19px)`. `backdropPane` halves what it is given for the sigma, so
 * this is the Figma value, scaled with the cursor.
 */
const GLASS_BLUR = 4.38639;

/**
 * CURSOR — a pointer that keeps its frosted glass.
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
    h('path', { d: BACK, transform: place, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd', fill: `url(#${gradId})` });

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
    pane = backdropPane(ctx, h('path', { d: GLASS, transform: place }), GLASS_BLUR * s);
    ctx.backdropId = outer;
  }

  return h('g', { 'data-el': 'cursor' }, [
    back(),
    pane,
    h('g', { transform: place }, [
      h('path', {
        d: GLASS,
        'fill-rule': 'evenodd',
        'clip-rule': 'evenodd',
        fill: '#70A1FF',
        'fill-opacity': 0.3,
        filter: `url(#${fxId})`,
      }),
    ]),
  ]);
}
