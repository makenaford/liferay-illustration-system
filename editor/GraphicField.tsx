import { useEffect, useState } from 'react';
import type { Element } from '../src/document.ts';
import { GRAPHICS } from '../src/graphics.generated.ts';
import { libraryGraphics, type LibraryGraphic } from './graphicsLibrary.ts';

/**
 * The graphic picker: the built-in graphics, then the team's library ones
 * where the builder can reach that library. A built-in is referenced by key;
 * a library graphic is copied into the illustration, so it keeps drawing
 * even where the library cannot be reached.
 */
export function GraphicField({
  el,
  onPatch,
}: {
  el: Element;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const g = el as Extract<Element, { type: 'graphic' }>;
  const [library, setLibrary] = useState<LibraryGraphic[]>([]);
  useEffect(() => {
    void libraryGraphics(true).then(setLibrary);
  }, []);

  const value = g.art ? `lib:${g.art.id}` : g.name ? `builtin:${g.name}` : '';
  const known = g.art && !library.some((l) => l.id === g.art!.id);

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v.startsWith('builtin:')) {
          onPatch({ name: v.slice(8), art: undefined });
        } else if (v.startsWith('lib:')) {
          const pick = library.find((l) => l.id === v.slice(4));
          if (pick) onPatch({ name: undefined, art: { id: pick.id, label: pick.label, dark: pick.dark, light: pick.light } });
        }
      }}
    >
      {!value && <option value="">Choose a graphic</option>}
      <optgroup label="Built in">
        {Object.entries(GRAPHICS).map(([key, gr]) => (
          <option key={key} value={`builtin:${key}`}>
            {gr.label}
          </option>
        ))}
      </optgroup>
      {(library.length > 0 || known) && (
        <optgroup label="Marketing Assets library">
          {known && <option value={value}>{g.art!.label} (in this illustration)</option>}
          {library.map((l) => (
            <option key={l.id} value={`lib:${l.id}`}>
              {l.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
