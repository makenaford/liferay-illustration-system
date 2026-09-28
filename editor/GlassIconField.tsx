import { useEffect, useState } from 'react';
import type { Element } from '../src/document.ts';
import { SPOT_GROUPS, SPOT_KEYS, SPOT_LABELS } from './schema.ts';
import { libraryGlassIcons, type LibraryGlass, type LibraryGlassIcon } from './glassLibrary.ts';

/**
 * The glass icon picker. Inside the Marketing Assets site it offers exactly
 * the library's Glass icons set, by its folders — an icon removed there is no
 * longer offered. An icon the builder also ships is referenced by key; one
 * only the library has is copied into the illustration. On its own, with no
 * library, the builder offers the set it ships. Whatever the illustration
 * already uses stays selectable, removed or not.
 */
export function GlassIconField({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const g = el as Extract<Element, { type: 'spotIcon' }>;
  // undefined while loading, null when there is no library.
  const [library, setLibrary] = useState<LibraryGlass | undefined>(undefined);
  useEffect(() => {
    void libraryGlassIcons(true).then(setLibrary);
  }, []);

  const value = g.art ? `lib:${g.art.id}` : `builtin:${g.name}`;
  const valueOf = (l: LibraryGlassIcon) => (l.builtin ? `builtin:${l.builtin}` : `lib:${l.id}`);

  // What to offer, by folder: the library's set, or with none the shipped one.
  const groups = new Map<string, { value: string; label: string }[]>();
  const add = (cat: string, o: { value: string; label: string }) => groups.set(cat, [...(groups.get(cat) ?? []), o]);
  if (library) for (const l of library) add(l.category, { value: valueOf(l), label: l.label });
  else if (library === null) for (const k of SPOT_KEYS) add(SPOT_GROUPS[k], { value: `builtin:${k}`, label: SPOT_LABELS[k] });
  const offered = [...groups.values()].some((os) => os.some((o) => o.value === value));
  const current = g.art ? g.art.label : (SPOT_LABELS[g.name] ?? g.name);

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v.startsWith('builtin:')) onPatch({ name: v.slice(8), art: undefined });
        else if (v.startsWith('lib:')) {
          const pick = library?.find((l) => l.id === v.slice(4));
          if (pick) onPatch({ art: { id: pick.id, label: pick.label, category: pick.category, dark: pick.dark, light: pick.light } });
        }
      }}
    >
      {!offered && (
        <optgroup label="In this illustration">
          <option value={value}>{library === undefined ? `${current} (loading…)` : current}</option>
        </optgroup>
      )}
      {[...groups.entries()].map(([cat, options]) => (
        <optgroup key={cat} label={cat}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
