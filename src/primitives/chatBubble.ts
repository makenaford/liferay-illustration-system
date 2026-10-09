import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, typeStyle, wrapLines, type TypeRole } from './text.ts';
import { Avatar } from './avatar.ts';
import { Surface } from './surface.ts';
import { measureText } from '../fontMetrics.generated.ts';
import type { SurfaceName } from '../tokens.ts';

export type ChatVariant = 'receiver' | 'sender';

export interface ChatBubbleProps {
  x: number;
  y: number;
  /** The box: the widest the bubble grows to before its message wraps. */
  width: number;
  height?: number;
  /** `receiver`: glass, avatar leading. `sender`: blue, avatar trailing. */
  variant?: ChatVariant;
  name: string;
  message: string;
  initials?: string;
  /** The avatar's photo — see `AvatarProps.href`. */
  avatarHref?: string;
  /** Kept clear on the far side of the box: a sender's on the left, a receiver's on the right. */
  indent?: number;
  /** The message's type step; `subheading` unless set. */
  role?: TypeRole;
  /** Drawn at ¾ size: the bar, the avatar and the spacing; the name at 8px, the message at 12px. */
  condensed?: boolean;
  /** Filling the box rather than hugging its words — the bubble as wide as the box allows. */
  fill?: boolean;
  /** Any surface in the card set, drawn as a card draws it, in place of the chat's own fill. */
  surface?: SurfaceName;
}

/** 4px padding plus the 1px hairline, around a 38.834px avatar. */
export const CHAT_HEIGHT = 48.834;

const NAME_ROLE: TypeRole = 'caption';
const MESSAGE_ROLE: TypeRole = 'subheading';

/** How much smaller a condensed bubble is drawn. */
export const CHAT_CONDENSED = 0.75;

type Sized = Pick<ChatBubbleProps, 'height' | 'role' | 'variant' | 'condensed'>;
type Measured = Sized & Pick<ChatBubbleProps, 'width' | 'name' | 'message' | 'indent' | 'fill'>;

/** Spacing, the bar and the avatar: whole, or ¾ when condensed. */
const scaleOf = (el: Sized) => (el.condensed ? CHAT_CONDENSED : 1);
/** Condensed, the type is fixed: the name at 8px, the message at 12px, whatever its size otherwise. */
const CONDENSED_ROLES = { name: 'micro', message: 'bodySmall' } as const satisfies Record<string, TypeRole>;
const rolesOf = (el: Sized) => (el.condensed ? CONDENSED_ROLES : { name: NAME_ROLE, message: el.role ?? MESSAGE_ROLE });

const lineWidth = (s: string, role: TypeRole, weight: 'regular' | 'semibold') => {
  const st = typeStyle(role, weight);
  return measureText(s, st.size, st.weight);
};

/**
 * Where everything in a bubble goes, from its box: the words — the message
 * wrapped to the room the box leaves it — and the bubble around them, as
 * wide as they are (or the box, filling it) and as tall as they stand.
 */
export function chatLayout(el: Measured) {
  const k = scaleOf(el);
  const roles = rolesOf(el);
  const sender = el.variant === 'sender';
  // The standard bar: its avatar, and the least a bubble is tall.
  const bar = el.height ?? CHAT_HEIGHT * k;
  const inset = 5 * k;
  const r = (bar - inset * 2) / 2;
  // Everything across that is not words: the avatar, its inset, the gap to
  // the text and the margin past it.
  const chrome = inset + r * 2 + 8 * k + 17 * k;
  const room = Math.max(1, el.width - (el.indent ?? 0));
  // A bubble may leave out its name — or, half-typed, its message.
  const name = el.name ?? '';
  const message = el.message ?? '';
  const lines = message ? wrapLines(message, (s) => lineWidth(s, roles.message, 'regular'), Math.max(1, room - chrome)) : [];
  const words = Math.max(name ? lineWidth(name, roles.name, 'semibold') : 0, ...lines.map((l) => lineWidth(l, roles.message, 'regular')));
  const width = el.fill ? room : Math.min(room, Math.ceil(chrome + words));

  const nameSize = TYPE_ROLES[roles.name].size;
  const msgSize = TYPE_ROLES[roles.message].size;
  const lead = msgSize * 1.2;
  // With no name, the message alone, centred; with no message, the name alone.
  const named = name ? nameSize : 0;
  const gap = name && lines.length ? (sender ? 4 : 2) * k : 0;
  const block = named + gap + lead * lines.length;
  // Measured at the sender's gap either way, so the two styles stay one height.
  const need = named + (name && lines.length ? 4 * k : 0) + lead * lines.length + 10 * k;
  const height = el.height ?? Math.max(bar, Math.ceil(need / 2) * 2);
  return { k, roles, sender, bar, inset, r, lines, width, height, name, named, nameSize, msgSize, lead, gap, block };
}

/** How tall a bubble is: its own height if set, else the bar, or as its message needs. */
export function chatHeight(el: Measured): number {
  return chatLayout(el).height;
}

/** The width a bubble's content needs on one line — what a translation grows its box by. */
export function chatNeed(
  el: Measured,
  measure: (s: string, role: TypeRole, weight: 'regular' | 'semibold') => number,
): number {
  const k = scaleOf(el);
  const roles = rolesOf(el);
  const bar = (el.height ?? CHAT_HEIGHT * k) - 10 * k;
  const text = Math.max(el.name ? measure(el.name, roles.name, 'semibold') : 0, el.message ? measure(el.message, roles.message, 'regular') : 0);
  return 5 * k + bar + 8 * k + text + 17 * k + (el.indent ?? 0);
}

/** Surfaces a message reads on in white. */
const ON_ACCENT: ReadonlySet<SurfaceName> = new Set(['solid', 'gradient']);

/**
 * CHAT BUBBLE — the `Chat Bubble` component in the Marketing UI Assets file
 * (instances in node 268:5169): a rounded bubble holding an avatar, a sender
 * name and the message.
 *
 * The two styles are mirror images. The receiver's bubble is white glass
 * with the avatar leading and 8px from it to the text; the sender's is
 * `Blue Light` at 20% with the text 16px in from the leading edge and the
 * avatar trailing. The sender also opens the name-to-message gap from 2 to 4.
 * Either can take any card surface instead (`surface`).
 *
 * The name can be left out, for the message alone.
 *
 * Like a chat app's message, it hugs its words: the element's box is the
 * most it grows to, the bubble sits against its own side of it — a sender's
 * right, a receiver's left — and a message longer than the box wraps, the
 * bubble growing taller. It is fully rounded however tall.
 *
 * Name is the component's 9px semibold and message its 14px regular — the
 * `caption` and `subheading` steps, since this system's canvas is the Figma
 * canvas. Colours come from `component.chat`.
 *
 * Condensed, it is the same bubble at ¾ size: the bar, the avatar and every
 * gap at ¾, with the name at 8px and the message at 12px.
 */
export function ChatBubble(ctx: Ctx, props: ChatBubbleProps): VNode {
  const { y, initials, avatarHref } = props;
  const variant = props.variant ?? 'receiver';
  const L = chatLayout({ ...props, variant });
  const { k, sender, inset, r, width, height } = L;
  // Against its own side of the box.
  const x = sender ? props.x + props.width - width : props.x;
  const c = ctx.tokens.component.chat;
  // Fully rounded, however many lines it holds.
  const rx = height / 2;

  const avatarCx = sender ? x + width - inset - r : x + inset + r;
  const textX = sender ? x + 17 * k : x + inset + r * 2 + 8 * k;
  const ink = props.surface ? (ON_ACCENT.has(props.surface) ? ctx.tokens.text.onAccent : ctx.tokens.text.primary) : c.ink;

  // Name on a 1.0 line, each message line on a 1.2 one, the lot centred.
  const top = y + (height - L.block) / 2;
  const nameBaseline = top + L.nameSize / 2 + L.nameSize * 0.355;
  const firstLine = top + L.named + L.gap + L.lead / 2 + L.msgSize * 0.355;

  const content = [
    Avatar(ctx, { cx: avatarCx, cy: y + height / 2, r, initials, href: avatarHref }),
    L.name ? Text(ctx, { x: textX, y: nameBaseline, role: L.roles.name, weight: 'semibold', content: L.name, color: ink }) : null,
    ...L.lines.map((line, i) =>
      Text(ctx, { x: textX, y: firstLine + i * L.lead, role: L.roles.message, weight: 'regular', content: line, color: ink }),
    ),
  ];

  if (props.surface) {
    return h('g', { 'data-el': `chat-${variant}` }, [
      Surface(ctx, { x, y, width, height, radius: rx, surface: props.surface, children: content }),
    ]);
  }

  const fill = sender ? c.senderFill : c.receiverFill;
  const fillOpacity = sender ? c.senderFillOpacity : c.receiverFillOpacity;
  const line = sender ? c.senderLine : c.receiverLine;
  const lineOpacity = sender ? c.senderLineOpacity : c.receiverLineOpacity;
  const hairline = 0.5 * Math.max(k, 0.5);

  return h('g', { 'data-el': `chat-${variant}` }, [
    h('rect', { x, y, width, height, rx, fill, 'fill-opacity': fillOpacity }),
    h('rect', {
      x: x + hairline,
      y: y + hairline,
      width: width - hairline * 2,
      height: height - hairline * 2,
      rx: rx - hairline,
      fill: 'none',
      stroke: line,
      'stroke-opacity': lineOpacity,
      ...(k < 1 ? { 'stroke-width': hairline * 2 } : {}),
    }),
    ...content,
  ]);
}
