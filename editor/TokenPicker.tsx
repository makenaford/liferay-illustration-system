import { useEffect, useMemo, useRef, useState } from 'react';
import { paletteDark, paletteLight } from '../src/palette.generated.ts';
import { themes } from '../src/tokens.ts';
import { useEditor } from './state.ts';

/**
 * TOKEN PICKER — a colour control that shows the colour.
 *
 * A dropdown of names like `brand-primary-darken-3` is unusable: you cannot
 * pick a colour you cannot see. Every entry carries a swatch resolved in the
 * CURRENT theme, so what you see is what the illustration will show, and the
 * semantic tones sit above the raw palette because those are what a document
 * should normally say.
 *
 * There is still no hex input anywhere. This widens the choice to the whole
 * design-system palette; it does not open the door to off-system colour.
 */

/** Semantic tones, in the order a designer reaches for them. */
const SEMANTIC = [
  'primary',
  'muted',
  'subtle',
  'onAccent',
  'accent',
  'accentSoft',
  'product',
  'success',
  'info',
] as const;

function resolve(tone: string, theme: 'light' | 'dark'): string | undefined {
  const tk = themes[theme];
  const semantic: Record<string, string> = {
    primary: tk.text.primary,
    muted: tk.text.muted,
    subtle: tk.text.subtle,
    onAccent: tk.text.onAccent,
    accent: tk.accent.base,
    accentSoft: tk.accent.soft,
    product: tk.accent.product,
    success: tk.status.success,
    info: tk.status.info,
  };
  if (semantic[tone]) return semantic[tone];
  const table = theme === 'light' ? paletteLight : paletteDark;
  return (table as Record<string, string>)[tone];
}

/** Group the raw palette by its first path segment: brand, neutral, accent… */
function groupPalette(theme: 'light' | 'dark') {
  const table = theme === 'light' ? paletteLight : paletteDark;
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(table)) {
    const head = key.split('-')[0];
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head)!.push(key);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

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

  const groups = useMemo(() => groupPalette(theme), [theme]);
  const needle = q.trim().toLowerCase();
  const match = (k: string) => !needle || k.toLowerCase().includes(needle);

  const current = value ? resolve(value, theme) : undefined;

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
        <span className="tokenpick-name">{value ?? 'default'}</span>
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

            {SEMANTIC.filter(match).length > 0 && (
              <div className="tokenpick-group">semantic</div>
            )}
            {SEMANTIC.filter(match).map((k) => (
              <Row key={k} name={k} theme={theme} active={value === k} onPick={() => {
                onChange(k);
                setOpen(false);
              }} />
            ))}

            {groups.map(([head, keys]) => {
              const hits = keys.filter(match);
              if (!hits.length) return null;
              return (
                <div key={head}>
                  <div className="tokenpick-group">{head}</div>
                  {hits.map((k) => (
                    <Row key={k} name={k} theme={theme} active={value === k} onPick={() => {
                      onChange(k);
                      setOpen(false);
                    }} />
                  ))}
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
  theme,
  active,
  onPick,
}: {
  name: string;
  theme: 'light' | 'dark';
  active: boolean;
  onPick: () => void;
}) {
  const color = resolve(name, theme);
  return (
    <button type="button" className={`tokenpick-row${active ? ' on' : ''}`} onClick={onPick}>
      <Swatch color={color} />
      <span className="tokenpick-rowname">{name}</span>
      <code className="tokenpick-hex">{color}</code>
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
