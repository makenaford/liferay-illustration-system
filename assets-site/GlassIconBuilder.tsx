import { useMemo, useState } from 'react';
import { CENTRED, FRAME, LAYOUTS, makeGlassIcon, type GlyphBounds, type Layer, type LayoutName } from '../src/glassIconMaker.ts';
import { isShape, type GlassRecipe, type RecipeLayer } from '../src/glassRecipe.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';
import { glyphOf, type IconStyle } from '../src/icons.ts';
import { IconPicker } from '../editor/IconPicker.tsx';
import { foldersOf, iconParts, UNFILED, viewerId, type IconRow, type IconSetRow, type Store } from './store.ts';
import { iconSrc, slug, svgSrc } from './uploads.ts';

/**
 * GLASS ICON BUILDER — two MingCute icons, made into a glass icon in the
 * set's own style, dark and light (see src/glassIconMaker.ts).
 *
 * Every icon it makes keeps its recipe (src/glassRecipe.ts), so it can be
 * opened here again — `editing` — and saved back in place. A layer can also
 * be an existing icon's own shape, as the rebuild of the set takes them
 * apart (src/glassRebuild.ts); picking an icon replaces it.
 */

/** One MingCute or custom icon's path in a style, falling back to whichever it has. */
function pathOf(key: string, style: IconStyle): string {
  const m = glyphOf(key);
  return m ? ((style === 'fill' ? m.fill : m.line) ?? m.line ?? m.fill ?? '') : '';
}

/** `mc:shopping_cart_1` -> "Shopping cart 1". */
const nameOf = (key: string) => {
  const s = key.replace(/^(mc|custom):/, '').replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Where a glyph's ink lies on its 24px grid, measured by the browser, so the
 * glass icon's viewBox holds exactly what it draws (viewBoxOf). Undefined
 * when there is nothing to measure; the maker then assumes the whole grid.
 */
const boundsCache = new Map<string, GlyphBounds>();
function glyphBounds(d: string): GlyphBounds | undefined {
  if (!d || typeof document === 'undefined') return undefined;
  const hit = boundsCache.get(d);
  if (hit) return hit;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  document.body.appendChild(svg);
  try {
    const { x, y, width, height } = path.getBBox();
    if (!width || !height) return undefined;
    const b = { x, y, width, height };
    boundsCache.set(d, b);
    return b;
  } finally {
    svg.remove();
  }
}

/** A layer drawn from the original icon's own shape rather than a MingCute icon. */
function ShapeNote() {
  return <p className="am-hint am-shape-note">The original icon’s own shape — pick an icon to replace it.</p>;
}

/** The layout choices: which icon leads beside the other, or the two centred. */
type Family = 'glass' | 'equal' | 'gradient' | 'centred';
type Position = 'right' | 'left' | 'above' | 'behind';
const FAMILIES: Family[] = ['glass', 'equal', 'gradient', 'centred'];
const FAMILY_LABEL: Record<Family, string> = { glass: 'Glass', equal: 'Equal', gradient: 'Gradient', centred: 'Center' };
const POSITION_LABEL: Record<Position, string> = {
  right: 'Back on the right',
  left: 'Back on the left',
  above: 'Back above',
  behind: 'Back behind',
};

/** What each layout is for, as the set uses it. */
const LAYOUT_HINT: Record<LayoutName, string> = {
  glass: 'Glass leads: the glass icon is the subject, the gradient one an accent behind it — the Marketing Icons frame.',
  equal: 'Equal: the two icons carry the same weight — the set’s most common layout.',
  gradient: 'Gradient leads: the gradient icon is the subject, the glass one a smaller accent in front.',
  above: 'Centered, back above: the gradient icon rises from behind the glass one, centred — as in “Out of the box”.',
  behind: 'Centered, back behind: the gradient icon sits square behind the glass one — as in “Analytics”.',
};

/** Glass SVG (Figma-export shape) -> something an <img> shows, glass and all. */
function preview(raw: string, ns: string): string {
  const p = normaliseFigmaSvg(raw, ns);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox.join(' ')}" fill="none">${p.body.replaceAll('__NS__', `${ns}-`)}</svg>`;
}

export function GlassIconBuilder({
  sets,
  writable,
  store: st,
  onToast,
  onClose,
  editing,
}: {
  sets: IconSetRow[];
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
  onClose: (savedTo?: string) => void;
  /** An icon made here, opened again: its recipe fills the builder, and saving replaces it. */
  editing?: { setId: string; icon: IconRow };
}) {
  const recipe = editing?.icon.builder;
  const start = (l: RecipeLayer | undefined, fallback: string) =>
    l && !isShape(l) ? { key: l.icon, style: l.style as IconStyle } : { key: l ? '' : fallback, style: 'fill' as IconStyle };
  const f0 = start(recipe?.front, 'mc:rocket');
  const b0 = start(recipe?.back, 'mc:planet');
  // Two icons: the frosted glass one in front, the gradient one behind it.
  const [icon, setIcon] = useState(f0.key);
  const [style, setStyle] = useState<IconStyle>(f0.style);
  const [backIcon, setBackIcon] = useState(b0.key);
  const [backStyle, setBackStyle] = useState<IconStyle>(b0.style);
  // An existing icon's own shapes, until an icon is picked in their place.
  const [frontShape, setFrontShape] = useState(recipe && isShape(recipe.front) ? recipe.front : null);
  const [backShape, setBackShape] = useState(recipe && isShape(recipe.back) ? recipe.back : null);
  // Which icon leads, and where the back sits — beside it, or centred.
  const [family, setFamily] = useState<Family>(() =>
    recipe ? (CENTRED.includes(recipe.layout) ? 'centred' : (recipe.layout as Family)) : 'glass',
  );
  const [position, setPosition] = useState<Position>(() =>
    !recipe
      ? 'right'
      : recipe.layout === 'above' || recipe.layout === 'behind'
        ? recipe.layout
        : recipe.mirror
          ? 'left'
          : 'right',
  );
  const centred = family === 'centred';
  const layout: LayoutName = centred ? (position === 'behind' ? 'behind' : 'above') : family;
  const mirror = !centred && position === 'left';
  const [name, setName] = useState(editing ? iconParts(editing.icon).name : '');
  // The folder it goes in; blank is Unfiled.
  const [category, setCategory] = useState(() => {
    const c = editing ? iconParts(editing.icon).category : '';
    return c === UNFILED ? '' : c;
  });
  const glass = sets.find((s) => s.id === 'glass-icons');
  const [setId, setSetId] = useState(editing?.setId ?? glass?.id ?? sets[0]?.id ?? '__new');
  const [busy, setBusy] = useState(false);

  const frontPath = frontShape ? '' : pathOf(icon, style);
  const backPath = backShape ? '' : pathOf(backIcon, backStyle) || frontPath;
  const front: string | Layer = frontShape?.shape ?? frontPath;
  const back: string | Layer = backShape?.shape ?? backPath;
  const spec = useMemo(
    () => ({
      front,
      back,
      frontBounds: frontShape?.bounds ?? glyphBounds(frontPath),
      backBounds: backShape?.bounds ?? glyphBounds(backPath),
      layout,
      mirror,
    }),
    [front, back, frontShape, backShape, frontPath, backPath, layout, mirror],
  );
  const hasFront = !!frontShape || !!frontPath;
  const dark = useMemo(() => (hasFront ? makeGlassIcon(spec, 'dark') : ''), [hasFront, spec]);
  const light = useMemo(() => (hasFront ? makeGlassIcon(spec, 'light') : ''), [hasFront, spec]);
  /** What this icon is made of, kept with it so it can be edited here again. */
  const recipeNow = (): GlassRecipe => ({
    v: 1,
    front: frontShape ?? { icon, style },
    back: backShape ?? (pathOf(backIcon, backStyle) ? { icon: backIcon, style: backStyle } : { icon, style }),
    layout,
    ...(mirror ? { mirror: true } : {}),
  });
  const darkImg = useMemo(() => (dark ? svgSrc(preview(dark, 'gbd')) : ''), [dark]);
  const lightImg = useMemo(() => (light ? svgSrc(preview(light, 'gbl')) : ''), [light]);

  const target = sets.find((s) => s.id === setId);
  const categories = target ? foldersOf(target) : [];
  const finalName = name.trim() || (icon ? nameOf(icon) : 'Glass icon');
  const finalCategory = category.trim();
  // Real icons of the same folder, or any, to judge size against.
  const neighbours = (target?.icons ?? [])
    .filter((i) => i.svgLight && (!category.trim() || iconParts(i).category === finalCategory))
    .slice(0, 3);

  const save = async () => {
    if (!st || !hasFront) return;
    setBusy(true);
    try {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      let sid = setId;
      if (sid === '__new') {
        sid = 'glass-icons';
        await st.putSet({ id: sid, name: 'Glass icons', createdAt: now, createdBy: by });
      }
      // An edited icon keeps its id, whatever it is renamed to.
      const id = editing && sid === editing.setId ? editing.icon.id : slug(`${finalCategory} ${finalName}`);
      const replacing = (sets.find((s) => s.id === sid)?.icons ?? []).some((i) => i.id === id);
      await st.putIcon(sid, {
        id,
        name: finalName,
        ...(finalCategory ? { category: finalCategory } : {}),
        svg: dark,
        svgLight: light,
        uploadedAt: now,
        uploadedBy: by,
        builder: recipeNow(),
      });
      onToast(
        `${replacing ? 'Replaced' : 'Added'} ${finalName} in ${finalCategory || 'Unfiled'} — the builder offers it under Glass icon.`,
      );
      onClose(sid);
    } catch (e) {
      onToast(`Could not save the icon — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const download = async (theme: 'dark' | 'light') => {
    const { saveFile } = await import('../editor/save.ts');
    const file = `${finalCategory ? `${finalCategory} - ` : ''}${finalName} - ${theme === 'dark' ? 'Dark' : 'Light'}.svg`;
    const out = await saveFile(file, theme === 'dark' ? dark : light, 'image/svg+xml');
    if (out.status === 'saved') onToast(`Saved ${file}.`);
    else if (out.status === 'error') onToast(`Could not save ${file} — ${out.message}`);
  };

  return (
    <div className="am-gib">
      <div className="am-gib-head">
        <button type="button" className="am-back" onClick={() => onClose()}>
          ‹ Library
        </button>
        <div>
          <h2>{editing ? `Editing ${iconParts(editing.icon).name}` : 'Glass Icon Builder'}</h2>
          <p className="am-meta">
            {editing
              ? 'Change its icons or layout; saving replaces it in the library, for everyone.'
              : 'Two MingCute icons, made into one glass icon in the set’s own style — dark and light.'}
          </p>
        </div>
      </div>

      <div className="am-gib-body">
        <form
          className="am-gib-controls"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="am-gib-layer">
            <legend>Front · frosted glass · {Math.round(LAYOUTS[layout].front.size)}px</legend>
            {frontShape && <ShapeNote />}
            <IconPicker
              value={frontShape ? undefined : icon}
              style={style}
              onChange={(v) => {
                if (!v) return;
                setIcon(v);
                setFrontShape(null);
              }}
            />
            <StyleSwitch label="Front icon style" value={style} onChange={setStyle} />
          </fieldset>
          <fieldset className="am-gib-layer">
            <legend>Back · gradient · {Math.round(LAYOUTS[layout].back.size)}px</legend>
            {backShape && <ShapeNote />}
            <IconPicker
              value={backShape ? undefined : backIcon}
              style={backStyle}
              onChange={(v) => {
                if (!v) return;
                setBackIcon(v);
                setBackShape(null);
              }}
            />
            <StyleSwitch label="Back icon style" value={backStyle} onChange={setBackStyle} />
          </fieldset>
          <fieldset className="am-gib-layer">
            <legend>Layout · which icon leads</legend>
            <div className="am-seg am-seg-fill" role="group" aria-label="Layout">
              {FAMILIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={family === f ? 'am-on' : ''}
                  aria-pressed={family === f}
                  onClick={() => {
                    setFamily(f);
                    // Beside or centred: each has its own positions.
                    if ((f === 'centred') !== centred) setPosition(f === 'centred' ? 'above' : 'right');
                  }}
                >
                  {FAMILY_LABEL[f]}
                </button>
              ))}
            </div>
            <div className="am-seg am-seg-fill" role="group" aria-label="Where the back sits">
              {(centred ? (['above', 'behind'] as const) : (['right', 'left'] as const)).map((p) => (
                <button key={p} type="button" className={position === p ? 'am-on' : ''} aria-pressed={position === p} onClick={() => setPosition(p)}>
                  {POSITION_LABEL[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="am-hint">
            {LAYOUT_HINT[layout]} In the {FRAME}px frame the glass icon is {Math.round(LAYOUTS[layout].front.size)}px and
            the one behind it {Math.round(LAYOUTS[layout].back.size)}px.
          </p>
          <label className="am-field" htmlFor="gib-name">
            <span>Name</span>
            <input id="gib-name" value={name} placeholder={nameOf(icon)} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="am-field" htmlFor="gib-category">
            <span>Folder</span>
            <input
              id="gib-category"
              list="gib-categories"
              value={category}
              placeholder="Unfiled — or a folder, new or existing"
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="gib-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="am-field" htmlFor="gib-set">
            <span>Add to</span>
            <select id="gib-set" value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {!glass && <option value="__new">New set: Glass icons</option>}
            </select>
          </label>
          <div className="am-actions">
            <button type="button" onClick={() => void download('dark')} disabled={!hasFront}>
              Dark SVG
            </button>
            <button type="button" onClick={() => void download('light')} disabled={!hasFront}>
              Light SVG
            </button>
            {writable && (
              <button type="submit" className="am-primary" disabled={!hasFront || busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to library'}
              </button>
            )}
          </div>
        </form>

        <div className="am-gib-previews">
          {(['dark', 'light'] as const).map((t) => (
            <div key={t} className={`am-gib-stage ${t}`}>
              <span className="am-gib-theme">{t === 'dark' ? 'Dark' : 'Light'}</span>
              <div className="am-gib-sizes">
                {[128, 64, 32].map((px) => (
                  <img key={px} src={t === 'dark' ? darkImg : lightImg} width={px} height={px} alt="" />
                ))}
              </div>
              {neighbours.length > 0 && (
                <div className="am-gib-row" aria-label="Beside icons already in the set">
                  {neighbours.map((n) => (
                    <img key={n.id} src={iconSrc(t === 'dark' ? n.svg : n.svgLight!)} width={64} height={64} alt="" title={n.name} />
                  ))}
                  <img src={t === 'dark' ? darkImg : lightImg} width={64} height={64} alt="" className="am-gib-new" />
                </div>
              )}
            </div>
          ))}
          {neighbours.length > 0 && (
            <p className="am-hint">
              The bottom row sets the new icon beside {category.trim() ? `${finalCategory} icons` : 'icons'} already in
              the set, at the same 64px, so its size can be checked by eye.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StyleSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: IconStyle;
  onChange: (s: IconStyle) => void;
}) {
  return (
    <div className="am-seg" role="group" aria-label={label}>
      {(['fill', 'line'] as const).map((st) => (
        <button key={st} type="button" className={value === st ? 'am-on' : ''} onClick={() => onChange(st)}>
          {st === 'fill' ? 'Filled' : 'Outline'}
        </button>
      ))}
    </div>
  );
}
