import { TYPE_ROLES } from '../src/primitives/text.ts';
import { STATUS_TONES } from '../src/primitives/badge.ts';
import { GLASS_ICONS } from '../src/glassIcons.generated.ts';
import { dark as darkTokens } from '../src/tokens.ts';

export const SURFACES = Object.keys(darkTokens.surfaces);
import type { Element } from '../src/document.ts';
import { LAYOUT } from '../src/tokens.ts';

/**
 * FIELD SCHEMA — the Inspector is generated from this, not hand-built.
 *
 * Each entry mirrors a primitive's props. Keeping it as data means adding a
 * primitive is: write the primitive, add its document type, add a row here.
 * No new UI code. It also enforces the core constraint — there is no colour
 * field anywhere, only `tone`/`variant`/`role` selects that resolve through
 * tokens, so a designer physically cannot place an off-system colour.
 */

/**
 * A field descriptor, parameterised by the keys its element type actually has.
 *
 * This generic is the whole point. The Inspector writes `el[field.key]`, so a
 * key that does not exist on the element silently does nothing — the control
 * renders, accepts typing, and changes no artwork. That is exactly what
 * happened when a type-scale migration blind-replaced the string `label`:
 * five element types ended up with `key: 'subheading'`, and their Label field
 * quietly stopped working. Binding the key to `keyof Element` turns that from
 * a silent no-op into a compile error.
 */
export type Field<K extends string = string> =
  | {
      key: K;
      label: string;
      kind: 'number';
      step?: number;
      min?: number;
      /**
       * The primitive's fallback when the prop is absent. Shown as the input's
       * placeholder so an empty field reads as "defaults to 13" rather than
       * "unset", which is what it actually means.
       */
      default?: number;
    }
  | { key: K; label: string; kind: 'text' }
  | { key: K; label: string; kind: 'textarea' }
  | {
      key: K;
      label: string;
      kind: 'boolean';
      /**
       * Resolved default. A checkbox that reads `false` while the artwork
       * clearly shows the feature on is worse than no checkbox — badges derive
       * their status dot from `tone`, so this can be a function.
       */
      default?: boolean | ((el: Element) => boolean);
    }
  | {
      key: K;
      label: string;
      kind: 'select';
      options: readonly string[];
      /** Display text per option, where the raw value needs annotating. */
      labels?: Record<string, string>;
      /** An option's group; consecutive options in one group share an <optgroup>. */
      groups?: Record<string, string>;
    }
  | { key: K; label: string; kind: 'numbers'; label2?: string }
  | { key: K; label: string; kind: 'series' }
  /** A bar chart's values, stored as `data` or grouped `series`; patches both. */
  | { key: K; label: string; kind: 'bars' }
  | { key: K; label: string; kind: 'point' }
  | { key: K; label: string; kind: 'iconList' }
  /** A comma-separated list of words, such as a chart's axis labels. */
  | { key: K; label: string; kind: 'list' }
  /** A colour, chosen from the design-system palette with swatches. */
  | { key: K; label: string; kind: 'token' }
  /**
   * A file from the user's computer. Patches several props at once (markup
   * plus viewBox, or data URI plus natural size), so the Inspector handles
   * this kind through `onPatch` rather than the single-key `onChange`.
   */
  | { key: K; label: string; kind: 'file' }
  /** An avatar's photo: an upload, embedded small, or an image URL. */
  | { key: K; label: string; kind: 'photo' }
  /** An icon from MingCute, searchable, drawn in the element's style. */
  | { key: K; label: string; kind: 'icon' }
  /** A graphic: built in, or from the Marketing Assets library. Patches several props. */
  | { key: K; label: string; kind: 'graphic' };

export const ROLES = Object.keys(TYPE_ROLES);
export const WEIGHTS = ['regular', 'semibold', 'bold'] as const;
/** Outline or filled — the two styles every MingCute icon comes in. */
export const ICON_STYLES = ['line', 'fill'] as const;
export const ICON_STYLE_LABELS: Record<string, string> = { line: 'Outline', fill: 'Filled' };
/**
 * The design system's glass icons. A key whose light variant is really the
 * dark artwork is labelled, so a designer picking artwork for a light
 * illustration can see the gap rather than discover it after export.
 */
/** Glass icons, in the set's own order: by category, then by name. */
export const SPOT_KEYS = Object.keys(GLASS_ICONS).sort(
  (a, b) =>
    GLASS_ICONS[a].category.localeCompare(GLASS_ICONS[b].category) ||
    GLASS_ICONS[a].label.localeCompare(GLASS_ICONS[b].label),
);
export const SPOT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(GLASS_ICONS).map(([k, v]) => [
    k,
    v.lightIsFallback ? `${v.label} — no light variant` : v.label,
  ]),
);
/** Each icon's category, which the picker shows as option groups. */
export const SPOT_GROUPS: Record<string, string> = Object.fromEntries(
  Object.entries(GLASS_ICONS).map(([k, v]) => [k, v.category]),
);

const XY: Field<'x' | 'y'>[] = [
  { key: 'x', label: 'X', kind: 'number' },
  { key: 'y', label: 'Y', kind: 'number' },
];
const WH: Field<'width' | 'height'>[] = [
  { key: 'width', label: 'W', kind: 'number', min: 1 },
  { key: 'height', label: 'H', kind: 'number', min: 1 },
];

const ICON_TONES = ['subtle', 'soft', 'accent', 'primary', 'body'] as const;

/** The property names an element of type `T` actually carries. */
type KeysOf<T extends Element['type']> = Extract<keyof Extract<Element, { type: T }>, string>;

export const SCHEMA: {
  [T in Element['type']]: { label: string; fields: Field<KeysOf<T>>[] };
} = {
  text: {
    label: 'Text',
    fields: [
      { key: 'content', label: 'Content', kind: 'textarea' },
      ...XY,
      { key: 'role', label: 'Size', kind: 'select', options: ROLES },
      { key: 'weight', label: 'Weight', kind: 'select', options: ['', ...WEIGHTS] },
      { key: 'anchor', label: 'Align', kind: 'select', options: ['start', 'middle', 'end'] },
      { key: 'tone', label: 'Colour', kind: 'token' },
      { key: 'underline', label: 'Underline (⌘U)', kind: 'boolean' },
      { key: 'strikethrough', label: 'Strikethrough (⇧⌘X)', kind: 'boolean' },
    ],
  },
  card: {
    label: 'Glass panel',
    fields: [
      ...XY,
      ...WH,
      { key: 'surface', label: 'Surface', kind: 'select', options: ['', ...SURFACES] },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, default: 8 },
      { key: 'clip', label: 'Clip content', kind: 'boolean' },
    ],
  },
  group: {
    label: 'Group',
    fields: [
      { key: 'x', label: 'X', kind: 'number' },
      { key: 'y', label: 'Y', kind: 'number' },
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'height', label: 'H', kind: 'number', min: 1 },
      { key: 'clip', label: 'Clip content', kind: 'boolean' },
    ],
  },
  subCard: {
    label: 'Card',
    fields: [
      ...XY,
      ...WH,
      { key: 'surface', label: 'Surface', kind: 'select', options: ['', ...SURFACES] },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, default: 4 },
      { key: 'clip', label: 'Clip content', kind: 'boolean' },
    ],
  },
  pill: {
    label: 'Pill',
    fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      ...XY,
      ...WH,
      { key: 'variant', label: 'Variant', kind: 'select', options: ['accent', 'glass', 'success'] },
    ],
  },
  badge: {
    label: 'Badge',
    fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      ...XY,
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'height', label: 'H', kind: 'number', min: 1, default: 13 },
      {
        key: 'tone',
        label: 'Tone',
        kind: 'select',
        options: ['neutral', 'accent', 'success', 'warning', 'alert', 'danger', 'info'],
      },
      {
        key: 'variant',
        label: 'Treatment',
        kind: 'select',
        options: ['tonal', 'ring', 'gradient', 'glass'],
      },
      {
        key: 'dot',
        label: 'Status dot',
        kind: 'boolean',
        default: (el) =>
          el.type === 'badge' && STATUS_TONES.has(el.tone ?? ''),
      },
    ],
  },
  button: {
    label: 'Button',
    fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      ...XY,
      ...WH,
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        options: ['solid', 'outline', 'glass', 'gradient', 'muted'],
      },
      { key: 'align', label: 'Align', kind: 'select', options: ['center', 'left'] },
      { key: 'icon', label: 'Icon', kind: 'icon' },
      { key: 'iconStyle', label: 'Icon style', kind: 'select', options: ICON_STYLES, labels: ICON_STYLE_LABELS },
      { key: 'role', label: 'Type style', kind: 'select', options: ROLES },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, default: 4 },
      { key: 'padding', label: 'Padding', kind: 'number', min: 0, default: 12 },
    ],
  },
  toggle: {
    label: 'Toggle',
    fields: [...XY, ...WH, { key: 'on', label: 'On', kind: 'boolean' }],
  },
  input: {
    label: 'Input field',
    fields: [
      { key: 'placeholder', label: 'Placeholder', kind: 'text' },
      ...XY,
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'height', label: 'H', kind: 'number', min: 1 },
      { key: 'icon', label: 'Icon', kind: 'icon' },
      { key: 'iconStyle', label: 'Icon style', kind: 'select', options: ICON_STYLES, labels: ICON_STYLE_LABELS },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, default: 6 },
      { key: 'role', label: 'Type style', kind: 'select', options: ROLES },
    ],
  },
  chat: {
    label: 'Chat bubble',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'message', label: 'Message', kind: 'text' },
      {
        key: 'variant',
        label: 'Style',
        kind: 'select',
        options: ['receiver', 'sender'],
        labels: { receiver: 'Receiver — avatar left', sender: 'Sender — avatar right' },
      },
      ...XY,
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'initials', label: 'Initials', kind: 'text' },
      { key: 'avatarHref', label: 'Photo', kind: 'photo' },
    ],
  },
  chrome: {
    label: 'Window chrome',
    fields: [
      ...XY,
      { key: 'radius', label: 'Dot size', kind: 'number', min: 1, step: 0.5 },
      { key: 'gap', label: 'Gap', kind: 'number', min: 1 },
      { key: 'title', label: 'Title', kind: 'text' },
    ],
  },
  lineChart: {
    label: 'Line chart',
    fields: [
      { key: 'markers', label: 'Point dots', kind: 'boolean' },
      ...XY,
      ...WH,
      { key: 'series', label: 'Series', kind: 'series' },
      { key: 'labels', label: 'Labels', kind: 'list' },
      { key: 'labelGap', label: 'Label gap', kind: 'number', min: 0, default: 4 },
      { key: 'gridLines', label: 'Grid lines', kind: 'number', min: 0 },
      { key: 'referenceLine', label: 'Reference', kind: 'number', step: 0.05 },
    ],
  },
  barChart: {
    label: 'Bar chart',
    fields: [
      { key: 'gridLines', label: 'Grid lines', kind: 'number', min: 0 },
      ...XY,
      ...WH,
      { key: 'series', label: 'Bars', kind: 'bars' },
      { key: 'labels', label: 'Labels', kind: 'list' },
      { key: 'labelGap', label: 'Label gap', kind: 'number', min: 0, default: 4 },
      { key: 'max', label: 'Scale max', kind: 'number', min: 0 },
      { key: 'barRatio', label: 'Bar width', kind: 'number', step: 0.05, min: 0.05, default: 0.68 },
      { key: 'gradient', label: 'Gradient', kind: 'boolean', default: true },
    ],
  },
  progress: {
    label: 'Progress row',
    fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      ...XY,
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'value', label: 'Value 0-1', kind: 'number', step: 0.01, min: 0 },
      { key: 'height', label: 'Track H', kind: 'number', min: 1 },
      { key: 'tone', label: 'Tone', kind: 'select', options: ['accent', 'success', 'warning', 'alert', 'danger', 'info'] },
      { key: 'labelGap', label: 'Label gap', kind: 'number' },
    ],
  },
  skeleton: {
    label: 'Skeleton bar',
    fields: [
      ...XY,
      { key: 'width', label: 'W', kind: 'number', min: 1 },
      { key: 'height', label: 'H', kind: 'number', min: 1, default: 8 },
    ],
  },
  stat: {
    label: 'Stat block',
    fields: [
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
      ...XY,
      { key: 'valueRole', label: 'Value style', kind: 'select', options: ROLES },
      { key: 'labelRole', label: 'Label style', kind: 'select', options: ROLES },
      { key: 'labelPosition', label: 'Label pos', kind: 'select', options: ['below', 'above'] },
      { key: 'anchor', label: 'Align', kind: 'select', options: ['start', 'middle', 'end'] },
    ],
  },
  icon: {
    label: 'Icon',
    fields: [
      { key: 'icon', label: 'Icon', kind: 'icon' },
      { key: 'iconStyle', label: 'Icon style', kind: 'select', options: ICON_STYLES, labels: ICON_STYLE_LABELS },
      ...XY,
      { key: 'size', label: 'Size', kind: 'number', min: 1, default: 20 },
      { key: 'tone', label: 'Colour', kind: 'token' },
    ],
  },
  iconGrid: {
    label: 'Icon grid',
    fields: [
      ...XY,
      { key: 'icons', label: 'Icons', kind: 'iconList' },
      { key: 'iconStyle', label: 'Icon style', kind: 'select', options: ICON_STYLES, labels: ICON_STYLE_LABELS },
      { key: 'columns', label: 'Columns', kind: 'number', min: 1 },
      { key: 'size', label: 'Size', kind: 'number', min: 1 },
      { key: 'gapX', label: 'Gap X', kind: 'number' },
      { key: 'gapY', label: 'Gap Y', kind: 'number' },
      { key: 'tone', label: 'Tone', kind: 'select', options: ICON_TONES },
    ],
  },
  avatar: {
    label: 'Avatar',
    fields: [
      { key: 'initials', label: 'Initials', kind: 'text' },
      { key: 'cx', label: 'X', kind: 'number' },
      { key: 'cy', label: 'Y', kind: 'number' },
      { key: 'r', label: 'Radius', kind: 'number', min: 1, default: 11.875 },
      { key: 'href', label: 'Photo', kind: 'photo' },
    ],
  },
  connector: {
    label: 'Connector',
    fields: [
      { key: 'from', label: 'From', kind: 'point' },
      { key: 'to', label: 'To', kind: 'point' },
      { key: 'route', label: 'Route', kind: 'select', options: ['hv', 'vh', 'straight'] },
      { key: 'radius', label: 'Corner', kind: 'number', min: 0, default: 10 },
      { key: 'nodes', label: 'End nodes', kind: 'boolean', default: true },
      { key: 'rings', label: 'End rings', kind: 'boolean', default: true },
      { key: 'fade', label: 'Fade', kind: 'boolean', default: true },
    ],
  },
  cursor: {
    label: 'Cursor',
    fields: [...XY, { key: 'size', label: 'Size', kind: 'number', min: 1, default: 86 }],
  },
  arrow: {
    label: 'Arrow',
    fields: [
      ...XY,
      { key: 'width', label: 'Length', kind: 'number', min: 1 },
      { key: 'thickness', label: 'Thickness', kind: 'number', min: 1 },
      { key: 'direction', label: 'Direction', kind: 'select', options: ['right', 'left', 'up'] },
      { key: 'tone', label: 'Tone', kind: 'select', options: ['primary', 'accent'] },
    ],
  },
  line: {
    label: 'Line',
    fields: [
      ...XY,
      { key: 'width', label: 'Run (W)', kind: 'number' },
      { key: 'height', label: 'Rise (H)', kind: 'number' },
      { key: 'tone', label: 'Colour', kind: 'token' },
      { key: 'thickness', label: 'Thickness', kind: 'number', min: 0.5, step: 0.5 },
      { key: 'rounded', label: 'Round ends', kind: 'boolean' },
    ],
  },
  map: {
    label: 'Dot map',
    fields: [
      ...XY,
      ...WH,
      { key: 'spacing', label: 'Spacing', kind: 'number', min: 1, default: 4 },
      { key: 'dotRadius', label: 'Dot size', kind: 'number', step: 0.1, min: 0.1, default: 0.85 },
    ],
  },
  image: {
    label: 'Image',
    fields: [
      { key: 'href', label: 'File', kind: 'file' },
      { key: 'alt', label: 'Description', kind: 'text' },
      ...XY,
      ...WH,
      { key: 'fit', label: 'Fit', kind: 'select', options: ['cover', 'contain'] },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0 },
    ],
  },
  svg: {
    label: 'Imported SVG',
    fields: [
      { key: 'body', label: 'File', kind: 'file' },
      { key: 'alt', label: 'Description', kind: 'text' },
      ...XY,
      ...WH,
      { key: 'fit', label: 'Fit', kind: 'select', options: ['contain', 'fill'] },
    ],
  },
  graphic: {
    label: 'Graphic',
    fields: [
      { key: 'name', label: 'Graphic', kind: 'graphic' },
      ...XY,
      ...WH,
      { key: 'blur', label: 'Glass blur', kind: 'number', min: 0, default: 12 },
    ],
  },
  spotIcon: {
    label: 'Glass icon',
    fields: [
      { key: 'name', label: 'Artwork', kind: 'select', options: SPOT_KEYS, labels: SPOT_LABELS, groups: SPOT_GROUPS },
      ...XY,
      { key: 'size', label: 'Size', kind: 'number', min: 1, default: 48 },
    ],
  },
};

/** Defaults used when adding from the palette. */
export const DEFAULTS: Record<Element['type'], () => Element> = {
  text: () => ({ type: 'text', x: 40, y: 40, role: 'heading', content: 'New text' }),
  // Cards arrive as columns: whatever is added stacks at the card padding the
  // audit requires, instead of every addition landing on the same spot.
  card: () => ({
    type: 'card', x: 40, y: 40, width: 180, height: 100, surface: 'glass2',
    layout: { direction: 'vertical', gap: 8, padding: LAYOUT.cardPadding, align: 'start' },
    children: [],
  }),
  group: () => ({
    type: 'group', x: 40, y: 40, width: 160, height: 80,
    layout: { direction: 'vertical', gap: 8, padding: 0 },
    children: [],
  }),
  subCard: () => ({
    type: 'subCard', x: 40, y: 40, width: 160, height: 80, surface: 'glass2', radius: 8,
    layout: { direction: 'vertical', gap: 8, padding: LAYOUT.cardPadding, align: 'start' },
    children: [],
  }),
  pill: () => ({ type: 'pill', x: 40, y: 40, width: 80, height: 24, label: 'Pill', variant: 'accent' }),
  badge: () => ({ type: 'badge', x: 40, y: 40, width: 44, label: 'Badge', tone: 'success' }),
  button: () => ({
    type: 'button',
    x: 40, y: 40, width: 120, height: 32,
    label: 'Button', variant: 'solid', radius: 4, role: 'bodySmall',
  }),
  toggle: () => ({ type: 'toggle', x: 40, y: 40, width: 42, height: 13, on: true }),
  input: () => ({ type: 'input', x: 40, y: 40, width: 138, height: 28, placeholder: 'Placeholder' }),
  chat: () => ({
    type: 'chat', x: 40, y: 40, width: 216, variant: 'receiver',
    name: 'Uge O.', message: 'Ready for launch?', initials: 'UO',
  }),
  chrome: () => ({ type: 'chrome', x: 40, y: 40, radius: 4, gap: 12 }),
  lineChart: () => ({
    type: 'lineChart',
    x: 40, y: 40, width: 170, height: 70, gridLines: 4, domain: [0, 1],
    series: [{ role: 'secondary', data: [0.1, 0.3, 0.25, 0.6, 0.5, 0.9] }],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  }),
  barChart: () => ({
    type: 'barChart', x: 40, y: 40, width: 150, height: 40,
    data: [20, 32, 14, 40, 26, 35],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  }),
  progress: () => ({ type: 'progress', x: 40, y: 40, width: 160, value: 0.6, label: 'Label' }),
  skeleton: () => ({ type: 'skeleton', x: 40, y: 40, width: 120, height: 8 }),
  stat: () => ({ type: 'stat', x: 40, y: 40, value: '12,847', label: 'Metric', valueRole: 'heading' }),
  icon: () => ({ type: 'icon', x: 40, y: 40, size: 20, icon: 'mc:check_circle', tone: 'accentSoft' }),
  iconGrid: () => ({
    type: 'iconGrid', x: 40, y: 40, columns: 4, size: 22, gapX: 34, gapY: 34,
    icons: ['mc:web', 'mc:cellphone', 'mc:mail', 'mc:star'],
  }),
  avatar: () => ({ type: 'avatar', cx: 60, cy: 60, r: 16, initials: 'AB' }),
  connector: () => ({ type: 'connector', from: [40, 40], to: [160, 120], route: 'hv', radius: 12 }),
  cursor: () => ({ type: 'cursor', x: 40, y: 40, size: 86 }),
  arrow: () => ({ type: 'arrow', x: 40, y: 40, width: 30, thickness: 9, direction: 'right' }),
  line: () => ({ type: 'line', x: 40, y: 40, width: 120, height: 0, tone: 'neutral-02', thickness: 1 }),
  map: () => ({ type: 'map', x: 40, y: 40, width: 168, height: 64, spacing: 4 }),
  spotIcon: () => ({ type: 'spotIcon', name: 'composable', x: 40, y: 40, size: 64 }),
  graphic: () => ({ type: 'graphic', name: 'rocket', x: 40, y: 40, width: 128, height: 126 }),
  // Both are only ever created by the importer, which supplies the payload.
  image: () => ({ type: 'image', x: 40, y: 40, width: 120, height: 80, href: '' }),
  svg: () => ({
    type: 'svg', x: 40, y: 40, width: 96, height: 96,
    viewBox: [0, 0, 96, 96], body: '',
  }),
};

/** Palette grouping, so the "add" menu reads like a design system. */
export const PALETTE: { group: string; types: Element['type'][] }[] = [
  { group: 'Surfaces', types: ['card', 'subCard', 'group'] },
  { group: 'Type', types: ['text', 'stat'] },
  { group: 'Controls', types: ['button', 'pill', 'badge', 'toggle', 'input', 'chat', 'chrome'] },
  { group: 'Data', types: ['lineChart', 'barChart', 'progress', 'map', 'skeleton'] },
  { group: 'Icons & shapes', types: ['spotIcon', 'icon', 'iconGrid', 'avatar', 'line', 'connector', 'arrow', 'cursor'] },
  { group: 'Imported', types: ['image', 'svg'] },
];
