import { useEffect, useRef, useState } from 'react';
import { themes } from '../src/tokens.ts';
import { COLORS, GRADIENTS, SEMANTIC, gradientCss, paintOf } from '../src/colors.ts';
import { useEditor } from './state.ts';

/**
 * TOKEN PICKER — a colour control that shows the colour.
 *
 * A dropdown of names like `base-primary-light` is unusable: you cannot
 * pick a colour you cannot see. Every entry carries a swatch resolved in the
 * CURRENT theme, so what you see is what the illustration will show.
 *
 * Three kinds of entry, in the order a designer reaches for them: semantic
 * tones (what a document should normally say), gradients, and the
 * illustration colour set by its Figma group. There is still no hex input
 * anywhere — the choice is the design system's, never an off-system colour.
 */

/** A swatch's CSS background for a tone in a theme, or undefined for none. */
function swatchOf(tone: string, theme: 'light' | 'dark'): string | undefined {
  const p = paintOf(themes[theme], tone);
  if (!p) return undefined;
  return 'color' in p ? p.color : gradientCss(p.gradient);
}

/** A readable value for the row's right-hand column. */
function valueOf(tone: string, theme: 'light' | 'dark'): string {
  const p = paintOf(themes[theme], tone);
  if (!p) return '';
  return 'color' in p ? p.color : `${p.gradient.stops.length} stops`;
}

const GROUP_ORDER = ['Base Colors', 'Text', 'Other'];
const GROUPS = GROUP_ORDER.map((g) => ({
  group: g,
  items: COLORS.filter((c) => c.group === g),
})).filter((g) => g.items.length);
const LABEL: Record<string, string> = {
  ...Object.fromEntries(COLORS.map((c) => [c.key, c.label])),
  ...Object.fromEntries(GRADIENTS.map((g) => [g.key, g.label])),
};
const OFFERED = new Set<string>([...SEMANTIC, ...GRADIENTS.map((g) => g.key), ...COLORS.map((c) => c.key)]);

export function TokenPicker({
  value,
  onChange,
  allowNone = true,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowNone?: boolean;
}) {
  const theme = useEditor((s) => s.theme);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const match = (k: string) =>
    !needle || k.toLowerCase().includes(needle) || (LABEL[k] ?? '').toLowerCase().includes(needle);
  const pick = (k: string | undefined) => {
    onChange(k);
    setOpen(false);
  };
  const row = (k: string) => (
    <Row key={k} name={k} label={LABEL[k]} theme={theme} active={value === k} onPick={() => pick(k)} />
  );

  const current = value ? swatchOf(value, theme) : undefined;
  // A colour from before the illustration set: still drawn, still shown, but
  // no longer on offer — pick a set colour to replace it.
  const legacy = value && !OFFERED.has(value) && current ? value : null;

  return (
    <div className="tokenpick" ref={ref}>
      <button
        type="button"
        className="tokenpick-trigger"
        onClick={() => {
          setOpen((o) => !o);
          setQ('');
        }}
        title={value ?? 'default'}
      >
        <Swatch color={current} />
        <span className="tokenpick-name">{value ? LABEL[value] ?? value : 'default'}</span>
        <span className="tokenpick-caret">▾</span>
      </button>

      {open && (
        <div className="tokenpick-pop">
          <input
            autoFocus
            className="tokenpick-search"
            placeholder="Search tokens…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="tokenpick-list">
            {allowNone && !needle && (
              <button
                type="button"
                className="tokenpick-row"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                <Swatch />
                <span>default</span>
              </button>
            )}

            {legacy && !needle && (
              <>
                <div className="tokenpick-group">in use · older palette</div>
                {row(legacy)}
              </>
            )}

            {SEMANTIC.filter(match).length > 0 && <div className="tokenpick-group">semantic</div>}
            {SEMANTIC.filter(match).map(row)}

            {GRADIENTS.some((g) => match(g.key)) && <div className="tokenpick-group">gradients</div>}
            {GRADIENTS.filter((g) => match(g.key)).map((g) => row(g.key))}

            {GROUPS.map(({ group, items }) => {
              const hits = items.filter((c) => match(c.key));
              if (!hits.length) return null;
              return (
                <div key={group}>
                  <div className="tokenpick-group">{group.toLowerCase()}</div>
                  {hits.map((c) => row(c.key))}
                </div>
              );
            })}
          </div>
          <div className="tokenpick-foot">Swatches show the {theme} theme</div>
        </div>
      )}
    </div>
  );
}

function Row({
  name,
  label,
  theme,
  active,
  onPick,
}: {
  name: string;
  label?: string;
  theme: 'light' | 'dark';
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" className={`tokenpick-row${active ? ' on' : ''}`} onClick={onPick} title={name}>
      <Swatch color={swatchOf(name, theme)} />
      <span className="tokenpick-rowname">{label ?? name}</span>
      <code className="tokenpick-hex">{valueOf(name, theme)}</code>
    </button>
  );
}

/**
 * A swatch on a two-tone checker, so a translucent token reads as translucent
 * rather than as whatever the panel behind it happens to be.
 */
function Swatch({ color }: { color?: string }) {
  return (
    <span className="swatch" aria-hidden>
      {color ? <span className="swatch-fill" style={{ background: color }} /> : <span className="swatch-none" />}
    </span>
  );
}
