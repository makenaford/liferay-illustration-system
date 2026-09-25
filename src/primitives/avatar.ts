import { h, text as textNode, type Ctx, type VNode } from '../vsvg.ts';

export interface AvatarProps {
  cx: number;
  cy: number;
  r?: number;
  /** Initials shown in place of a photo. */
  initials?: string;
  /**
   * The photo, as a URL or a data URI. The originals embedded full-size photos
   * as base64, which is where a good chunk of the 45MB went, so the editor
   * only ever embeds an upload once it is cropped and redrawn small.
   */
  href?: string;
}

/**
 * AVATAR — a circle with initials or an external image.
 *
 * Photos are the one asset type that legitimately stays raster. An uploaded
 * one is embedded, but only after the editor has shrunk it to a 256px square.
 */
export function Avatar(ctx: Ctx, props: AvatarProps): VNode {
  const { cx, cy, initials, href } = props;
  const r = props.r ?? 11.875;
  const tk = ctx.tokens;
  const light = tk.name === 'light';

  if (href) {
    const clipId = ctx.uid('avatarclip');
    ctx.defs.push(h('clipPath', { id: clipId }, [h('circle', { cx, cy, r })]));
    return h('g', { 'data-el': 'avatar' }, [
      h('image', {
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        href,
        preserveAspectRatio: 'xMidYMid slice',
        'clip-path': `url(#${clipId})`,
      }),
    ]);
  }

  return h('g', { 'data-el': 'avatar' }, [
    h('circle', {
      cx,
      cy,
      r,
      fill: light ? tk.text.subtle : tk.neutral.ink,
      'fill-opacity': light ? 0.28 : 0.23,
    }),
    initials
      ? textNode(
          'text',
          {
            x: cx,
            y: cy + r * 0.33,
            'font-family': tk.font.family,
            // Scaled to the circle rather than pinned to a type role: avatars
            // range from r=11 to r=20 across the set.
            'font-size': r * 0.72,
            'font-weight': tk.font.weightSemibold,
            fill: tk.text.primary,
            'text-anchor': 'middle',
            'data-el': 'avatar-initials',
          },
          initials,
        )
      : null,
  ]);
}
