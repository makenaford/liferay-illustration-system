import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDocument } from '../src/render.ts';
import { collectStrings, LANGUAGES, localizedDoc, type Lang } from '../src/translate.ts';
import { commit, getState, useEditor } from './state.ts';
import { svgToPng } from './png.ts';
import { saveFile, type SaveOutcome } from './save.ts';
import { renderTranslated, translator } from './translate.ts';

/**
 * TRANSLATE — download the illustration with its copy in another language.
 *
 * The canvas and the library keep the original. What changes is only the
 * file that downloads: `translateDoc` makes a translated copy on the way out
 * (src/translate.ts). Every string is listed beside its translation, drafted
 * by machine and correctable here; corrections are kept on the document, so
 * they are saved with it and the next export starts from them.
 */
export function TranslateModal({
  pngScale,
  onClose,
  onSaved,
}: {
  pngScale: number;
  onClose: () => void;
  onSaved: (label: string, outcome: SaveOutcome) => void;
}) {
  const doc = useEditor((s) => s.doc);
  const theme = useEditor((s) => s.theme);
  const [lang, setLang] = useState<Lang>('ja');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  // Typing into one string is one undo step, like a drag.
  const lastEdited = useRef<string | null>(null);

  useEffect(() => {
    void translator().then((t) => setOnline(!!t));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const strings = useMemo(() => collectStrings(doc), [doc]);
  const table = doc.translations?.[lang] ?? {};
  const missing = strings.filter((s) => !table[s]?.trim());

  // On screen the page's own fonts draw it; the file embeds its faces.
  const preview = useMemo(
    () => renderDocument(localizedDoc(doc, lang, table), theme, { embedFont: false }),
    [doc, lang, table, theme],
  );

  /**
   * Merge entries into this language's table, on the live document. `machine`
   * marks them as drafts nobody has checked; anything typed here is a review.
   */
  const write = (entries: Record<string, string>, coalesce: boolean, machine = false) => {
    const current = getState().doc;
    const drafted = new Set(current.machineTranslated?.[lang] ?? []);
    for (const s of Object.keys(entries)) {
      if (machine) drafted.add(s);
      else drafted.delete(s);
    }
    commit(
      {
        ...current,
        translations: {
          ...current.translations,
          [lang]: { ...current.translations?.[lang], ...entries },
        },
        machineTranslated: { ...current.machineTranslated, [lang]: [...drafted] },
      },
      coalesce,
    );
  };
  const drafted = new Set(doc.machineTranslated?.[lang] ?? []);
  const unreviewed = strings.filter((s) => drafted.has(s) && table[s]?.trim()).length;

  const draft = async (which: string[]) => {
    const t = await translator();
    if (!t || !which.length) return;
    setBusy('Translating…');
    setNote(null);
    try {
      const out = await t.strings(lang, which);
      write(Object.fromEntries(which.map((s, i) => [s, out[i]])), false, true);
      lastEdited.current = null;
      setNote(`Translated ${which.length} string${which.length === 1 ? '' : 's'} — check them before you download.`);
    } catch (err) {
      setNote(`Translation failed — ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const base = `${doc.id}.${lang}`;

  const save = async (format: 'svg' | 'png', themes: ('dark' | 'light')[]) => {
    setBusy('Preparing…');
    setNote(null);
    try {
      for (const t of themes) {
        const svg = await renderTranslated(doc, lang, table, t);
        if (format === 'svg') {
          const name = `${base}.${t}.svg`;
          onSaved(name, await saveFile(name, svg, 'image/svg+xml'));
        } else {
          const name = `${base}.${t}${pngScale === 1 ? '' : `@${pngScale}x`}.png`;
          const png = await svgToPng(svg, doc.canvas.width, doc.canvas.height, pngScale);
          onSaved(name, await saveFile(name, png, 'image/png'));
        }
      }
    } catch (err) {
      setNote(`Could not export — ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-scrim" onPointerDown={onClose}>
      <div
        className="modal translate-modal"
        role="dialog"
        aria-label="Translated export"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>Translated export</strong>
          <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l].name} — {LANGUAGES[l].native}
              </option>
            ))}
          </select>
          <span className="modal-meta">
            {strings.length - missing.length} of {strings.length} translated
            {unreviewed ? ` · ${unreviewed} by machine, unreviewed` : ''}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="translate-body">
          <div className="translate-preview" dangerouslySetInnerHTML={{ __html: preview }} />

          <div className="translate-list">
            {strings.length === 0 && <p className="modal-hint">This illustration has no text to translate.</p>}
            {strings.map((s) => (
              <label key={s} className="translate-row">
                <span className="translate-src">
                  {s}
                  {drafted.has(s) && table[s]?.trim() && (
                    <em className="translate-machine" title="Machine translation — edit it, or leave it as it is">
                      machine
                    </em>
                  )}
                </span>
                <textarea
                  rows={1}
                  lang={lang}
                  value={table[s] ?? ''}
                  placeholder="Not translated — exports as written"
                  onChange={(e) => {
                    write({ [s]: e.target.value }, lastEdited.current === `${lang}:${s}`);
                    lastEdited.current = `${lang}:${s}`;
                  }}
                  spellCheck={false}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="modal-foot translate-foot">
          <span className="modal-hint">
            {busy ??
              note ??
              (online === false
                ? 'Machine translation needs the Marketing Assets site — type translations here instead.'
                : 'Only the download is translated. Save the illustration to keep these translations.')}
          </span>
          <button
            type="button"
            disabled={!online || !!busy || !missing.length}
            onClick={() => void draft(missing)}
            title="Machine-translate every string that has no translation yet"
          >
            Translate {missing.length ? `${missing.length} missing` : 'missing'}
          </button>
          <button
            type="button"
            disabled={!online || !!busy || !strings.length}
            onClick={() => void draft(strings)}
            title="Machine-translate every string again, replacing your corrections"
          >
            Retranslate all
          </button>
          <span className="divider" />
          <button type="button" disabled={!!busy} onClick={() => void save('svg', [theme])}>
            Save SVG
          </button>
          <button type="button" disabled={!!busy} onClick={() => void save('png', [theme])}>
            Save PNG {pngScale}×
          </button>
          <button type="button" className="primary" disabled={!!busy} onClick={() => void save('svg', ['dark', 'light'])}>
            Save both SVGs
          </button>
        </div>
      </div>
    </div>
  );
}
