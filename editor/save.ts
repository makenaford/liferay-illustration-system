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

/**
 * Every documented rejection code, turned into something a designer can act
 * on. The default used to be the bare code, which told you a save had failed
 * and nothing about what to do next.
 */
const REASON: Record<string, string> = {
  rate_limited: 'a save prompt is already open — finish it, then try again',
  too_large: 'the file is too large for this destination',
  rejected_extension: 'this viewer will not accept .svg files',
  extension_not_enabled: 'SVG saving is switched off in this viewer',
  bad_request: 'the editor sent a malformed file — please report this',
  request_unknown: 'the export request expired',
  transform_error: 'the viewer could not process the file',
};

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
      const code = (e as { code?: string })?.code ?? '';
      if (code === 'declined') return { status: 'declined' };
      // `capability_disabled` and `capability_removed` are lifecycle states
      // that mean the same thing to a designer: saving is not available here.
      if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) {
        return { status: 'unavailable' };
      }
      return { status: 'error', message: REASON[code] ?? code ?? 'save failed' };
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
