/**
 * Saving files, in two very different environments.
 *
 * Locally (Vite dev, or any plain browser) a blob URL on an `<a download>` is
 * all it takes. Published as a claude.ai Artifact, the viewer sandbox makes
 * every page-initiated download inert — anchors, blob and data URIs included —
 * so the only route is the `downloads` capability, which asks the viewer to
 * confirm and may be declined.
 *
 * Both are wrapped here so the rest of the editor just calls `saveFile` and
 * gets an honest outcome back. The failure mode this avoids is the bad one: a
 * download button that silently does nothing.
 */

interface DownloadsNamespace {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface ClaudeGlobal {
  use?(name: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ClaudeGlobal;
  }
}

/** Presence of `window.claude` means we're framed by a viewer, not standalone. */
export const isHosted = () => typeof window !== 'undefined' && !!window.claude;

let cached: Promise<DownloadsNamespace | null> | undefined;

function downloads(): Promise<DownloadsNamespace | null> {
  if (!cached) {
    const use = window.claude?.use;
    cached = use
      ? Promise.resolve(use.call(window.claude, 'downloads'))
          .then((ns) => (ns as DownloadsNamespace) ?? null)
          .catch(() => null)
      : Promise.resolve(null);
  }
  return cached;
}

export type SaveOutcome =
  | { status: 'saved' }
  | { status: 'declined' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export async function saveFile(
  filename: string,
  text: string,
  mime: string,
): Promise<SaveOutcome> {
  const ns = await downloads();

  if (ns) {
    try {
      await ns.save({ filename, data: text });
      return { status: 'saved' };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return { status: 'declined' };
      if (code === 'unavailable' || code === 'not_granted') return { status: 'unavailable' };
      return { status: 'error', message: code ?? 'save failed' };
    }
  }

  // No capability. If we're framed by a viewer the anchor route is inert, so
  // say so rather than pretending the click worked.
  if (isHosted()) return { status: 'unavailable' };

  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { status: 'saved' };
}

/** Clipboard fallback that works everywhere, including the viewer sandbox. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sandboxed frames can refuse the async API; the legacy path still works.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
