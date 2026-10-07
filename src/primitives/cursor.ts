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
 * The drag hand, from the Japan site hero images (Figma
 * yC6i3M1Iq1zPKxrZPB0vuO, 297:13692), in its own 66.9 x 56 box: one glass
 * hand — `#99BCFF` at 21% under a white 1.26 outline, a Brand/Primary shadow
 * to its right, a white and a blue inner glow — with the creases between its
 * fingers in white fading down. No gradient hand behind it, as the arrow has.
 */
const HAND_BOX = { width: 66.8908, height: 56.0389 };
const HAND =
  'M51.7993 18.8679V11.5467C51.7993 10.0824 51.2144 8.6914 50.191 7.66643C49.1676 6.64145 47.7786 6.05575 46.3166 6.05575C44.8545 6.05575 43.4656 6.64145 42.4422 7.66643C41.4187 8.6914 40.8339 10.0824 40.8339 11.5467V7.88606C40.8339 6.42182 40.2491 5.03078 39.2257 4.00581C38.2022 2.98084 36.8133 2.39514 35.3512 2.39514C33.8892 2.39514 32.5003 2.98084 31.4768 4.00581C30.4534 5.03078 29.8686 6.42182 29.8686 7.88606V11.5467C29.8686 10.0824 29.2838 8.6914 28.2603 7.66643C27.2369 6.64145 25.848 6.05575 24.3859 6.05575C22.9239 6.05575 21.5349 6.64145 20.5115 7.66643C19.4881 8.6914 18.9032 10.0824 18.9032 11.5467V24.3588C11.593 15.2073 7.9379 13.377 0.627671 17.0376L11.8123 39.4772C13.9323 43.7235 17.1853 47.3109 21.2425 49.8001C25.2997 52.2894 29.9417 53.6438 34.6933 53.6438H37.1422C43.9408 53.6438 50.4469 50.9349 55.2351 46.1395C60.0233 41.3441 62.728 34.8282 62.728 28.0195V18.8679C62.728 17.4037 62.1432 16.0126 61.1198 14.9877C60.0964 13.9627 58.7074 13.377 57.2454 13.377C55.7833 13.377 54.3944 13.9627 53.371 14.9877C52.3475 16.0126 51.7627 17.4037 51.7627 18.8679';
const CREASES =
  'M29.913 9.298C30.2594 9.29822 30.5409 9.57949 30.5409 9.92593V19.0773C30.5407 19.4236 30.2593 19.705 29.913 19.7052C29.5666 19.7052 29.2853 19.4237 29.2851 19.0773V9.92593C29.2851 9.57935 29.5664 9.298 29.913 9.298ZM40.8788 9.298C41.225 9.29848 41.5058 9.57965 41.5058 9.92593V19.0773C41.5056 19.4234 41.2249 19.7048 40.8788 19.7052C40.5324 19.7052 40.2511 19.4237 40.2509 19.0773V9.92593C40.2509 9.57935 40.5322 9.298 40.8788 9.298ZM51.8437 16.6193C52.1901 16.6195 52.4716 16.9008 52.4716 17.2472V19.0773C52.4714 19.4236 52.1899 19.705 51.8437 19.7052C51.4972 19.7052 51.216 19.4237 51.2157 19.0773V17.2472C51.2157 16.9006 51.4971 16.6193 51.8437 16.6193Z';
/** Figma's background blur on the hand: 5.43878 (CSS `blur(2.72px)`). */
const HAND_BLUR = 5.43878;

/** Height over width of a cursor's box, by variant. */
export const cursorAspect = (variant?: 'arrow' | 'hand') =>
  variant === 'hand' ? HAND_BOX.height / HAND_BOX.width : CURSOR_ASPECT;
/** A cursor's width when it sets none: its artwork's own. */
export const cursorWidth = (variant?: 'arrow' | 'hand') => (variant === 'hand' ? HAND_BOX.width : BOX.width);

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
  if (props.variant === 'hand') return Hand(ctx, props);
  const { x, y } = props;
  const size = props.size ?? BOX.width;
  const s = size / BOX.width;
  const place = `translate(${x} ${y}) scale(${s})`;
  const backD = BACK;
  const glassD = GLASS;
  const rule = 'evenodd';

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

/**
 * The drag hand. Its glass is frosted as the arrow's is: whatever the
 * document draws beneath it, blurred and clipped to the hand — Figma's
 * background blur made real, so it shows in an export as in a browser.
 * Then the hand's tint, outline and glows, and the creases over them, with
 * Figma's own filters.
 */
function Hand(ctx: Ctx, props: CursorProps): VNode {
  const { x, y } = props;
  const size = props.size ?? HAND_BOX.width;
  const s = size / HAND_BOX.width;
  const place = `translate(${x} ${y}) scale(${s})`;

  const fxId = ctx.uid('handfx');
  const creaseFx = ctx.uid('handcrease');
  const creaseGrad = ctx.uid('handcreasegrad');
  const dropAndGlow = [
    h('feFlood', { 'flood-opacity': 0, result: 'bg' }),
    h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
    h('feOffset', { dx: 1.7676 }),
    h('feGaussianBlur', { stdDeviation: 0.883801 }),
    h('feComposite', { in2: 'hardAlpha', operator: 'out' }),
    h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0.344262 0 0 0 0 1 0 0 0 0.6 0' }),
    h('feBlend', { mode: 'normal', in2: 'bg', result: 'drop' }),
    h('feBlend', { mode: 'normal', in: 'SourceGraphic', in2: 'drop', result: 'shape' }),
    h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
    h('feOffset', { dy: 2.03954 }),
    h('feGaussianBlur', { stdDeviation: 0.679847 }),
    h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }),
    h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0' }),
    h('feBlend', { mode: 'normal', in2: 'shape', result: 'inner1' }),
    h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
    h('feOffset', { dy: 4.07908 }),
    h('feGaussianBlur', { stdDeviation: 3.39924 }),
    h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }),
    h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.376471 0 0 0 0 0.623529 0 0 0 0 1 0 0 0 0.4 0' }),
    h('feBlend', { mode: 'normal', in2: 'inner1' }),
  ];
  ctx.defs.push(
    // Inside the placed group, so their user space is the artwork's.
    h('filter', { id: fxId, x: -5.43878, y: -3.67117, width: 74.2331, height: 63.3813, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, dropAndGlow),
    h('filter', { id: creaseFx, x: 29.2851, y: 9.298, width: 23.1865, height: 13.7541, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, [
      h('feFlood', { 'flood-opacity': 0, result: 'bg' }),
      h('feBlend', { mode: 'normal', in: 'SourceGraphic', in2: 'bg', result: 'shape' }),
      h('feColorMatrix', { in: 'SourceAlpha', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0', result: 'hardAlpha' }),
      h('feOffset', { dy: 3.34685 }),
      h('feGaussianBlur', { stdDeviation: 4.18356 }),
      h('feComposite', { in2: 'hardAlpha', operator: 'arithmetic', k2: -1, k3: 1 }),
      h('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.999568 0 0 0 0 0.999568 0 0 0 0 0.999568 0 0 0 1 0' }),
      h('feBlend', { mode: 'normal', in2: 'shape' }),
    ]),
    h('linearGradient', { id: creaseGrad, x1: 43.1792, y1: 18.9208, x2: 43.1792, y2: 28.0728, gradientUnits: 'userSpaceOnUse' }, [
      h('stop', { 'stop-color': '#FFFFFF' }),
      h('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 0 }),
    ]),
  );

  // The frosted glass: what lies beneath, blurred, inside the hand.
  const pane = ctx.backdropId ? backdropPane(ctx, h('path', { d: HAND, transform: place }), HAND_BLUR * s) : null;

  return h('g', { 'data-el': 'cursor-hand' }, [
    pane,
    h('g', { transform: place }, [
      h('g', { filter: `url(#${fxId})` }, [
        h('path', { d: HAND, fill: '#99BCFF', 'fill-opacity': 0.21 }),
        h('path', { d: HAND, stroke: '#FFFFFF', 'stroke-width': 1.25507, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }),
      ]),
      h('g', { filter: `url(#${creaseFx})` }, [h('path', { d: CREASES, fill: `url(#${creaseGrad})` })]),
    ]),
  ]);
}
