import { useMemo, useState } from 'react';
import { MINGCUTE } from '../src/mingcute.generated.ts';
import { FRAME, LAYOUTS, makeGlassIcon, type GlyphBounds, type LayoutName } from '../src/glassIconMaker.ts';
import { normaliseFigmaSvg } from '../src/figmaGlass.ts';
import { MINGCUTE_PREFIX, type IconStyle } from '../src/icons.ts';
import { IconPicker } from '../editor/IconPicker.tsx';
import { iconParts, viewerId, type IconSetRow, type Store } from './store.ts';
import { iconSrc, slug, svgSrc } from './uploads.ts';

/**
 * GLASS ICON BUILDER — a MingCute icon, made into a glass icon in the set's
 * own style, dark and light, on its 64px grid (see src/glassIconMaker.ts).
 *
 * Every icon it makes is the same size, because the glyph always fills the
 * same front square; the preview sets it beside icons already in the set, so
 * that can be seen rather than trusted.
 */

/** One MingCute icon's path in a style, falling back to whichever it has. */
function pathOf(key: string, style: IconStyle): string {
  const m = MINGCUTE[key.replace(MINGCUTE_PREFIX, '')];
  return m ? ((style === 'fill' ? m.fill : m.line) ?? m.line ?? m.fill ?? '') : '';
}

/** `mc:shopping_cart_1` -> "Shopping cart 1". */
const nameOf = (key: string) => {
  const s = key.replace(MINGCUTE_PREFIX, '').replace(/[_-]+/g, ' ');
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
}: {
  sets: IconSetRow[];
  writable: boolean;
  store: Store | null;
  onToast: (s: string) => void;
  onClose: (savedTo?: string) => void;
}) {
  // Two icons: the frosted glass one in front, the gradient one behind it.
  const [icon, setIcon] = useState('mc:rocket');
  const [style, setStyle] = useState<IconStyle>('fill');
  const [backIcon, setBackIcon] = useState('mc:planet');
  const [backStyle, setBackStyle] = useState<IconStyle>('fill');
  // Which icon leads, and where the back sits — beside it, or centred.
  const [family, setFamily] = useState<Family>('glass');
  const [position, setPosition] = useState<Position>('right');
  const centred = family === 'centred';
  const layout: LayoutName = centred ? (position === 'behind' ? 'behind' : 'above') : family;
  const mirror = !centred && position === 'left';
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const glass = sets.find((s) => s.id === 'glass-icons');
  const [setId, setSetId] = useState(glass?.id ?? sets[0]?.id ?? '__new');
  const [busy, setBusy] = useState(false);

  const front = pathOf(icon, style);
  const back = pathOf(backIcon, backStyle) || front;
  const spec = useMemo(
    () => ({ front, back, frontBounds: glyphBounds(front), backBounds: glyphBounds(back), layout, mirror }),
    [front, back, layout, mirror],
  );
  const dark = useMemo(() => (front ? makeGlassIcon(spec, 'dark') : ''), [front, spec]);
  const light = useMemo(() => (front ? makeGlassIcon(spec, 'light') : ''), [front, spec]);
  const darkImg = useMemo(() => (dark ? svgSrc(preview(dark, 'gbd')) : ''), [dark]);
  const lightImg = useMemo(() => (light ? svgSrc(preview(light, 'gbl')) : ''), [light]);

  const target = sets.find((s) => s.id === setId);
  const categories = [...new Set((target?.icons ?? []).map((i) => iconParts(i).category))].sort();
  const finalName = name.trim() || nameOf(icon);
  const finalCategory = category.trim() || 'General';
  // Real icons of the same category, or any, to judge size against.
  const neighbours = (target?.icons ?? [])
    .filter((i) => i.svgLight && (!category.trim() || iconParts(i).category === finalCategory))
    .slice(0, 3);

  const save = async () => {
    if (!st || !front) return;
    setBusy(true);
    try {
      const by = (await viewerId()) ?? undefined;
      const now = Date.now();
      let sid = setId;
      if (sid === '__new') {
        sid = 'glass-icons';
        await st.putSet({ id: sid, name: 'Glass icons', createdAt: now, createdBy: by });
      }
      const id = slug(`${finalCategory} ${finalName}`);
      const replacing = (sets.find((s) => s.id === sid)?.icons ?? []).some((i) => i.id === id);
      await st.putIcon(sid, {
        id,
        name: finalName,
        category: finalCategory,
        svg: dark,
        svgLight: light,
        uploadedAt: now,
        uploadedBy: by,
      });
      onToast(
        `${replacing ? 'Replaced' : 'Added'} ${finalName} in ${finalCategory} — the builder offers it under Glass icon.`,
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
    const file = `${finalCategory} - ${finalName} - ${theme === 'dark' ? 'Dark' : 'Light'}.svg`;
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
          <h2>Glass Icon Builder</h2>
          <p className="am-meta">Two MingCute icons, made into one glass icon in the set’s own style — dark and light.</p>
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
            <IconPicker value={icon} style={style} onChange={(v) => v && setIcon(v)} />
            <StyleSwitch label="Front icon style" value={style} onChange={setStyle} />
          </fieldset>
          <fieldset className="am-gib-layer">
            <legend>Back · gradient · {Math.round(LAYOUTS[layout].back.size)}px</legend>
            <IconPicker value={backIcon} style={backStyle} onChange={(v) => v && setBackIcon(v)} />
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
            <span>Category</span>
            <input
              id="gib-category"
              list="gib-categories"
              value={category}
              placeholder="General"
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
            <button type="button" onClick={() => void download('dark')} disabled={!front}>
              Dark SVG
            </button>
            <button type="button" onClick={() => void download('light')} disabled={!front}>
              Light SVG
            </button>
            {writable && (
              <button type="submit" className="am-primary" disabled={!front || busy}>
                {busy ? 'Adding…' : 'Add to library'}
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
