/**
 * The glass rebuild review page: every glass icon in the set beside the
 * builder's rebuild of it, dark and light, flagged where the rebuild can't
 * take the icon apart cleanly or changes its layout. Built into one page by
 * scripts/build-glass-review.ts, with the icons embedded.
 */
import { normaliseFigmaSvg } from '../../src/figmaGlass.ts';
import { LAYOUTS, makeGlassIcon } from '../../src/glassIconMaker.ts';
import { LIMITS, rebuild, type Flag, type Rebuilt } from '../../src/glassRebuild.ts';

interface Source {
  name: string;
  dark: string;
  light?: string;
}

interface Row extends Source {
  category: string;
  title: string;
  r: Rebuilt;
  /** How much the layout changed, for sorting: offset in px, plus the size ratio's change weighted to match. */
  change: number;
}

const FLAG_ORDER: Flag[] = [
  'no glass shape',
  'no gradient shape',
  'back sized differently',
  'back placed differently',
  'several glass shapes',
  'several gradient shapes',
  'stroked shapes',
  'masked shapes',
  'not a path',
];
/** Flags that mean the icon can't be rebuilt as it stands, versus ones that say how it changed. */
const BLOCKING: Flag[] = ['no glass shape', 'no gradient shape'];

/** An SVG as an <img> shows it, glass and all — as the site draws every icon. */
function src(svg: string, ns: string): string {
  const p = normaliseFigmaSvg(svg, ns);
  const body = p.body.replaceAll('__NS__', `${ns}-`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox.join(' ')}" fill="none">${body}</svg>`,
  )}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const sources = JSON.parse(document.getElementById('icons')!.textContent!) as Source[];
const rows: Row[] = sources.map((s) => {
  const i = s.name.indexOf(' - ');
  const r = rebuild(s.dark);
  const l = r.change;
  return {
    ...s,
    category: i > 0 ? s.name.slice(0, i) : 'Uncategorized',
    title: i > 0 ? s.name.slice(i + 3) : s.name,
    r,
    change: r.spec ? (l ? l.offset + 40 * Math.abs(l.sizeRatio.was - l.sizeRatio.now) : 0) : Infinity,
  };
});

/* ---- summary and filters ------------------------------------------------ */

const count = (f: Flag) => rows.filter((r) => r.r.flags.includes(f)).length;
const clean = rows.filter((r) => !r.r.flags.length).length;
const ready = rows.filter((r) => r.r.spec).length;

document.getElementById('total')!.textContent = String(rows.length);
document.getElementById('ready')!.textContent = String(ready);
document.getElementById('clean')!.textContent = String(clean);
document.getElementById('blocked')!.textContent = String(rows.length - ready);

type Filter = 'all' | 'clean' | Flag | `layout:${keyof typeof LAYOUTS}`;
let filter: Filter = 'all';
let sort: 'change' | 'name' = 'change';

const chips = document.getElementById('chips')!;
const chipFor = (f: Filter, label: string, n: number, kind = '') => {
  const b = el('button', `chip${kind ? ` ${kind}` : ''}`);
  b.type = 'button';
  b.dataset.filter = f;
  b.setAttribute('aria-pressed', String(f === filter));
  b.append(el('span', '', label), el('span', 'n', String(n)));
  b.addEventListener('click', () => {
    filter = f;
    for (const c of chips.querySelectorAll('button')) c.setAttribute('aria-pressed', String(c.dataset.filter === f));
    draw();
  });
  chips.append(b);
};
chipFor('all', 'All', rows.length);
chipFor('clean', 'Clean', clean, 'good');
for (const f of FLAG_ORDER) {
  const n = count(f);
  if (n) chipFor(f, f.replace(/^./, (c) => c.toUpperCase()), n, BLOCKING.includes(f) ? 'bad' : 'warn');
}
for (const [name, l] of Object.entries(LAYOUTS) as [keyof typeof LAYOUTS, (typeof LAYOUTS)[keyof typeof LAYOUTS]][]) {
  const n = rows.filter((r) => r.r.layout?.name === name).length;
  if (n) chipFor(`layout:${name}`, l.label, n, 'layout');
}

const sortEl = document.getElementById('sort') as HTMLSelectElement;
sortEl.addEventListener('change', () => {
  sort = sortEl.value as typeof sort;
  draw();
});

/* ---- rows --------------------------------------------------------------- */

const list = document.getElementById('list')!;
const shown = document.getElementById('shown')!;
/** Each row's element, built once: the rebuild and its images are the slow part. */
const built = new Map<Row, HTMLElement>();

const fmt = (n: number, d = 2) => n.toFixed(d).replace(/\.?0+$/, '') || '0';

function tile(label: string, url: string | null, theme: 'dark' | 'light', note?: string) {
  const f = el('figure', `tile ${theme}`);
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 96;
    img.height = 96;
    f.append(img);
  } else {
    f.append(el('span', 'none', note ?? 'Not rebuilt'));
  }
  f.append(el('figcaption', '', label));
  return f;
}

function rowEl(row: Row, n: number): HTMLElement {
  const hit = built.get(row);
  if (hit) return hit;
  const li = el('li', 'row');
  const head = el('div', 'row-head');
  const name = el('h2', '', row.title);
  head.append(el('span', 'cat', row.category), name);
  const pills = el('ul', 'pills');
  if (!row.r.flags.length) pills.append(el('li', 'pill good', 'Clean'));
  for (const f of FLAG_ORDER) {
    if (row.r.flags.includes(f)) pills.append(el('li', `pill ${BLOCKING.includes(f) ? 'bad' : 'warn'}`, f));
  }
  head.append(pills);

  const tiles = el('div', 'tiles');
  const spec = row.r.spec;
  const why = row.r.flags.find((f) => BLOCKING.includes(f));
  tiles.append(
    tile('Original', src(row.dark, `o${n}d`), 'dark'),
    tile('Rebuilt', spec ? src(makeGlassIcon(spec, 'dark'), `r${n}d`) : null, 'dark', why),
    tile('Original', src(row.light ?? row.dark, `o${n}l`), 'light'),
    tile('Rebuilt', spec ? src(makeGlassIcon(spec, 'light'), `r${n}l`) : null, 'light', why),
  );

  const facts = el('dl', 'facts');
  const fact = (k: string, v: string, off = false) => {
    const d = el('div', off ? 'off' : '');
    d.append(el('dt', '', k), el('dd', '', v));
    facts.append(d);
  };
  const l = row.r.change;
  if (row.r.layout) {
    fact('Layout', `${LAYOUTS[row.r.layout.name].label}${row.r.layout.mirror ? ', back on the left' : ''}`);
  }
  if (l) {
    fact(
      'Back ÷ front size',
      `${fmt(l.sizeRatio.was)} → ${fmt(l.sizeRatio.now)}`,
      Math.abs(l.sizeRatio.was - l.sizeRatio.now) > LIMITS.sizeRatio,
    );
    fact('Back moved', `${fmt(l.offset, 1)} px`, l.offset > LIMITS.offset);
  }
  fact('Shapes', `${row.r.counts.front} glass · ${row.r.counts.back} gradient`);
  li.append(head, tiles, facts);
  built.set(row, li);
  return li;
}

function draw() {
  const pick = rows.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'clean'
        ? !r.r.flags.length
        : filter.startsWith('layout:')
          ? r.r.layout?.name === filter.slice(7)
          : r.r.flags.includes(filter as Flag),
  );
  pick.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.change - a.change || a.name.localeCompare(b.name)));
  list.replaceChildren(...pick.map((r) => rowEl(r, rows.indexOf(r))));
  shown.textContent = `${pick.length} shown`;
}

draw();
