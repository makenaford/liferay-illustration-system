import type { Element } from '../src/document.ts';
import { SCHEMA } from './schema.ts';
import { commit, elementAt, getState, reorderSibling, setUI, useEditor } from './state.ts';

/**
 * LAYERS — the element tree, and the only place z-order can be changed.
 *
 * Root order is draw order, so reordering here is what puts an overlay card
 * in front of a dashboard.
 */
export function Layers() {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);

  return (
    <div className="layers">
      {doc.elements.map((el, i) => (
        <Row
          key={i}
          el={el}
          path={String(i)}
          selected={selected}
          depth={0}
          index={i}
          rootCount={doc.elements.length}
        />
      ))}
    </div>
  );
}

function Row({
  el,
  path,
  selected,
  depth,
  index,
  rootCount,
}: {
  el: Element;
  path: string;
  selected: string | null;
  depth: number;
  index: number;
  rootCount: number;
}) {
  const kids = (el as { children?: Element[] }).children ?? [];
  const isSel = selected === path;
  const label = summarise(el);

  const move = (dir: -1 | 1) => {
    const st = getState();
    const next = reorderSibling(st.doc, path, dir);
    if (!next) return;
    commit(next.doc);
    setUI({ selected: next.path });
  };

  // Inside an auto-layout container these reorder the LAYOUT, not the z-order.
  const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : null;
  const parent = parentPath ? elementAt(getState().doc, parentPath) : null;
  const inFlow = !!(parent && (parent.type === 'card' || parent.type === 'subCard' || parent.type === 'group') && parent.layout);

  return (
    <>
      <div
        className={`layer${isSel ? ' sel' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setUI({ selected: path })}
      >
        <span className="layer-type">{SCHEMA[el.type].label}</span>
        {(el.type === 'card' || el.type === 'subCard' || el.type === 'group') && el.layout && (
          <span className="layer-flag" title={`Auto layout — ${el.layout.direction}`}>
            {el.layout.direction === 'horizontal' ? '→' : '↓'}
          </span>
        )}
        {label && <span className="layer-label">{label}</span>}
        <span className="layer-z">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              move(-1);
            }}
            title={inFlow ? 'Move earlier in the layout' : 'Send backward'}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === rootCount - 1}
            onClick={(e) => {
              e.stopPropagation();
              move(1);
            }}
            title={inFlow ? 'Move later in the layout' : 'Bring forward'}
          >
            ↓
          </button>
        </span>
      </div>
      {kids.map((k, i) => (
        <Row
          key={i}
          el={k}
          path={`${path}.${i}`}
          selected={selected}
          depth={depth + 1}
          index={i}
          rootCount={kids.length}
        />
      ))}
    </>
  );
}

/** A short human label, so the tree reads like content not types. */
function summarise(el: Element): string {
  const e = el as unknown as Record<string, unknown>;
  for (const k of ['content', 'label', 'value', 'placeholder', 'title', 'name', 'initials']) {
    const v = e[k];
    if (typeof v === 'string' && v) return v.length > 26 ? `${v.slice(0, 26)}…` : v;
  }
  if (el.type === 'iconGrid') return `${el.icons.length} icons`;
  if (el.type === 'icon') return el.icon ?? 'placeholder';
  return '';
}
