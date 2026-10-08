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
            const cursor = yield* sql.exec<{ body: string }>(
              "SELECT body FROM docs WHERE col = ? AND id = ?",
              col,
              id,
            );
            const [row] = yield* cursor.toArray();
            return row ? (JSON.parse(row.body) as Record<string, unknown>) : null;
          }),

        put: (col: string, id: string, body: Record<string, unknown>, by: string) =>
          Effect.gen(function* () {
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

        remove: (col: string, id: string) =>
          Effect.gen(function* () {
            yield* sql.exec("DELETE FROM docs WHERE col = ? AND id = ?", col, id);
            yield* broadcast({ col, id, body: null });
          }),
      };
    });
  }),
) {}
