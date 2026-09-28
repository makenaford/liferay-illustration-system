import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { verifyAccessToken } from "./AccessToken.ts";
import Library from "./Library.ts";
import { decodeTranslateRequest, FONT_WEIGHTS, notoSansJp, translate } from "./Translate.ts";

/**
 * THE SITE — Marketing Assets (the illustration builder inside it) on one
 * Worker: the built page from out/cloudflare, and the store API under /api
 * that cloudflare/runtime.ts turns back into the `db`, `user` and
 * `downloads` capabilities the page was written against.
 *
 *   GET    /api/me                { email }
 *   GET    /api/live              WebSocket: every change, as it commits
 *   GET    /api/docs?col=         [{ id, body }]
 *   GET    /api/doc?col=&id=      { body }  (body null when none)
 *   PUT    /api/doc?col=&id=      JSON body -> stored as is
 *   DELETE /api/doc?col=&id=
 *   POST   /api/translate         { to, strings } -> { translations }
 *   GET    /api/font?weight=&text= Noto Sans JP, cut to `text` (woff2)
 *
 * The last two are the translated export — see cloudflare/Translate.ts.
 *
 * WHO. The Worker sits behind Cloudflare Access (`access`): only people
 * signed in with an address at EMAIL_DOMAIN reach it, by one-time PIN —
 * see alchemy.run.ts. The API also checks who is asking — the identity
 * Access hands the Worker when it does, otherwise the signed token Access
 * adds to the request (cloudflare/AccessToken.ts) — and refuses any request
 * without one, or from outside the domain, in case a route ever escapes
 * the policy.
 */

/** Who may use the library: anyone signed in with an address here. */
export const EMAIL_DOMAIN = "liferay.com";
/** The Zero Trust team the Access application belongs to. */
const ACCESS_TEAM = "liferaydesign.cloudflareaccess.com";

/**
 * The audience tag of the Access application in front of the Worker (the
 * `access` prop below), which Access tokens must carry. Cloudflare keeps it
 * for the application's life; if the application is ever recreated, the
 * Worker logs "Access token refused: wrong audience" — read the new tag off
 * the sign-in redirect (`kid=`) and update it here.
 */
const ACCESS_AUD = "7ab3e375b0b53c2a91cc4ffa04165ca2d099ca6d152b9e163d3ceffae2407309";

/** Larger than the page's own limit (MAX_DOC_BYTES, 250KB), so it never bites first. */
const MAX_BODY = 900 * 1024;
/** Collection paths: `name`, or `name/<id>/name` for a subcollection. */
const COL = /^[\w-]+(\/[\w.:-]+\/[\w-]+)*$/;
const ID = /^[\w.:-]{1,200}$/;

const Document = Schema.Record(Schema.String, Schema.Unknown);
const decodeDocument = Schema.decodeUnknownEffect(Document);

const fail = (status: number, error: string) => HttpServerResponse.json({ error }, { status });

/**
 * The signed-in email: from Access's context when it gives one, else from
 * its token, which must carry `aud` — the application's audience tag.
 */
const signedIn = (token: string | undefined, aud: string) =>
  Effect.gen(function* () {
    const access = yield* Cloudflare.Access.Context;
    const identity = access ? yield* access.getIdentity().pipe(Effect.orElseSucceed(() => undefined)) : undefined;
    if (identity?.email) return identity.email;
    if (!token) return undefined;
    return yield* verifyAccessToken(token, ACCESS_TEAM, aud).pipe(
      Effect.tapError((e) => Effect.logWarning(`Access token refused: ${e.reason}`)),
      Effect.orElseSucceed(() => undefined),
    );
  });

export default class Site extends Cloudflare.Worker<Site>()(
  "Site",
  {
    main: import.meta.url,
    compatibility: { date: "2026-09-01" },
    assets: {
      directory: "./out/cloudflare",
      // The API is the Worker's; everything else is the page.
      runWorkerFirst: ["/api/*"],
      notFoundHandling: "single-page-application",
    },
    access: {
      name: "Liferay Marketing Assets",
      sessionDuration: "720h",
      policies: [{ decision: "allow", include: [{ emailDomain: EMAIL_DOMAIN }] }],
    },
    // `alchemy dev` has no Access in front: sign every request in as this.
    dev: { access: { identity: { email: `dev@${EMAIL_DOMAIN}` } } },
  },
  Effect.gen(function* () {
    const libraries = yield* Library;
    const ai = yield* Cloudflare.Workers.AI();

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;

        const email = (yield* signedIn(request.headers["cf-access-jwt-assertion"], ACCESS_AUD))?.toLowerCase();
        if (!email?.endsWith(`@${EMAIL_DOMAIN}`)) {
          return yield* fail(401, "Sign in with your Liferay address.");
        }

        const url = new URL(request.url, "http://site");
        const route = url.pathname.replace(/^\/api\/?/, "");
        const col = url.searchParams.get("col") ?? "";
        const id = url.searchParams.get("id") ?? "";
        const library = libraries.getByName("team");

        if (route === "me" && request.method === "GET") {
          return yield* HttpServerResponse.json({ email });
        }
        if (route === "live" && request.method === "GET") {
          return yield* library.fetch(request);
        }

        if (route === "translate" && request.method === "POST") {
          const raw = yield* request.text;
          if (raw.length > MAX_BODY) return yield* fail(413, "Too large.");
          const body = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(
            Effect.flatMap(decodeTranslateRequest),
            Effect.option,
          );
          if (body._tag === "None") return yield* fail(400, "Expected { to, strings }.");
          return yield* translate((model, inputs) => ai.run(model as keyof AiModels, inputs as never), body.value.to, body.value.strings).pipe(
            Effect.flatMap((translations) => HttpServerResponse.json({ translations })),
            Effect.catchTag("TranslateError", (e) =>
              Effect.logWarning(e.message).pipe(Effect.andThen(fail(502, e.message))),
            ),
          );
        }
        if (route === "font" && request.method === "GET") {
          const weight = Number(url.searchParams.get("weight"));
          const text = url.searchParams.get("text") ?? "";
          if (!(FONT_WEIGHTS as readonly number[]).includes(weight) || !text || text.length > 4000) {
            return yield* fail(400, "Bad font request.");
          }
          return yield* notoSansJp(weight, text).pipe(
            Effect.map((bytes) =>
              HttpServerResponse.uint8Array(new Uint8Array(bytes), {
                contentType: "font/woff2",
                headers: { "cache-control": "private, max-age=86400" },
              }),
            ),
            Effect.catchTag("TranslateError", (e) => fail(502, e.message)),
          );
        }

        if (!COL.test(col)) return yield* fail(400, "Bad collection.");
        if (route === "docs" && request.method === "GET") {
          return yield* HttpServerResponse.json(yield* library.list(col));
        }

        if (route !== "doc" || !ID.test(id)) return yield* fail(404, "Not found.");
        switch (request.method) {
          case "GET":
            return yield* HttpServerResponse.json({ body: yield* library.get(col, id) });
          case "PUT": {
            const raw = yield* request.text;
            if (raw.length > MAX_BODY) return yield* fail(413, "Too large.");
            const body = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(
              Effect.flatMap(decodeDocument),
              Effect.option,
            );
            if (body._tag === "None") return yield* fail(400, "Not a JSON document.");
            yield* library.put(col, id, body.value, email);
            return yield* HttpServerResponse.json({ ok: true });
          }
          case "DELETE":
            yield* library.remove(col, id);
            return yield* HttpServerResponse.json({ ok: true });
          default:
            return yield* fail(405, "Method not allowed.");
        }
      }),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.AIBinding)),
) {}
