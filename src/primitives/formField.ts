import { h, type Ctx, type VNode } from '../vsvg.ts';
import { Text, TYPE_ROLES, measureTextEl, typeStyle, wrapLines, type TypeRole } from './text.ts';
import { measureText } from '../fontMetrics.generated.ts';
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

/** Inside the box, either side of the text. */
const INSET = 10;

/**
 * A field laid out at its width: the label and the text wrapped to fit —
 * the label across the field, the text inside the box's padding — and the
 * box as tall as `height` leaves it, or taller when the wrapped text needs
 * it. What the renderer draws, and what layout measures the field at.
 */
export function formFieldLayout(p: Pick<FormFieldProps, 'width' | 'height' | 'label' | 'required' | 'value' | 'lines' | 'role'>) {
  const role = p.role ?? 'caption';
  const size = TYPE_ROLES[role].size;
  const lead = size * 1.4;
  const label = typeStyle(LABEL, 'semibold');
  const labelLead = TYPE_ROLES[LABEL].size * 1.25;
  const star = p.required ? measureText('*', label.size, label.weight) + 3 : 0;
  const labelLines = p.label ? wrapLines(p.label, (s) => measureText(s, label.size, label.weight), Math.max(p.width - star, 1)) : [];
  const top = labelLines.length ? labelLines.length * labelLead + LABEL_GAP : 0;
  const text = typeStyle(role, 'regular');
  const raw = p.lines?.length ? p.lines : p.value ? [p.value] : [];
  const lines = raw.flatMap((l) => wrapLines(l, (s) => measureText(s, text.size, text.weight), Math.max(p.width - INSET * 2, 1)));
  // Several lines run from the top of the box, and the box holds them all.
  const needs = lines.length > 1 ? INSET * 2 + size * 1.05 + (lines.length - 1) * lead : 16;
  const box = Math.max(p.height - top, 16, needs);
  return { labelLines, labelLead, top, lines, lead, box, height: top + box };
}

/** Where the label ends and the box starts, from the field's top. */
export function formFieldBox(p: Pick<FormFieldProps, 'label' | 'height' | 'width' | 'required' | 'value' | 'lines' | 'role'>) {
  const L = formFieldLayout(p);
  return { top: L.top, height: L.box };
}

/**
 * FORM FIELD — a labelled input, filled in or waiting: "Full Name *" over
 * "Elías Navarro", or "Project Description" over a few lines of text. The
 * label and the box are one element, so a form is a stack of these rather
 * than texts and inputs kept in line by hand.
 */
export function FormField(ctx: Ctx, props: FormFieldProps): VNode {
  const { x, y, width, required } = props;
  const tk = ctx.tokens;
  const L = formFieldLayout(props);
  const box = { top: L.top, height: L.box };
  const role = props.role ?? 'caption';
  const size = TYPE_ROLES[role].size;
  const { lines, lead } = L;
  const labelSize = TYPE_ROLES[LABEL].size;

  const nodes: (VNode | null)[] = [];
  if (L.labelLines.length) {
    L.labelLines.forEach((line, i) =>
      nodes.push(Text(ctx, { x, y: y + labelSize * 0.95 + i * L.labelLead, role: LABEL, weight: 'semibold', content: line })),
    );
    if (required) {
      // After the label's last line, at its measured width.
      const last = L.labelLines[L.labelLines.length - 1];
      nodes.push(
        Text(ctx, {
          x: x + measureTextEl({ role: LABEL, weight: 'semibold', content: last }).width + 3,
          y: y + labelSize * 0.95 + (L.labelLines.length - 1) * L.labelLead,
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
  const first = lines.length > 1 ? y + box.top + INSET + size * 0.8 : y + box.top + box.height / 2 + size * 0.355;
  lines.forEach((line, i) =>
    nodes.push(Text(ctx, { x: x + INSET, y: first + i * lead, role, weight: 'regular', content: line })),
  );
  return h('g', { 'data-el': 'form-field' }, nodes);
}
