import { useEffect, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import type { Element } from '../src/document.ts';
import { Canvas } from './Canvas.tsx';
import { Inspector } from './Inspector.tsx';
import { Layers } from './Layers.tsx';
import { Palette } from './Palette.tsx';
import { DOCS } from './docs.ts';
import { Library } from './Library.tsx';
import { save as saveToLibrary, backend } from './library.ts';
import { copySelected, cutSelected, duplicateSelected, paste } from './clipboard.ts';
import { copyText, saveFile } from './save.ts';
import { SourceModal } from './SourceModal.tsx';
import { LAYOUT } from '../src/tokens.ts';
import { reorderSibling, reorderToEdge } from './state.ts';
import {
  markSaved,
  canRedo,
  canUndo,
  commit,
  getState,
  initStore,
  redo,
  setUI,
  undo,
  useEditor,
} from './state.ts';
import { deleteSelection, groupSelection, ungroupSelected } from './grouping.ts';
import { svgToPng } from './png.ts';

initStore(DOCS[0]);

type Tab = 'library' | 'layers';

export function App() {
  const doc = useEditor((s) => s.doc);
  const theme = useEditor((s) => s.theme);
  const zoom = useEditor((s) => s.zoom);
  const outlines = useEditor((s) => s.showOutlines);
  const snapStep = useEditor((s) => s.snapStep);
  const showGrid = useEditor((s) => s.showGrid);
  const smartGuides = useEditor((s) => s.smartGuides);
  const lockAspect = useEditor((s) => s.lockAspect);
  const selected = useEditor((s) => s.selected);
  const view = useEditor((s) => s.view);
  const dirty = useEditor((s) => s.dirty);
  const [store_, setStore_] = useState<'shared' | 'local' | 'none' | null>(null);
  const [tab, setTab] = useState<Tab>('layers');
  const [source, setSource] = useState<{ filename: string; text: string } | null>(null);

  // A short-lived line in the status bar. Clipboard actions are otherwise
  // invisible — nothing on screen changes when you press copy — and silence
  // reads as "the shortcut didn't work".
  const [flash, setFlash] = useState<string | null>(null);
  const [pngScale, setPngScale] = useState(2);
  const say = (verb: string, what: string | null) => {
    if (what) setFlash(`${verb} ${what}`);
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    void backend().then((b) => setStore_(b.kind));
  }, []);

  /**
   * Save the document back to the library. This is the whole point of the
   * library view: an illustration you opened, changed and saved is the one
   * everyone sees next.
   */
  const saveDoc = async () => {
    try {
      await saveToLibrary(getState().doc);
      markSaved();
      setFlash(
        store_ === 'shared'
          ? 'Saved to the shared library'
          : 'Saved to this browser',
      );
    } catch (e) {
      setFlash(`Could not save: ${(e as Error).message}`);
    }
  };

  /* Global shortcuts. Nudge lives in Canvas; these are document-level. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches('input, textarea, select');
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveDoc();
        return;
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // ⌘C / ⌘X / ⌘V are handled by the native clipboard events below, which
      // get `clipboardData` without a permission prompt. Duplicate has no
      // native event, so it lives here.
      if (mod && !typing && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        say('Duplicated', duplicateSelected());
        return;
      }

      // ⌘G groups, ⇧⌘G ungroups — Figma's keys. Checked before the bare `g`
      // grid toggle below, which only fires without a modifier.
      if (mod && !typing && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setFlash(e.shiftKey ? ungroupSelected() : groupSelection());
        return;
      }

      // Z-order: [ and ] step, ⌘[ and ⌘] go all the way. Photoshop's keys,
      // and the same ones Figma uses.
      if (!typing && (e.key === '[' || e.key === ']')) {
        const st = getState();
        if (!st.selected) return;
        e.preventDefault();
        const front = e.key === ']';
        const next = mod
          ? reorderToEdge(st.doc, st.selected, front ? 'front' : 'back')
          : reorderSibling(st.doc, st.selected, front ? 1 : -1);
        if (!next) return;
        commit(next.doc);
        setUI({ selected: next.path });
        say(mod ? (front ? 'Brought to front:' : 'Sent to back:') : front ? 'Forward:' : 'Backward:', 'element');
        return;
      }

      if (typing) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!getState().selected) return;
        e.preventDefault();
        deleteSelection();
      }
      if (e.key === 'Escape') setUI({ selected: null });
      // Bare `t` toggles the theme — ⌘D is now duplicate, so `d` moved off it.
      if (e.key === 't') setUI({ theme: getState().theme === 'dark' ? 'light' : 'dark' });
      if (e.key === 'o') setUI({ showOutlines: !getState().showOutlines });
      if (e.key === 'g') setUI({ showGrid: !getState().showGrid });
      if (e.key === 'a') setUI({ smartGuides: !getState().smartGuides });
      if (e.key === 'r') setUI({ lockAspect: !getState().lockAspect });
    };
    /**
     * Native clipboard events. Using these rather than the async Clipboard API
     * means no permission prompt, and cross-document paste works even where
     * `navigator.clipboard.readText()` is refused.
     */
    const isTyping = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.matches?.('input, textarea, select') ?? false;

    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const copied = copySelected();
      if (!copied) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', copied.payload);
      say('Copied', copied.label);
    };

    const onCut = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const cut = cutSelected();
      if (!cut) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', cut.payload);
      say('Cut', cut.label);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? null;
      const label = paste(text);
      if (!label) return;
      e.preventDefault();
      say('Pasted', label);
    };

    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  const report = (label: string, outcome: Awaited<ReturnType<typeof saveFile>>) => {
    if (outcome.status === 'saved') say('Saved', label);
    else if (outcome.status === 'declined') setFlash('Save declined');
    else if (outcome.status === 'unavailable')
      setFlash('Saving is unavailable in this viewer — use Copy SVG instead');
    else setFlash(`Save failed: ${outcome.message}`);
  };

  const exportSvg = async (which: 'dark' | 'light' | 'both') => {
    const themes = which === 'both' ? (['dark', 'light'] as const) : [which];
    for (const t of themes) {
      // Exported without `annotate`, so no editor metadata ships.
      const name = `${doc.id}.${t}.svg`;
      report(name, await saveFile(name, renderDocument(doc, t), 'image/svg+xml'));
    }
  };

  /*
   * PNG of the current theme, from the same export SVG the Save SVG button
   * writes — so the raster and the vector cannot disagree. See `svgToPng`.
   */
  const exportPng = async () => {
    const suffix = pngScale === 1 ? '' : `@${pngScale}x`;
    const name = `${doc.id}.${theme}${suffix}.png`;
    try {
      const png = await svgToPng(renderDocument(doc, theme), doc.canvas.width, doc.canvas.height, pngScale);
      report(name, await saveFile(name, png, 'image/png'));
    } catch (err) {
      setFlash(`Could not render the PNG — ${(err as Error).message}`);
    }
  };

  /*
   * Copy needs no capability, which is the point of having it next to Save.
   * A download inside the viewer sandbox depends on a grant that can be
   * declined or simply unavailable; pasting SVG markup onto a Figma canvas
   * works everywhere and gives editable vectors rather than an image.
   */
  const copySvg = async () => {
    const ok = await copyText(renderDocument(doc, theme));
    setFlash(ok ? `Copied the ${theme} SVG — paste into Figma` : 'Could not reach the clipboard');
  };

  const showSource = () =>
    setSource({
      filename: `${doc.id}.${theme}.svg`,
      text: renderDocument(doc, theme),
    });

  // The library is the landing screen; the editor opens onto one document.
  if (view === 'library') return <Library />;

  const leave = () => {
    if (dirty && !window.confirm('Leave without saving? Your changes to this illustration will be lost.')) return;
    setUI({ view: 'library', selected: null });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="back" onClick={leave} title="Back to the library">
          ‹ Library
        </button>

        <input
          className="doc-name"
          value={doc.name}
          aria-label="Illustration name"
          onChange={(e) => commit({ ...getState().doc, name: e.target.value })}
        />

        {dirty && <span className="unsaved" title="Unsaved changes">●</span>}

        <div className="spacer" />

        <div className="seg" role="group" aria-label="Theme">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? 'on' : ''}
              onClick={() => setUI({ theme: t })}
            >
              {t}
            </button>
          ))}
        </div>

        <span className="snap">
          <button
            type="button"
            className={showGrid ? 'on' : ''}
            onClick={() => setUI({ showGrid: !showGrid })}
            title="Show the grid (g)"
          >
            Grid
          </button>
          <select
            value={snapStep}
            onChange={(e) => setUI({ snapStep: Number(e.target.value) })}
            title="Snap step — hold shift while dragging to bypass"
          >
            <option value={0}>off</option>
            {LAYOUT.gridSteps.map((v) => (
              <option key={v} value={v}>
                {v}px
              </option>
            ))}
          </select>
        </span>

        <button
          type="button"
          className={lockAspect ? 'on' : ''}
          onClick={() => setUI({ lockAspect: !lockAspect })}
          title="Lock proportions when resizing (r) — hold ⌘ while dragging to invert"
        >
          {lockAspect ? '🔒 Ratio' : 'Ratio'}
        </button>

        <button
          type="button"
          className={smartGuides ? 'on' : ''}
          onClick={() => setUI({ smartGuides: !smartGuides })}
          title="Alignment guides while dragging, and the safe area — edges and centres (a)"
        >
          Guides
        </button>

        <button
          type="button"
          className={outlines ? 'on' : ''}
          onClick={() => setUI({ showOutlines: !outlines })}
          title="Outline every element (o)"
        >
          Outlines
        </button>

        <span className="divider" />

        <button type="button" onClick={undo} disabled={!canUndo()} title="Undo (⌘Z)">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!canRedo()} title="Redo (⇧⌘Z)">
          Redo
        </button>

        <span className="divider" />

        <span className="zoom">
          <button type="button" onClick={() => setUI({ zoom: Math.max(0.25, zoom - 0.2) })}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setUI({ zoom: Math.min(6, zoom + 0.2) })}>
            ＋
          </button>
          <button type="button" onClick={() => setUI({ zoom: 1.4, pan: { x: 0, y: 0 } })}>
            Reset
          </button>
        </span>

        <span className="divider" />

        <button
          type="button"
          className={dirty ? 'primary' : ''}
          onClick={() => void saveDoc()}
          title={
            store_ === 'shared'
              ? 'Save to the shared library (⌘S)'
              : 'Save to this browser (⌘S)'
          }
        >
          {dirty ? 'Save' : 'Saved'}
        </button>

        <span className="divider" />

        <button type="button" onClick={showSource} title="View and copy the SVG source">
          SVG source
        </button>
        <button
          type="button"
          onClick={() => void copySvg()}
          title="Copy the SVG markup — paste straight into Figma as vectors"
        >
          Copy SVG
        </button>
        <button
          type="button"
          onClick={() => void exportSvg(theme)}
          title={`Save the ${theme} SVG`}
        >
          Save SVG
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void exportSvg('both')}
          title="Save both themes"
        >
          Save both
        </button>
        <span className="png-export">
          <button
            type="button"
            onClick={() => void exportPng()}
            title={`Save the ${theme} illustration as a PNG, ${doc.canvas.width * pngScale} × ${doc.canvas.height * pngScale}px`}
          >
            Save PNG
          </button>
          <select
            aria-label="PNG scale"
            value={pngScale}
            onChange={(e) => setPngScale(Number(e.target.value))}
            title="PNG size, as a multiple of the canvas"
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </span>
        <button
          type="button"
          onClick={() =>
            void saveFile(
              `${doc.id}.json`,
              JSON.stringify(doc, null, 2),
              'application/json',
            ).then((o) => report(`${doc.id}.json`, o))
          }
          title="Save the document"
        >
          .json
        </button>
      </header>

      <div className="body">
        <aside className="left">
          <div className="tabs">
            {(['layers', 'library'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={tab === t ? 'on' : ''}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="left-body">{tab === 'layers' ? <Layers /> : <Palette />}</div>
        </aside>

        <main className="center">
          <Canvas />
          <footer className="statusbar">
            <span>
              {doc.canvas.width} × {doc.canvas.height}
              {doc.artboard &&
                ` · artboard ${doc.artboard.width} × ${doc.artboard.height}`}
            </span>
            <span>{countElements(doc.elements)} elements</span>
            <span>{selected ? `selected ${selected}` : 'nothing selected'}</span>
            {flash && <span className="flash">{flash}</span>}
            <span className="hint">
              drag move · double-click text to edit · ⇧click multi · ⌘G/⇧⌘G group · arrows nudge · ⌘C/⌘V/⌘D · [ ] z-order · g grid · a guides · r ratio · t theme
            </span>
          </footer>
        </main>

        <aside className="right">
          <Inspector />
        </aside>
      </div>

      {source && (
        <SourceModal
          filename={source.filename}
          source={source.text}
          onClose={() => setSource(null)}
        />
      )}
    </div>
  );
}

function countElements(list: Element[]): number {
  return list.reduce(
    (n, el) => n + 1 + countElements((el as { children?: Element[] }).children ?? []),
    0,
  );
}
