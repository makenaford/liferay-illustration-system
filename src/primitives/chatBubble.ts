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
  /** Drawn at ¾ size: the bar, the avatar and the spacing; the name at 8px, the message at 12px. */
  condensed?: boolean;
}

/** 4px padding plus the 1px hairline, around a 38.834px avatar. */
export const CHAT_HEIGHT = 48.834;

const NAME_ROLE: TypeRole = 'caption';
const MESSAGE_ROLE: TypeRole = 'subheading';

/** How much smaller a condensed bubble is drawn. */
export const CHAT_CONDENSED = 0.75;

type Sized = { height?: number; role?: TypeRole; variant?: ChatVariant; condensed?: boolean };

/** Spacing, the bar and the avatar: whole, or ¾ when condensed. */
const scaleOf = (el: Sized) => (el.condensed ? CHAT_CONDENSED : 1);
/** Condensed, the type is fixed: the name at 8px, the message at 12px, whatever its size otherwise. */
const CONDENSED_ROLES = { name: 'micro', message: 'bodySmall' } as const satisfies Record<string, TypeRole>;
const rolesOf = (el: Sized) => (el.condensed ? CONDENSED_ROLES : { name: NAME_ROLE, message: el.role ?? MESSAGE_ROLE });

/** The name over the message, as tall as they stand — at the sender's wider gap when `widest`. */
const textBlock = (el: Sized, widest = false) => {
  const { name, message } = rolesOf(el);
  return TYPE_ROLES[name].size + (widest || el.variant === 'sender' ? 4 : 2) * scaleOf(el) + TYPE_ROLES[message].size * 1.2;
};

/**
 * How tall a bubble is: its own height if set, else the standard bar (¾ of
 * it, condensed) — or taller, when its message size needs more.
 */
export function chatHeight(el: Sized): number {
  if (el.height !== undefined) return el.height;
  const k = scaleOf(el);
  // Measured at the sender's gap either way, so the two styles stay one height.
  const need = textBlock(el, true) + 10 * k;
  return Math.max(CHAT_HEIGHT * k, Math.ceil(need / 2) * 2);
}

/** The width a bubble's own content needs — its avatar, padding and longer line — at `measure`. */
export function chatNeed(
  el: Sized & { name: string; message: string; indent?: number },
  measure: (s: string, role: TypeRole, weight: 'regular' | 'semibold') => number,
): number {
  const k = scaleOf(el);
  const { name, message } = rolesOf(el);
  const bar = (el.height ?? CHAT_HEIGHT * k) - 10 * k;
  const text = Math.max(measure(el.name, name, 'semibold'), measure(el.message, message, 'regular'));
  return 5 * k + bar + 8 * k + text + 17 * k + (el.indent ?? 0);
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
 *
 * Condensed, it is the same bubble at ¾ size: the bar, the avatar and every
 * gap at ¾, with the name at 8px and the message at 12px.
 */
export function ChatBubble(ctx: Ctx, props: ChatBubbleProps): VNode {
  const { y, name, message, initials, avatarHref } = props;
  const variant = props.variant ?? 'receiver';
  const sender = variant === 'sender';
  const k = scaleOf(props);
  const roles = rolesOf(props);
  const height = chatHeight(props);
  // Indented, the bubble is narrower, on its own side of the box.
  const indent = Math.max(0, Math.min(props.indent ?? 0, props.width - height));
  const x = sender ? props.x + indent : props.x;
  const width = props.width - indent;
  const c = ctx.tokens.component.chat;
  const fill = sender ? c.senderFill : c.receiverFill;
  const fillOpacity = sender ? c.senderFillOpacity : c.receiverFillOpacity;
  const line = sender ? c.senderLine : c.receiverLine;
  const lineOpacity = sender ? c.senderLineOpacity : c.receiverLineOpacity;

  const inset = 5 * k;
  // The avatar is the bar's, however tall the message makes the bubble.
  const r = ((props.height ?? CHAT_HEIGHT * k) - inset * 2) / 2;
  const avatarCx = sender ? x + width - inset - r : x + inset + r;
  const textX = sender ? x + 17 * k : x + inset + r * 2 + 8 * k;

  // Name on a 1.0 line, message on a 1.2 line, the pair centred in the bar.
  const nameSize = TYPE_ROLES[roles.name].size;
  const msgSize = TYPE_ROLES[roles.message].size;
  const gap = (sender ? 4 : 2) * k;
  const block = textBlock(props);
  const top = y + (height - block) / 2;
  const nameBaseline = top + nameSize / 2 + nameSize * 0.355;
  const msgBaseline = top + nameSize + gap + (msgSize * 1.2) / 2 + msgSize * 0.355;
  const hairline = 0.5 * Math.max(k, 0.5);

  return h('g', { 'data-el': `chat-${variant}` }, [
    h('rect', { x, y, width, height, rx: height / 2, fill, 'fill-opacity': fillOpacity }),
    h('rect', {
      x: x + hairline,
      y: y + hairline,
      width: width - hairline * 2,
      height: height - hairline * 2,
      rx: height / 2 - hairline,
      fill: 'none',
      stroke: line,
      'stroke-opacity': lineOpacity,
      ...(k < 1 ? { 'stroke-width': hairline * 2 } : {}),
    }),
    Avatar(ctx, { cx: avatarCx, cy: y + height / 2, r, initials, href: avatarHref }),
    Text(ctx, { x: textX, y: nameBaseline, role: roles.name, weight: 'semibold', content: name, color: c.ink }),
    Text(ctx, { x: textX, y: msgBaseline, role: roles.message, weight: 'regular', content: message, color: c.ink }),
  ]);
}
