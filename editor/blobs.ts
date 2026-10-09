/**
 * STORED IMAGES, PUT BACK — for anything that leaves the page.
 *
 * On the Marketing Assets site the library keeps each embedded screenshot
 * once, apart from the documents, and a document holds its address instead
 * (`/api/blob/<sha256>`, see cloudflare/Library.ts). On the page that is all
 * an image needs. A file is another matter: a downloaded SVG, a PNG drawn
 * from one, the copy for Figma or a .json must carry its images, so each of
 * those goes through `inlineBlobs` first, which puts every addressed image
 * back as a data URI. Anywhere else nothing is addressed and it changes
 * nothing.
 */

const ADDRESS = /\/api\/blob\/([0-9a-f]{64})/g;

/** Images fetched this visit, by hash — the browser caches them for good, too. */
const fetched = new Map<string, Promise<string>>();

function dataUri(hash: string): Promise<string> {
  let p = fetched.get(hash);
  if (!p) {
    p = fetch(`/api/blob/${hash}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`an image could not be loaded (${res.status})`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error('an image could not be read'));
            r.readAsDataURL(blob);
          }),
      );
    p.catch(() => fetched.delete(hash));
    fetched.set(hash, p);
  }
  return p;
}

/** Whether `text` points to stored images. */
export const hasBlobs = (text: string) => text.includes('/api/blob/');

/** `text` — an SVG, a JSON document — with every stored image in it embedded. */
export async function inlineBlobs(text: string): Promise<string> {
  if (!hasBlobs(text)) return text;
  const hashes = [...new Set([...text.matchAll(ADDRESS)].map((m) => m[1]))];
  const uris = new Map(await Promise.all(hashes.map(async (h) => [h, await dataUri(h)] as const)));
  return text.replace(ADDRESS, (all, h: string) => uris.get(h) ?? all);
}
