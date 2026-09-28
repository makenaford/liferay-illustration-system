import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, measureTextEl, type TypeRole } from './text.ts';
import { InputField } from './inputField.ts';

export interface FormFieldProps {
  x: number;
  y: number;
  width: number;
  /** The whole field: its label and its box. */
  height: number;
  label?: string;
  /** A red asterisk after the label. */
  required?: boolean;
  /** What is filled in. Several lines make it a text area. */
  value?: string;
  lines?: string[];
  /** Shown, muted, when there is no value. */
  placeholder?: string;
  role?: TypeRole;
}

const LABEL: TypeRole = 'bodySmall';
/** From the label's line box to the field's box. */
const LABEL_GAP = 6;

/** Where the label ends and the box starts, from the field's top. */
export function formFieldBox(p: Pick<FormFieldProps, 'label' | 'height'>) {
  const top = p.label ? TYPE_ROLES[LABEL].size * 1.25 + LABEL_GAP : 0;
  return { top, height: Math.max(p.height - top, 16) };
}

/**
 * FORM FIELD — a labelled input, filled in or waiting: "Full Name *" over
 * "Elías Navarro", or "Project Description" over a few lines of text. The
 * label and the box are one element, so a form is a stack of these rather
 * than texts and inputs kept in line by hand.
 */
export function FormField(ctx: Ctx, props: FormFieldProps): VNode {
  const { x, y, width, label, required } = props;
  const tk = ctx.tokens;
  const box = formFieldBox(props);
  const role = props.role ?? 'caption';
  const size = TYPE_ROLES[role].size;
  const lines = props.lines?.length ? props.lines : props.value ? [props.value] : [];
  const lead = size * 1.4;
  const labelSize = TYPE_ROLES[LABEL].size;

  const nodes: (VNode | null)[] = [];
  if (label) {
    nodes.push(Text(ctx, { x, y: y + labelSize * 0.95, role: LABEL, weight: 'semibold', content: label }));
    if (required) {
      // After the label, at its measured width.
      nodes.push(
        Text(ctx, {
          x: x + measureTextEl({ role: LABEL, weight: 'semibold', content: label }).width + 3,
          y: y + labelSize * 0.95,
          role: LABEL,
          weight: 'semibold',
          content: '*',
          color: tk.status.danger,
        }),
      );
    }
  }
  // The box itself is an input, placeholder and all, when nothing is filled in.
  nodes.push(
    InputField(ctx, {
      x,
      y: y + box.top,
      width,
      height: box.height,
      placeholder: lines.length ? '' : (props.placeholder ?? ''),
      role,
    }),
  );
  // Filled in: the value in the text colour, from the top when it runs to
  // several lines, centred when it is one.
  const first = lines.length > 1 ? y + box.top + 10 + size * 0.8 : y + box.top + box.height / 2 + size * 0.355;
  lines.forEach((line, i) =>
    nodes.push(Text(ctx, { x: x + 10, y: first + i * lead, role, weight: 'regular', content: line })),
  );
  return h('g', { 'data-el': 'form-field' }, nodes);
}
