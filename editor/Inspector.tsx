import type { BarChartEl, Element, LineChartEl } from '../src/document.ts';
import {
  commit,
  elementAt,
  getState,
  parentOf as parentOfPath,
  reorderSibling,
  reorderToEdge,
  replaceAt,
  setUI,
  useEditor,
} from './state.ts';
import { copySelected, duplicateSelected, paste } from './clipboard.ts';
import {
  alignChildren,
  distributeChildren,
  equaliseWidth,
  repadChildren,
  stackChildren,
} from './layout.ts';
import { snapTree } from './grid.ts';
import { LAYOUT, SPACE } from '../src/tokens.ts';
import type { LayoutSpec } from '../src/document.ts';
import { inferLayout, resolveLayout as resolveLayoutDoc } from '../src/autolayout.ts';
import { SCHEMA, type Field } from './schema.ts';
import { TokenPicker } from './TokenPicker.tsx';
import { AlignGrid, GapPicker, PaddingPicker } from './LayoutControls.tsx';
import { DocumentPanel } from './DocumentPanel.tsx';
import { FileField } from './FileField.tsx';
import { AvatarPhotoField } from './AvatarPhotoField.tsx';
import { BarSeriesEditor, LineSeriesEditor } from './ChartData.tsx';
import { deleteSelection, groupSelection, ungroupSelected } from './grouping.ts';
import { withText } from './InlineText.tsx';

/**
 * INSPECTOR — generated entirely from `schema.ts`.
 *
 * There is no per-element-type UI code here, and deliberately no colour input:
 * every paint decision is a `tone` / `variant` / `role` select that resolves
 * through tokens. That's the constraint that makes both themes work and keeps
 * output on-system, enforced by the absence of a control rather than by a
 * lint rule.
 */
export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const also = useEditor((s) => s.also);
  const el = elementAt(doc, selected);

  // Nothing selected falls back to document-level properties, so the panel is
  // never dead space and the scene layers stay reachable.
  if (!el || !selected) return <DocumentPanel />;
  if (also.length) return <MultiSelection count={also.length + 1} path={selected} />;

  const spec = SCHEMA[el.type];

  const parent = parentOfPath(selected);
  const parentEl = parent ? elementAt(doc, parent) : null;
  const autoPlaced = !!(
    parentEl &&
    (parentEl.type === 'card' || parentEl.type === 'subCard' || parentEl.type === 'group') &&
    parentEl.layout
  );

  const update = (key: string, value: unknown) => {
    const st = getState();
    const current = elementAt(st.doc, selected);
    if (!current) return;
    let next = typeof value === 'string' ? withText(current, key, value) : ({ ...current, [key]: value } as Element);
    // Typing a connector end's position takes it off what it was attached to,
    // or the edit would be undone by the attachment straight away.
    if (next.type === 'connector' && (key === 'from' || key === 'to') && next.attach?.[key]) {
      const attach = { ...next.attach };
      delete attach[key];
      next = { ...next, attach: attach.from || attach.to ? attach : undefined } as Element;
    }

    /*
     * Typing a width is a resize too. With the ratio locked, the other axis
     * follows here exactly as it does on a handle drag — otherwise the lock
     * would hold for the mouse and quietly not for the keyboard.
     */
    if (st.lockAspect && (key === 'width' || key === 'height') && typeof value === 'number') {
      const box = current as Element & { width?: number; height?: number };
      if (typeof box.width === 'number' && typeof box.height === 'number' && box.width > 0 && box.height > 0) {
        const aspect = box.width / box.height;
        const other = key === 'width'
          ? { height: Math.round((value / aspect) * 100) / 100 }
          : { width: Math.round(value * aspect * 100) / 100 };
        next = { ...next, ...other } as Element;
      }
    }

    commit(replaceAt(st.doc, selected, next));
  };

  // A file replaces several props at once, so it cannot go through `update`.
  const patch = (props: Record<string, unknown>) => {
    const st = getState();
    const current = elementAt(st.doc, selected);
    if (!current) return;
    commit(replaceAt(st.doc, selected, { ...current, ...props } as Element));
  };

  const isCard = el.type === 'card' || el.type === 'subCard' || el.type === 'group';

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="badge-type">{spec.label}</span>
        <code className="path">{selected}</code>
      </div>
      <ZOrder path={selected} inFlow={autoPlaced} />

      {/* Discoverable equivalents of the keyboard shortcuts. */}
      <div className="row-actions">
        <button type="button" onClick={() => duplicateSelected()} title="Duplicate (⌘D)">
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => {
            const copied = copySelected();
            // The in-memory clipboard is already set; mirroring to the system
            // clipboard is best-effort since write access can be refused.
            if (copied) void navigator.clipboard?.writeText(copied.payload).catch(() => {});
          }}
          title="Copy (⌘C)"
        >
          Copy
        </button>
        <button type="button" onClick={() => paste(null)} title="Paste (⌘V)">
          Paste
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => deleteSelection()}
          title="Delete (⌫)"
        >
          Delete
        </button>
        {el.type === 'group' ? (
          <button type="button" onClick={() => ungroupSelected()} title="Ungroup (⇧⌘G)">
            Ungroup
          </button>
        ) : (
          <button
            type="button"
            disabled={autoPlaced}
            onClick={() => groupSelection()}
            title={
              autoPlaced
                ? 'Can’t group inside an auto-layout container'
                : 'Wrap in a group (⌘G) — shift-click to add more first'
            }
          >
            Group
          </button>
        )}
      </div>
      {autoPlaced && <ChildLayout path={selected} />}
      {isCard && <CardLayout path={selected} />}

      <div className="fields">
        {spec.fields
          .filter((f) => !(autoPlaced && (f.key === 'x' || f.key === 'y')))
          .map((f) => (
          <FieldRow
            key={f.key}
            field={f}
            el={el}
            value={(el as unknown as Record<string, unknown>)[f.key]}
            onChange={(v) => update(f.key, v)}
            onPatch={patch}
          />
        ))}
      </div>
    </div>
  );
}

/** Per-child controls, shown when a container is positioning this element. */
/**
 * Several elements selected. The fields of one element would be misleading
 * here, so the panel offers only what applies to the set.
 */
function MultiSelection({ count, path }: { count: number; path: string }) {
  const doc = useEditor((s) => s.doc);
  const parent = parentOfPath(path);
  const parentEl = parent ? elementAt(doc, parent) : null;
  const inFlow = !!(parentEl && (parentEl as { layout?: unknown }).layout);
  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="badge-type">{count} selected</span>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={inFlow}
          onClick={() => groupSelection()}
          title={inFlow ? 'Can’t group inside an auto-layout container' : 'Group (⌘G)'}
        >
          Group
        </button>
        <button type="button" className="danger" onClick={() => deleteSelection()} title="Delete (⌫)">
          Delete
        </button>
      </div>
      <p className="panel-note">
        Shift-click on the canvas or in Layers to add or remove items.
        {inFlow && ' These sit in an auto-layout container, which positions them itself — group them outside it.'}
      </p>
    </div>
  );
}

function ChildLayout({ path }: { path: string }) {
  const doc = useEditor((s) => s.doc);
  const el = elementAt(doc, path) as (Element & { grow?: number; alignSelf?: string }) | null;
  if (!el) return null;

  const set = (patch: Record<string, unknown>) => {
    const st = getState();
    const cur = elementAt(st.doc, path);
    if (cur) commit(replaceAt(st.doc, path, { ...cur, ...patch } as Element));
  };

  return (
    <div className="section">
      <div className="section-head">
        <span>In auto layout</span>
      </div>
      <div className="fields" style={{ padding: 0 }}>
        <label className="field">
          <span className="field-label">Grow</span>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={el.grow ?? ''}
            onChange={(e) =>
              set({ grow: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Align self</span>
          <select
            value={el.alignSelf ?? ''}
            onChange={(e) => set({ alignSelf: e.target.value || undefined })}
          >
            <option value="">inherit</option>
            {['start', 'center', 'end', 'stretch'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="panel-note" style={{ padding: '6px 0 0', border: 0 }}>
        Position is computed. Drag it on the canvas to reorder it or take it out of the card, or use the arrows in Layers.
      </p>
    </div>
  );
}

/**
 * Z-ORDER — or, inside an auto-layout container, position in the flow.
 *
 * Same four operations either way: the array order IS the draw order at the
 * root and the layout order inside a container, so one control serves both.
 * The labels change so it never claims to do something it isn't.
 */
function ZOrder({ path, inFlow }: { path: string; inFlow: boolean }) {
  const step = (dir: -1 | 1) => {
    const st = getState();
    const next = reorderSibling(st.doc, path, dir);
    if (!next) return;
    commit(next.doc);
    setUI({ selected: next.path });
  };
  const edge = (to: 'front' | 'back') => {
    const st = getState();
    const next = reorderToEdge(st.doc, path, to);
    if (!next) return;
    commit(next.doc);
    setUI({ selected: next.path });
  };

  return (
    <div className="section">
      <div className="section-head">
        <span>{inFlow ? 'Order in layout' : 'Z-order'}</span>
      </div>
      <div className="layout-actions" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <button type="button" onClick={() => edge('back')} title={inFlow ? 'Move to first (⌘[)' : 'Send to back (⌘[)'}>
          ⤓ Back
        </button>
        <button type="button" onClick={() => step(-1)} title={inFlow ? 'Move earlier ([)' : 'Send backward ([)'}>
          ↑
        </button>
        <button type="button" onClick={() => step(1)} title={inFlow ? 'Move later (])' : 'Bring forward (])'}>
          ↓
        </button>
        <button type="button" onClick={() => edge('front')} title={inFlow ? 'Move to last (⌘])' : 'Bring to front (⌘])'}>
          ⤒ Front
        </button>
      </div>
    </div>
  );
}

/**
 * LAYOUT — the card's own padding, and actions over its direct children.
 *
 * Single-selection means these act on "this card and what's in it" rather
 * than on a hand-picked set. That is the actual task most of the time, and it
 * keeps padding, alignment and gap coming from one place.
 */
function CardLayout({ path }: { path: string }) {
  const padding = useEditor((s) => s.padding);
  const snapStep = useEditor((s) => s.snapStep);
  const doc = useEditor((s) => s.doc);

  const apply = (fn: (card: Element) => Element) => {
    const st = getState();
    const card = elementAt(st.doc, path);
    if (!card) return;
    commit(replaceAt(st.doc, path, fn(card)));
  };

  const card = elementAt(doc, path) as
    | (Element & { layout?: LayoutSpec; children?: Element[] })
    | null;
  const kids = card?.children?.length ?? 0;
  const layout = card?.layout;

  const setLayout = (patch: Partial<LayoutSpec>) =>
    apply((c) => ({
      ...c,
      layout: { ...(c as { layout?: LayoutSpec }).layout, ...patch } as LayoutSpec,
    }) as Element);

  if (layout) {
    const horizontal = layout.direction === 'horizontal';
    const align = layout.align ?? 'start';
    const justify = layout.justify ?? 'start';

    return (
      <div className="section">
        <div className="section-head">
          <span>Auto layout · {kids} child{kids === 1 ? '' : 'ren'}</span>
          <button
            type="button"
            className="mini"
            title="Freeze the computed positions back into the children"
            onClick={() =>
              apply((c) => {
                const resolved = resolveOne(c);
                const { layout: _drop, ...rest } = resolved as unknown as Record<string, unknown>;
                return rest as unknown as Element;
              })
            }
          >
            detach
          </button>
        </div>

        <div className="layout-actions two">
          {(['vertical', 'horizontal'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={layout.direction === d ? 'on' : ''}
              onClick={() => setLayout({ direction: d })}
            >
              {d === 'vertical' ? '↓ Column' : '→ Row'}
            </button>
          ))}
        </div>

        <div className="align-row" style={{ marginTop: 8 }}>
          <AlignGrid
            direction={layout.direction}
            align={align === 'baseline' || align === 'stretch' ? 'start' : align}
            justify={justify === 'between' ? 'start' : justify}
            onAlign={(v) => setLayout({ align: v })}
            onJustify={(v) => setLayout({ justify: v })}
          />
          <div className="align-side">
            <button
              type="button"
              className={`mini${justify === 'between' ? ' on' : ''}`}
              title="Push the gaps apart so the first and last children sit on the edges"
              onClick={() => setLayout({ justify: justify === 'between' ? 'start' : 'between' })}
            >
              space between
            </button>
            <button
              type="button"
              className={`mini${align === 'stretch' ? ' on' : ''}`}
              title="Fill the container's other dimension"
              onClick={() => setLayout({ align: align === 'stretch' ? 'start' : 'stretch' })}
            >
              stretch
            </button>
            <button
              type="button"
              className={`mini${align === 'baseline' ? ' on' : ''}`}
              disabled={!horizontal}
              title={
                horizontal
                  ? 'Put every child’s first text baseline on one line'
                  : 'Baseline alignment applies across a row'
              }
              onClick={() => setLayout({ align: align === 'baseline' ? 'start' : 'baseline' })}
            >
              baseline
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <GapPicker
            label="Gap"
            value={layout.gap ?? LAYOUT.gap}
            onChange={(v) => setLayout({ gap: v })}
          />
          <PaddingPicker
            value={layout.padding ?? LAYOUT.cardPadding}
            onChange={(v) => setLayout({ padding: v })}
          />
        </div>

        <div className="layout-actions two" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={layout.hugWidth ? 'on' : ''}
            onClick={() => setLayout({ hugWidth: !layout.hugWidth })}
            title="Shrink the container's width to its content"
          >
            Hug W
          </button>
          <button
            type="button"
            className={layout.hugHeight ? 'on' : ''}
            onClick={() => setLayout({ hugHeight: !layout.hugHeight })}
            title="Shrink the container's height to its content"
          >
            Hug H
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <span>Layout · {kids} child{kids === 1 ? '' : 'ren'}</span>
      </div>

      <label className="field wide">
        <span className="field-label">Padding (spacing scale)</span>
        <select
          value={padding}
          onChange={(e) => {
            const next = Number(e.target.value);
            // Move the children with the padding, so the inset changes rather
            // than the contents drifting relative to the frame.
            apply((card) => repadChildren(card, padding, next));
            setUI({ padding: next });
          }}
        >
          {SPACE.filter((v) => v <= 32).map((v) => (
            <option key={v} value={v}>
              {v}px
            </option>
          ))}
        </select>
      </label>

      <div className="layout-actions">
        <button type="button" onClick={() => apply((c) => alignChildren(c, padding, 'left'))}>
          Align left
        </button>
        <button type="button" onClick={() => apply((c) => alignChildren(c, padding, 'centre'))}>
          Centre
        </button>
        <button type="button" onClick={() => apply((c) => alignChildren(c, padding, 'right'))}>
          Align right
        </button>
      </div>

      <div className="layout-actions two" style={{ marginTop: 5 }}>
        <button type="button" onClick={() => apply((c) => equaliseWidth(c, padding))}>
          Fit widths
        </button>
        <button type="button" onClick={() => apply((c) => distributeChildren(c, padding))}>
          Distribute
        </button>
      </div>

      <div className="layout-actions" style={{ marginTop: 5 }}>
        {[4, 8, 12].map((gap) => (
          <button
            key={gap}
            type="button"
            title={`Stack children from the top with a ${gap}px gap`}
            onClick={() => apply((c) => stackChildren(c, padding, gap))}
          >
            Stack {gap}
          </button>
        ))}
      </div>

      <div className="layout-actions two" style={{ marginTop: 5 }}>
        <button
          type="button"
          title="Snap this card and everything in it to the grid"
          onClick={() => apply((c) => snapTree(c, Math.max(snapStep, 1)))}
        >
          Snap to grid
        </button>
        <button
          type="button"
          className="primary-mini"
          title="Let this card position its own children"
          onClick={() => apply((c) => ({ ...c, layout: inferLayout(c, padding) }) as Element)}
        >
          Auto layout
        </button>
      </div>
    </div>
  );
}

/** Resolve a single container, for `detach`. */
function resolveOne(card: Element): Element {
  const doc = {
    id: 'x', name: 'x', layout: 'bare' as const,
    canvas: { width: 0, height: 0 }, elements: [card],
  };
  return resolveLayoutDoc(doc).elements[0];
}

function FieldRow({
  field,
  el,
  value,
  onChange,
  onPatch,
}: {
  field: Field;
  el: Element;
  value: unknown;
  onChange: (v: unknown) => void;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const wide =
    field.kind === 'token' ||
    field.kind === 'textarea' ||
    field.kind === 'text' ||
    field.kind === 'select' ||
    field.kind === 'numbers' ||
    field.kind === 'series' ||
    field.kind === 'bars' ||
    field.kind === 'file' ||
    field.kind === 'photo' ||
    field.kind === 'iconList' ||
    field.kind === 'list';

  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span className="field-label">{field.label}</span>
      <Control field={field} el={el} value={value} onChange={onChange} onPatch={onPatch} />
    </label>
  );
}

function Control({
  field,
  el,
  value,
  onChange,
  onPatch,
}: {
  field: Field;
  el: Element;
  value: unknown;
  onChange: (v: unknown) => void;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  switch (field.kind) {
    case 'file':
      return <FileField el={el} onPatch={onPatch} />;

    case 'photo':
      return (
        <AvatarPhotoField
          value={value === undefined ? undefined : String(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          step={field.step ?? 1}
          min={field.min}
          // Empty means "inherit the primitive's default", so show it.
          placeholder={field.default === undefined ? '' : String(field.default)}
          value={value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      );

    case 'text':
      return (
        <input
          type="text"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );

    case 'textarea':
      return (
        <textarea
          rows={2}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'boolean': {
      // Reflect what's actually drawn, including a resolved default.
      const fallback =
        typeof field.default === 'function' ? field.default(el) : field.default ?? false;
      return (
        <input
          type="checkbox"
          checked={value === undefined ? fallback : Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    }

    case 'select': {
      const option = (o: string) => (
        <option key={o} value={o}>
          {o === '' ? '—' : (field.labels?.[o] ?? o)}
        </option>
      );
      // Grouped options (the glass icons, by category) run in consecutive
      // blocks, one <optgroup> each.
      const groups = field.groups;
      const blocks: { group: string; options: string[] }[] = [];
      if (groups) {
        for (const o of field.options) {
          const g = groups[o] ?? '';
          if (blocks.at(-1)?.group === g) blocks.at(-1)!.options.push(o);
          else blocks.push({ group: g, options: [o] });
        }
      }
      return (
        <select
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          {groups
            ? blocks.map((b) =>
                b.group ? (
                  <optgroup key={b.group} label={b.group}>
                    {b.options.map(option)}
                  </optgroup>
                ) : (
                  b.options.map(option)
                ),
              )
            : field.options.map(option)}
        </select>
      );
    }

    case 'numbers':
      return (
        <input
          type="text"
          value={Array.isArray(value) ? (value as number[]).join(', ') : ''}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => !Number.isNaN(n)),
            )
          }
        />
      );

    case 'point': {
      const p = (Array.isArray(value) ? value : [0, 0]) as [number, number];
      return (
        <span className="pair">
          <input
            type="number"
            value={p[0]}
            onChange={(e) => onChange([Number(e.target.value), p[1]])}
          />
          <input
            type="number"
            value={p[1]}
            onChange={(e) => onChange([p[0], Number(e.target.value)])}
          />
        </span>
      );
    }

    case 'token':
      return (
        <TokenPicker
          value={value === undefined ? undefined : String(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case 'iconList':
      return (
        <input
          type="text"
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          onChange={(e) =>
            onChange(e.target.value.split(',').map((s) => s.trim() || null))
          }
        />
      );

    case 'list':
      return (
        <input
          type="text"
          placeholder="Jan, Feb, Mar"
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          onChange={(e) => {
            // Only the space after each comma goes: a trailing one is still
            // being typed ("New York"), and the chart trims when it draws.
            const items = e.target.value.split(',').map((s) => s.replace(/^\s+/, ''));
            onChange(items.some(Boolean) ? items : undefined);
          }}
        />
      );

    case 'series':
      return <LineSeriesEditor el={el as LineChartEl} onChange={onChange} />;

    case 'bars':
      return <BarSeriesEditor el={el as BarChartEl} onPatch={onPatch} />;
  }
}
