import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

/**
 * THE LIBRARY — the team's shared store, one Durable Object for everyone.
 *
 * Every document of every collection is a row in the object's own SQLite
 * storage, keyed by its collection path and id (`iconSets/<setId>/icons`,
 * `<iconId>`) — the shape the page's `db` capability expects; see
 * cloudflare/runtime.ts. One object is enough: the team is small, writes are
 * rare, and a single object orders them. SQLite-backed objects are the kind
 * the Workers Free plan includes.
 *
 * REALTIME. Pages connect a WebSocket (`fetch`, forwarded by the Worker) and
 * the object pushes every write to all of them as it commits — `{ col, id,
 * body }`, `body` null for a delete. Sockets use the hibernation API, so an
 * idle library costs nothing while pages stay connected.
 *
 * IMAGES. A raster embedded in a document (a `data:` URI, base64) is kept
 * once, in its own table, by its SHA-256, and the document holds its address
 * instead — `/api/blob/<hash>`, which the Worker serves as the image itself,
 * cached for good. The library's data is then a few hundred KB however many
 * screenshots it holds, an image shared by several illustrations (a Japan
 * copy, a duplicate) is stored and downloaded once, and the page shows the
 * illustrations at once while the images arrive. Writes bring data URIs in;
 * documents saved before this are converted the first time they are read.
 * The page puts the images back into anything it exports (editor/blobs.ts).
 *
 * CHANGES. A page keeps its copy of a collection between visits and asks
 * only for what was written since (`changes`), rather than the whole
 * library again — most of it embedded images.
 */

/** A pushed change. `body` is null when the document was deleted. */
export interface Change {
  readonly col: string;
  readonly id: string;
  readonly body: Record<string, unknown> | null;
}

export interface Row {
  readonly id: string;
  readonly body: Record<string, unknown>;
}

/** A blob's address, as documents hold it. */
export const blobPath = (hash: string) => `/api/blob/${hash}`;
export const BLOB_HASH = /^[0-9a-f]{64}$/;
/** An embedded raster worth keeping apart: smaller ones stay where they are. */
const RASTER = /^data:(image\/(?:png|jpeg|webp|gif));base64,/;
const MIN_BLOB = 4096;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export default class Library extends Cloudflare.DurableObject<Library>()(
  "Library",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      const sql = state.storage.sql;
      yield* sql.exec(`
        CREATE TABLE IF NOT EXISTS docs (
          col        TEXT    NOT NULL,
          id         TEXT    NOT NULL,
          body       TEXT    NOT NULL,
          updated_at INTEGER NOT NULL,
          updated_by TEXT,
          PRIMARY KEY (col, id)
        )
      `);

      yield* sql.exec(`
        CREATE TABLE IF NOT EXISTS blobs (
          hash TEXT PRIMARY KEY,
          mime TEXT NOT NULL,
          data BLOB NOT NULL
        )
      `);

      /** One embedded raster stored as a blob; its address. */
      const keep = (uri: string, mime: string) =>
        Effect.gen(function* () {
          const hash = hex(yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(uri))));
          const bin = atob(uri.slice(uri.indexOf(",") + 1));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          yield* sql.exec("INSERT OR IGNORE INTO blobs (hash, mime, data) VALUES (?, ?, ?)", hash, mime, bytes.buffer);
          return blobPath(hash);
        });

      /** `value` with every large embedded raster in it stored apart, by address. */
      type Needs = ReturnType<typeof keep> extends Effect.Effect<unknown, never, infer R> ? R : never;
      const externalize = (value: unknown): Effect.Effect<unknown, never, Needs> =>
        Effect.gen(function* () {
          if (typeof value === "string") {
            const m = value.length >= MIN_BLOB ? RASTER.exec(value) : null;
            return m ? yield* keep(value, m[1]) : value;
          }
          if (Array.isArray(value)) return yield* Effect.forEach(value, externalize);
          if (value && typeof value === "object") {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value)) out[k] = yield* externalize(v);
            return out;
          }
          return value;
        });

      /**
       * Documents saved with their images inside, converted once: the same
       * documents, the same times — a page's copy of one stays good.
       */
      let converted = false;
      const ready = Effect.gen(function* () {
        if (converted) return;
        const rows = yield* (yield* sql.exec<{ col: string; id: string; body: string }>(
          `SELECT col, id, body FROM docs WHERE body LIKE '%"data:image/%'`,
        )).toArray();
        for (const r of rows) {
          const body = JSON.stringify(yield* externalize(JSON.parse(r.body)));
          if (body !== r.body) yield* sql.exec("UPDATE docs SET body = ? WHERE col = ? AND id = ?", body, r.col, r.id);
        }
        converted = true;
      });

      const broadcast = (change: Change) =>
        Effect.gen(function* () {
          const message = JSON.stringify(change);
          for (const socket of yield* state.getWebSockets()) {
            // A socket that closed mid-send is dropped by the runtime.
            yield* socket.send(message).pipe(Effect.ignore);
          }
        });

      return {
        /** A page's live connection. */
        fetch: Effect.gen(function* () {
          const [response] = yield* Cloudflare.upgrade();
          return response;
        }),
        // Pages only listen; anything they send is ignored.
        webSocketMessage: () => Effect.void,
        webSocketClose: Effect.fn(function* (socket: Cloudflare.WebSocket, code: number, reason: string) {
          // 1005/1006/1015 report how a socket ended and can't be sent back:
          // a page that closes without a code arrives as 1005.
          yield* socket.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason).pipe(Effect.ignore);
        }),

        list: (col: string) =>
          Effect.gen(function* () {
            yield* ready;
            const cursor = yield* sql.exec<{ id: string; body: string }>(
              "SELECT id, body FROM docs WHERE col = ? ORDER BY id",
              col,
            );
            const rows = yield* cursor.toArray();
            return rows.map((r): Row => ({ id: r.id, body: JSON.parse(r.body) }));
          }),

        /**
         * What changed in `col` since `since` (ms, this object's clock): the
         * documents written after it, every id there is now — so a page
         * holding a copy can drop what was deleted — and the latest write's
         * time, the next `since`. A page with nothing new gets the ids alone.
         */
        changes: (col: string, since: number) =>
          Effect.gen(function* () {
            yield* ready;
            const changed = yield* (yield* sql.exec<{ id: string; body: string; updated_at: number }>(
              "SELECT id, body, updated_at FROM docs WHERE col = ? AND updated_at > ? ORDER BY id",
              col,
              since,
            )).toArray();
            const all = yield* (yield* sql.exec<{ id: string; updated_at: number }>(
              "SELECT id, updated_at FROM docs WHERE col = ?",
              col,
            )).toArray();
            return {
              rows: changed.map((r): Row => ({ id: r.id, body: JSON.parse(r.body) })),
              ids: all.map((r) => r.id),
              // Short of now, so a write later this same millisecond is not skipped.
              at: Math.min(all.reduce((m, r) => Math.max(m, r.updated_at), since), Math.max(since, Date.now() - 1)),
            };
          }),

        get: (col: string, id: string) =>
          Effect.gen(function* () {
            yield* ready;
            const cursor = yield* sql.exec<{ body: string }>(
              "SELECT body FROM docs WHERE col = ? AND id = ?",
              col,
              id,
            );
            const [row] = yield* cursor.toArray();
            return row ? (JSON.parse(row.body) as Record<string, unknown>) : null;
          }),

        put: (col: string, id: string, written: Record<string, unknown>, by: string) =>
          Effect.gen(function* () {
            const body = (yield* externalize(written)) as Record<string, unknown>;
            yield* sql.exec(
              `INSERT INTO docs (col, id, body, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (col, id) DO UPDATE SET
                 body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
              col,
              id,
              JSON.stringify(body),
              Date.now(),
              by,
            );
            yield* broadcast({ col, id, body });
          }),

        /** A stored image, by its hash: its type and bytes. */
        blob: (hash: string) =>
          Effect.gen(function* () {
            const [row] = yield* (yield* sql.exec<{ mime: string; data: ArrayBuffer }>(
              "SELECT mime, data FROM blobs WHERE hash = ?",
              hash,
            )).toArray();
            return row ? { mime: row.mime, data: new Uint8Array(row.data) } : null;
          }),

        remove: (col: string, id: string) =>
          Effect.gen(function* () {
            yield* sql.exec("DELETE FROM docs WHERE col = ? AND id = ?", col, id);
            yield* broadcast({ col, id, body: null });
          }),
      };
    });
  }),
) {}
