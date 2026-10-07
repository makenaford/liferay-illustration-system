import type { DropdownItem, DropdownLead, ProfileColor } from '../src/primitives/dropdown.ts';
import { PROFILE_COLORS } from '../src/primitives/dropdown.ts';
import { IconPicker } from './IconPicker.tsx';

const LEADS: { value: DropdownLead; label: string }[] = [
  { value: 'none', label: 'Text only' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio' },
  { value: 'profile', label: 'Profile' },
  { value: 'icon', label: 'Icon' },
];
const COLORS = Object.keys(PROFILE_COLORS) as ProfileColor[];

/**
 * A dropdown's items, one block each: the label, what leads it, and what
 * that lead needs — ticked or not, a profile's letter and colour, an icon.
 * One item at a time is the picked row, and one radio at a time is chosen,
 * as in a real menu. Items are added at the end and moved with the arrows.
 */
export function MenuItemsEditor({ items, onChange }: { items: DropdownItem[]; onChange: (items: DropdownItem[]) => void }) {
  const set = (i: number, patch: Partial<DropdownItem>) =>
    onChange(
      items.map((it, j) => {
        if (j === i) return { ...it, ...patch };
        // Only one row is picked out, and only one radio chosen.
        let next = it;
        if (patch.selected) next = { ...next, selected: undefined };
        if (patch.checked && items[i].lead === 'radio' && it.lead === 'radio') next = { ...next, checked: undefined };
        return next;
      }),
    );
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    // A new item takes the last one's lead, so a list of checkboxes stays one.
    const last = items.at(-1);
    onChange([...items, { label: 'Item', lead: last?.lead ?? 'none', ...(last?.lead === 'icon' ? { icon: last.icon } : {}) }]);
  };

  return (
    <span className="series menu-items">
      {items.map((it, i) => {
        const lead = it.lead ?? 'none';
        return (
          <span key={i} className="menu-item">
            <span className="series-row">
              <input type="text" value={it.label} aria-label={`Item ${i + 1} label`} onChange={(e) => set(i, { label: e.target.value })} />
              <select value={lead} aria-label={`Item ${i + 1} lead`} onChange={(e) => set(i, { lead: e.target.value as DropdownLead })}>
                {LEADS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </span>
            {lead === 'profile' && (
              <span className="series-row">
                <input
                  type="text"
                  maxLength={2}
                  placeholder={(it.label.trim()[0] ?? '').toUpperCase()}
                  value={it.initial ?? ''}
                  aria-label={`Item ${i + 1} letter`}
                  title="The tile's letter — its label's first when empty"
                  onChange={(e) => set(i, { initial: e.target.value || undefined })}
                />
                <select
                  value={it.color ?? ''}
                  aria-label={`Item ${i + 1} colour`}
                  onChange={(e) => set(i, { color: (e.target.value || undefined) as ProfileColor | undefined })}
                >
                  <option value="">Auto colour</option>
                  {COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c[0].toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {lead === 'icon' && <IconPicker value={it.icon} style="line" onChange={(icon) => set(i, { icon })} />}
            <span className="menu-item-flags">
              {(lead === 'checkbox' || lead === 'radio') && (
                <label>
                  <input type="checkbox" checked={!!it.checked} onChange={(e) => set(i, { checked: e.target.checked || undefined })} />
                  {lead === 'radio' ? 'Chosen' : 'Ticked'}
                </label>
              )}
              <label title="Picked out: tinted and lifted off the menu, its label semibold">
                <input type="checkbox" checked={!!it.selected} onChange={(e) => set(i, { selected: e.target.checked || undefined })} />
                Highlighted
              </label>
              <span className="menu-item-move">
                <button type="button" className="mini" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  ↑
                </button>
                <button type="button" className="mini" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Move down">
                  ↓
                </button>
                <button type="button" className="mini" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove this item">
                  ×
                </button>
              </span>
            </span>
          </span>
        );
      })}
      <span className="series-actions">
        <span className="series-count">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
        <button type="button" className="mini" onClick={add} title="Add an item">
          + Item
        </button>
      </span>
    </span>
  );
}
