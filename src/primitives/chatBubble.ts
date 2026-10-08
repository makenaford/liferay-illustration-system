import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, type TypeRole } from './text.ts';
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
  /** Drawn this much in from the far side of the box: a sender's from the left, a receiver's from the right. */
  indent?: number;
  /** The message's type step; `subheading` unless set. */
  role?: TypeRole;
}

/** 4px padding plus the 1px hairline, around a 38.834px avatar. */
export const CHAT_HEIGHT = 48.834;

const NAME_ROLE: TypeRole = 'caption';
const MESSAGE_ROLE: TypeRole = 'subheading';

/** The name over the message, as tall as they stand. */
const textBlock = (role: TypeRole, sender: boolean) =>
  TYPE_ROLES[NAME_ROLE].size + (sender ? 4 : 2) + TYPE_ROLES[role].size * 1.2;

/**
 * How tall a bubble is: its own height if set, else the standard bar — or
 * taller, when its message size needs more than the bar holds.
 */
export function chatHeight(el: { height?: number; role?: TypeRole; variant?: ChatVariant }): number {
  if (el.height !== undefined) return el.height;
  const need = textBlock(el.role ?? MESSAGE_ROLE, el.variant === 'sender') + 10;
  return Math.max(CHAT_HEIGHT, Math.ceil(need / 2) * 2);
}

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
  const { y, name, message, initials, avatarHref } = props;
  const variant = props.variant ?? 'receiver';
  const sender = variant === 'sender';
  const height = chatHeight(props);
  const role = props.role ?? MESSAGE_ROLE;
  // Indented, the bubble is narrower, on its own side of the box.
  const indent = Math.max(0, Math.min(props.indent ?? 0, props.width - height));
  const x = sender ? props.x + indent : props.x;
  const width = props.width - indent;
  const c = ctx.tokens.component.chat;
  const fill = sender ? c.senderFill : c.receiverFill;
  const fillOpacity = sender ? c.senderFillOpacity : c.receiverFillOpacity;
  const line = sender ? c.senderLine : c.receiverLine;
  const lineOpacity = sender ? c.senderLineOpacity : c.receiverLineOpacity;

  const inset = 5;
  // The avatar is the bar's, however tall the message makes the bubble.
  const r = ((props.height ?? CHAT_HEIGHT) - inset * 2) / 2;
  const avatarCx = sender ? x + width - inset - r : x + inset + r;
  const textX = sender ? x + 17 : x + inset + r * 2 + 8;

  // Name on a 1.0 line, message on a 1.2 line, the pair centred in the bar.
  const nameSize = TYPE_ROLES[NAME_ROLE].size;
  const msgSize = TYPE_ROLES[role].size;
  const gap = sender ? 4 : 2;
  const block = textBlock(role, sender);
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
    Text(ctx, { x: textX, y: nameBaseline, role: NAME_ROLE, weight: 'semibold', content: name, color: c.ink }),
    Text(ctx, { x: textX, y: msgBaseline, role, weight: 'regular', content: message, color: c.ink }),
  ]);
}
