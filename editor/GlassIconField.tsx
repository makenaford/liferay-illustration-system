import { useEffect, useState } from 'react';
import type { Element } from '../src/document.ts';
import { SPOT_GROUPS, SPOT_KEYS, SPOT_LABELS } from './schema.ts';
import { libraryGlassIcons, type LibraryGlassIcon } from './glassLibrary.ts';

/**
 * The glass icon picker: the shipped set by category, then the team's own
 * from the Marketing Assets library, by category too, where the builder can
 * reach that library. A shipped icon is referenced by key; a library one is
 * copied into the illustration.
 */
export function GlassIconField({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const g = el as Extract<Element, { type: 'spotIcon' }>;
  const [library, setLibrary] = useState<LibraryGlassIcon[]>([]);
  useEffect(() => {
    void libraryGlassIcons(true).then(setLibrary);
  }, []);

  const value = g.art ? `lib:${g.art.id}` : `builtin:${g.name}`;
  const orphan = g.art && !library.some((l) => l.id === g.art!.id);

  const shippedGroups = new Map<string, string[]>();
  for (const k of SPOT_KEYS) shippedGroups.set(SPOT_GROUPS[k], [...(shippedGroups.get(SPOT_GROUPS[k]) ?? []), k]);
  const libGroups = new Map<string, LibraryGlassIcon[]>();
  for (const l of library) libGroups.set(l.category, [...(libGroups.get(l.category) ?? []), l]);

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v.startsWith('builtin:')) onPatch({ name: v.slice(8), art: undefined });
        else if (v.startsWith('lib:')) {
          const pick = library.find((l) => l.id === v.slice(4));
          if (pick) onPatch({ art: { ...pick } });
        }
      }}
    >
      {[...shippedGroups.entries()].map(([cat, keys]) => (
        <optgroup key={cat} label={cat}>
          {keys.map((k) => (
            <option key={k} value={`builtin:${k}`}>
              {SPOT_LABELS[k]}
            </option>
          ))}
        </optgroup>
      ))}
      {orphan && (
        <optgroup label="In this illustration">
          <option value={value}>{g.art!.label}</option>
        </optgroup>
      )}
      {[...libGroups.entries()].map(([cat, items]) => (
        <optgroup key={`lib-${cat}`} label={`${cat} · Marketing Assets`}>
          {items.map((l) => (
            <option key={l.id} value={`lib:${l.id}`}>
              {l.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
