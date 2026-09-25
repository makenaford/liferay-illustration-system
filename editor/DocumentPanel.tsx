import type { Doc, PanelSpec } from '../src/document.ts';
import { commit, getState, useEditor } from './state.ts';
import { MESH_NAMES } from '../src/tokens.ts';
import { TokenPicker } from './TokenPicker.tsx';

/**
 * DOCUMENT PANEL — canvas, hero panels and ambient glows.
 *
 * These live on the document rather than in `elements`, so they're invisible
 * to the element inspector. Porting the nine illustrations proved they're
 * things a designer changes constantly — glow placement especially — so they
 * need first-class controls, not a JSON edit.
 */
export function DocumentPanel() {
  const doc = useEditor((s) => s.doc);

  const patch = (next: Partial<Doc>) => commit({ ...getState().doc, ...next });

  const setPanel = (i: number, key: keyof PanelSpec, v: unknown) => {
    const panels = [...(doc.panels ?? [])];
    panels[i] = { ...panels[i], [key]: v } as PanelSpec;
    patch({ panels });
  };

  const setGlow = (i: number, key: string, v: number) => {
    const glow = [...(doc.glow ?? [])];
    glow[i] = { ...glow[i], [key]: v };
    patch({ glow });
  };

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="badge-type">Document</span>
      </div>

      <div className="fields">
        <label className="field wide">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={doc.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Canvas W</span>
          <input
            type="number"
            value={doc.canvas.width}
            onChange={(e) =>
              patch({ canvas: { ...doc.canvas, width: Number(e.target.value) } })
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Canvas H</span>
          <input
            type="number"
            value={doc.canvas.height}
            onChange={(e) =>
              patch({ canvas: { ...doc.canvas, height: Number(e.target.value) } })
            }
          />
        </label>
      </div>

      {doc.artboard && (
        <div className="section">
          <div className="section-head">
            <span>Artboard</span>
          </div>
          <p className="panel-note" style={{ padding: 0, marginBottom: 8 }}>
            Drawn at {doc.artboard.width} × {doc.artboard.height} and scaled to
            fit the {doc.canvas.width} × {doc.canvas.height} export
            ({Math.round(
              Math.min(
                doc.canvas.width / doc.artboard.width,
                doc.canvas.height / doc.artboard.height,
              ) * 1000,
            ) / 10}
            %). You edit in artboard units.
          </p>
          <div className="layout-actions two">
            <button
              type="button"
              title="Export at the artboard's own size instead"
              onClick={() => patch({ canvas: { ...doc.artboard! }, artboard: undefined })}
            >
              Export 1:1
            </button>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <span>Background</span>
        </div>
        <div className="layout-actions">
          {MESH_NAMES.map((m) => (
            <button
              key={m.label}
              type="button"
              className={doc.background === m.name ? 'on' : ''}
              aria-pressed={doc.background === m.name}
              onClick={() => patch({ background: m.name })}
            >
              {m.label}
            </button>
          ))}
        </div>
        {doc.background === 'duo' && (
          <label className="field wide bg-accent">
            <span className="field-label">Accent color · beside the primary blue</span>
            <TokenPicker
              value={doc.backgroundAccent ?? 'base-aqua'}
              allowNone={false}
              colorsOnly
              onChange={(v) => patch({ backgroundAccent: v })}
            />
          </label>
        )}
        {!MESH_NAMES.some((m) => m.name === doc.background) && (
          <p className="bg-note">
            This illustration uses {doc.background ? 'a background no longer offered' : 'the theme’s original background'}.
            Choose one above to change it.
          </p>
        )}
      </div>

      <Section
        title="Hero panels"
        onAdd={() =>
          patch({
            panels: [
              ...(doc.panels ?? []),
              { x: 60, y: 46, width: 200, height: 200, sheen: 'radial' },
            ],
          })
        }
      >
        {(doc.panels ?? []).map((p, i) => (
          <div key={i} className="sub-row">
            <div className="sub-row-head">
              <span>Panel {i + 1}</span>
              <button
                type="button"
                className="mini"
                onClick={() => patch({ panels: doc.panels!.filter((_, j) => j !== i) })}
              >
                remove
              </button>
            </div>
            <div className="quad">
              {(['x', 'y', 'width', 'height'] as const).map((k) => (
                <label key={k}>
                  <span>{k[0].toUpperCase()}</span>
                  <input
                    type="number"
                    value={p[k]}
                    onChange={(e) => setPanel(i, k, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <select
              value={p.sheen ?? 'radial'}
              onChange={(e) => setPanel(i, 'sheen', e.target.value)}
            >
              <option value="radial">radial sheen</option>
              <option value="linear">linear sheen</option>
            </select>
            <label className="check" title="Cut everything centred inside this panel to its shape">
              <input
                type="checkbox"
                checked={!!p.clip}
                onChange={(e) => setPanel(i, 'clip', e.target.checked || undefined)}
              />
              <span>Clip content</span>
            </label>
          </div>
        ))}
      </Section>

      <Section
        title="Ambient glows"
        onAdd={() =>
          patch({
            glow: [
              ...(doc.glow ?? []),
              { cx: 280, cy: 260, rx: 140, ry: 140, blur: 100 },
            ],
          })
        }
      >
        {(doc.glow ?? []).map((g, i) => (
          <div key={i} className="sub-row">
            <div className="sub-row-head">
              <span>Glow {i + 1}</span>
              <button
                type="button"
                className="mini"
                onClick={() => patch({ glow: doc.glow!.filter((_, j) => j !== i) })}
              >
                remove
              </button>
            </div>
            <div className="quad">
              {(['cx', 'cy', 'rx', 'ry'] as const).map((k) => (
                <label key={k}>
                  <span>{k}</span>
                  <input
                    type="number"
                    value={g[k]}
                    onChange={(e) => setGlow(i, k, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <label className="slider">
              <span>blur {g.blur ?? 60}</span>
              <input
                type="range"
                min={0}
                max={160}
                step={5}
                value={g.blur ?? 60}
                onChange={(e) => setGlow(i, 'blur', Number(e.target.value))}
              />
            </label>
          </div>
        ))}
      </Section>

      <p className="panel-note">
        Select an element on the canvas to edit it, or add one from the library.
      </p>
    </div>
  );
}

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="section">
      <div className="section-head">
        <span>{title}</span>
        <button type="button" className="mini" onClick={onAdd}>
          + add
        </button>
      </div>
      {children}
    </div>
  );
}
