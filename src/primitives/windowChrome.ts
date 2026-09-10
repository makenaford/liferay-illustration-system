import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text } from './text.ts';

export interface WindowChromeProps {
  x: number;
  /** Centre line of the dot row. */
  y: number;
  /** Dot radius. The references use 6 for large panels, 3 for app frames. */
  radius?: number;
  gap?: number;
  title?: string;
}

/**
 * WINDOW CHROME — the three traffic-light dots that signal "this is a product
 * UI". Appears in five of the nine references, always with the same recessed
 * gradient treatment.
 */
export function WindowChrome(ctx: Ctx, props: WindowChromeProps): VNode {
  const { x, y, title } = props;
  const r = props.radius ?? 6;
  const gap = props.gap ?? r * 3.5;
  const tk = ctx.tokens;
  const light = tk.name === 'light';

  const dots = [0, 1, 2].map((i) => {
    const cx = x + r + i * gap;
    const gid = ctx.uid('dot');
    ctx.defs.push(
      h(
        'radialGradient',
        {
          id: gid,
          cx: 0,
          cy: 0,
          r: 1,
          gradientUnits: 'userSpaceOnUse',
          gradientTransform: `translate(${cx + r} ${y - r}) scale(${r * 3.2})`,
        },
        [
          h('stop', { 'stop-color': light ? tk.text.subtle : tk.neutral.ink, 'stop-opacity': 0.4 }),
          h('stop', { offset: 1, 'stop-color': light ? tk.text.subtle : tk.neutral.ink, 'stop-opacity': 0.05 }),
        ],
      ),
    );
    return h('g', {}, [
      h('circle', { cx, cy: y, r, fill: `url(#${gid})`, 'fill-opacity': 0.4 }),
      h('circle', {
        cx,
        cy: y,
        r: r * 0.875,
        fill: 'none',
        stroke: tk.glass.lineFrom,
        'stroke-opacity': light ? 0.6 : 0.3,
        'stroke-width': 0.5,
      }),
    ]);
  });

  return h('g', { 'data-el': 'window-chrome' }, [
    ...dots,
    title
      ? Text(ctx, {
          x: x + r * 2 + gap * 2 + 8,
          y: y + 2.4,
          role: 'caption',
          content: title,
        })
      : null,
  ]);
}
