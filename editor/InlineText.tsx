import { useLayoutEffect, useRef, useState } from 'react';
import type { Element } from '../src/document.ts';
import { commit, elementAt, getState, replaceAt, useEditor } from './state.ts';

/**
 * INLINE TEXT EDITING — double-click words in the illustration and type.
 *
 * Every element that shows words keeps them in one field; this is the map.
 * A stat block has two (its figure and its label), so which one you get is
 * decided by which string you double-clicked.
 */
const TEXT_FIELDS: Partial<Record<Element['type'], string[]>> = {
  text: ['content'],
  button: ['label'],
  pill: ['label'],
  badge: ['label'],
  progress: ['label'],
  stat: ['value', 'label'],
  input: ['placeholder'],
};

/**
 * Split `text` into `n` lines of as-even-as-possible length, breaking only
 * between words. Used where an element stores its own line breaks.
 */
export function balanceLines(text: string, n: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (n <= 1 || words.length <= 1) return [words.join(' ')];
  const lines: string[] = [];
  let rest = words;
  for (let k = n; k > 1 && rest.length > 1; k--) {
    // Aim each line at an equal share of what is left.
    const target = rest.join(' ').length / k;
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < rest.length; i++) {
      const diff = Math.abs(rest.slice(0, i).join(' ').length - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    lines.push(rest.slice(0, best).join(' '));
    rest = rest.slice(best);
  }
  lines.push(rest.join(' '));
  return lines;
}

/**
 * Set a text field. A button that stores its own line breaks (`lines`) draws
 * those rather than its label, so changing the label alone changed nothing on
 * the canvas; the new words are re-split across the same number of lines.
 */
export function withText(el: Element, field: string, value: string): Element {
  const next = { ...el, [field]: value } as Element & { lines?: string[] };
  if (field === 'label' && Array.isArray(next.lines)) next.lines = balanceLines(value, next.lines.length);
  return next;
}

export interface TextTarget {
  path: string;
  field: string;
  /** The value before editing, for Escape. */
  original: string;
}

/**
 * What a double-click on `node` (an SVG element inside the canvas) edits, if
 * anything: the element it belongs to and the field that holds the words.
 */
export function textTargetAt(node: globalThis.Element | null): TextTarget | null {
  const group = node?.closest('[data-path]');
  const path = group?.getAttribute('data-path');
  if (!path) return null;
  const el = elementAt(getState().doc, path) as (Element & Record<string, unknown>) | null;
  const fields = el ? TEXT_FIELDS[el.type] : undefined;
  if (!el || !fields) return null;

  const hit = node?.closest('text')?.textContent?.trim() ?? '';
  // The field whose string was hit; wrapped labels draw one line per <text>,
  // so a line matches the field that contains it.
  const field =
    fields.find((f) => typeof el[f] === 'string' && hit && String(el[f]).includes(hit)) ?? fields[0];
  return { path, field, original: String(el[field] ?? '') };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The input, laid over the words it edits. It sits inside the zoomed stage,
 * so its sizes are artboard units like everything else there, and it copies
 * font, size, weight, colour, tracking and alignment from the drawn <text>
 * itself — whatever primitive drew it — so the edit looks like the result.
 */
export function InlineText({
  target,
  docRef,
  onDone,
}: {
  target: TextTarget;
  docRef: React.RefObject<HTMLDivElement | null>;
  onDone: () => void;
}) {
  const doc = useEditor((s) => s.doc);
  const zoom = useEditor((s) => s.zoom);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const edited = useRef(false);
  const [geom, setGeom] = useState<{ box: Box; style: React.CSSProperties; anchor: string; lines: number } | null>(null);

  const el = elementAt(doc, target.path) as (Element & Record<string, unknown>) | null;
  const value = el ? String(el[target.field] ?? '') : '';

  // Re-measured after every change: the text reflows (and an auto-layout
  // card with it) as you type, and the input follows it.
  useLayoutEffect(() => {
    const group = docRef.current?.querySelector(`[data-path="${target.path}"]`);
    const stage = docRef.current?.getBoundingClientRect();
    if (!group || !stage) return;
    const texts = [...group.querySelectorAll('text')].filter((t) => {
      const s = t.textContent?.trim() ?? '';
      return s && (value.includes(s) || target.original.includes(s));
    });
    const nodes = texts.length ? texts : [...group.querySelectorAll('text')];
    if (!nodes.length) return;

    const rects = nodes.map((n) => n.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const box = {
      x: (left - stage.left) / zoom,
      y: (top - stage.top) / zoom,
      width: (right - left) / zoom,
      height: (bottom - top) / zoom,
    };

    const first = nodes[0];
    const cs = getComputedStyle(first);
    const attr = (name: string) => first.getAttribute(name) ?? undefined;
    setGeom({
      box,
      lines: nodes.length,
      anchor: attr('text-anchor') ?? 'start',
      style: {
        fontFamily: attr('font-family') ?? cs.fontFamily,
        fontSize: Number(attr('font-size') ?? parseFloat(cs.fontSize)),
        fontWeight: attr('font-weight') ?? cs.fontWeight,
        letterSpacing: attr('letter-spacing') ? Number(attr('letter-spacing')) : undefined,
        color: attr('fill') ?? cs.fill,
      },
    });
  }, [doc, zoom, target.path, value, target.original, docRef]);

  // Focus once the input exists — the first render has no geometry yet, so
  // it draws nothing and there is nothing to focus.
  const placed = !!geom;
  useLayoutEffect(() => {
    if (!placed) return;
    // Without preventScroll the browser scrolls the canvas viewport to bring
    // the input into view, which shifts the whole illustration.
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, [placed]);

  const write = (next: string) => {
    const st = getState();
    const current = elementAt(st.doc, target.path);
    if (!current) return;
    // The first keystroke opens an undo step; the rest join it, so one edit
    // is one ⌘Z however long the typing.
    commit(replaceAt(st.doc, target.path, withText(current, target.field, next)), edited.current);
    edited.current = true;
  };

  if (!geom || !el) return null;

  const pad = 4;
  // A label that wraps (a button drawing two lines) is edited as the block it
  // is, at the width it wraps to; one line gets room to grow as you type.
  const multi = geom.lines > 1;
  const width = multi ? geom.box.width + pad * 2 : Math.max(geom.box.width + pad * 2 + 16, 40);
  const left =
    geom.anchor === 'middle'
      ? geom.box.x + geom.box.width / 2 - width / 2
      : geom.anchor === 'end'
        ? geom.box.x + geom.box.width + pad - width
        : geom.box.x - pad;
  const Tag = multi ? 'textarea' : 'input';

  return (
    <>
      {/* The drawn words step aside while their stand-in is being typed into. */}
      <style>{`.doc [data-path="${target.path}"] text { opacity: 0; }`}</style>
      <Tag
        ref={input}
        className={`inline-text${multi ? ' multi' : ''}`}
        value={value}
        spellCheck={false}
        aria-label="Edit text"
        style={{
          ...geom.style,
          left,
          top: geom.box.y - 2,
          width,
          height: geom.box.height + 4,
          padding: `0 ${pad}px`,
          textAlign: geom.anchor === 'middle' ? 'center' : geom.anchor === 'end' ? 'right' : 'left',
          outlineWidth: 1 / zoom,
          outlineOffset: 1 / zoom,
        }}
        onChange={(e) => write(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          // Enter finishes, even in a wrapped label: line breaks come from the
          // wrap width, not from typing them.
          if (e.key === 'Enter') {
            e.preventDefault();
            onDone();
          }
          if (e.key === 'Escape') {
            if (edited.current) write(target.original);
            onDone();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={onDone}
      />
    </>
  );
}
