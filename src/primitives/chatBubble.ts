import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES } from './text.ts';
import { Avatar } from './avatar.ts';

export type ChatVariant = 'receiver' | 'sender';

export interface ChatBubbleProps {
  x: number;
  y: number;
  width: number;
  height?: number;
  /** `receiver`: glass, avatar leading. `sender`: blue, avatar trailing. */
  variant?: ChatVariant;
  name: string;
  message: string;
  initials?: string;
  /** The avatar's photo — see `AvatarProps.href`. */
  avatarHref?: string;
}

/** 4px padding plus the 1px hairline, around a 38.834px avatar. */
export const CHAT_HEIGHT = 48.834;

/**
 * CHAT BUBBLE — the `Chat Bubble` component in the Marketing UI Assets file
 * (instances in node 268:5169): a fully rounded bar holding an avatar, a
 * sender name and one line of message.
 *
 * The two styles are mirror images. The receiver's bubble is white glass
 * with the avatar leading and 8px from it to the text; the sender's is
 * `Blue Light` at 20% with the text 16px in from the leading edge and the
 * avatar trailing. The sender also opens the name-to-message gap from 2 to 4.
 *
 * Name is the component's 9px semibold and message its 14px regular — the
 * `caption` and `subheading` steps, since this system's canvas is the Figma
 * canvas. Colours come from `component.chat`.
 */
export function ChatBubble(ctx: Ctx, props: ChatBubbleProps): VNode {
  const { x, y, width, name, message, initials, avatarHref } = props;
  const height = props.height ?? CHAT_HEIGHT;
  const variant = props.variant ?? 'receiver';
  const sender = variant === 'sender';
  const c = ctx.tokens.component.chat;
  const fill = sender ? c.senderFill : c.receiverFill;
  const fillOpacity = sender ? c.senderFillOpacity : c.receiverFillOpacity;
  const line = sender ? c.senderLine : c.receiverLine;
  const lineOpacity = sender ? c.senderLineOpacity : c.receiverLineOpacity;

  const inset = 5;
  const r = (height - inset * 2) / 2;
  const avatarCx = sender ? x + width - inset - r : x + inset + r;
  const textX = sender ? x + 17 : x + inset + r * 2 + 8;

  // Name on a 1.0 line, message on a 1.2 line, the pair centred in the bar.
  const nameSize = TYPE_ROLES.caption.size;
  const msgSize = TYPE_ROLES.subheading.size;
  const gap = sender ? 4 : 2;
  const block = nameSize + gap + msgSize * 1.2;
  const top = y + (height - block) / 2;
  const nameBaseline = top + nameSize / 2 + nameSize * 0.355;
  const msgBaseline = top + nameSize + gap + (msgSize * 1.2) / 2 + msgSize * 0.355;

  return h('g', { 'data-el': `chat-${variant}` }, [
    h('rect', { x, y, width, height, rx: height / 2, fill, 'fill-opacity': fillOpacity }),
    h('rect', {
      x: x + 0.5,
      y: y + 0.5,
      width: width - 1,
      height: height - 1,
      rx: height / 2 - 0.5,
      fill: 'none',
      stroke: line,
      'stroke-opacity': lineOpacity,
    }),
    Avatar(ctx, { cx: avatarCx, cy: y + height / 2, r, initials, href: avatarHref }),
    Text(ctx, { x: textX, y: nameBaseline, role: 'caption', weight: 'semibold', content: name, color: c.ink }),
    Text(ctx, { x: textX, y: msgBaseline, role: 'subheading', weight: 'regular', content: message, color: c.ink }),
  ]);
}
