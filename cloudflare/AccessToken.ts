import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * THE ACCESS TOKEN — who signed in, read off the token Cloudflare Access
 * puts on every request it lets through (`Cf-Access-Jwt-Assertion`).
 *
 * The token is checked here, not trusted: an RS256 signature by one of the
 * team's published keys, this application's audience (`aud`), the team as
 * issuer, and not expired. A request without a valid one has no identity.
 *
 * Why not `Cloudflare.Access.Context`: on this deployment it arrives empty
 * (the runtime leaves `ctx.access` unset), so every request looked signed
 * out. The token is what Access itself documents for origins to verify.
 */

export class AccessTokenError extends Data.TaggedError("AccessTokenError")<{
  readonly reason: string;
}> {}

const Header = Schema.Struct({ alg: Schema.Literal("RS256"), kid: Schema.String });
const Claims = Schema.Struct({
  aud: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  iss: Schema.String,
  exp: Schema.Number,
  email: Schema.optional(Schema.String),
});

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const decodeJson = <S extends Schema.Top>(schema: S, part: string) =>
  Effect.try(() => JSON.parse(new TextDecoder().decode(b64url(part))) as unknown).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError(() => new AccessTokenError({ reason: "malformed" })),
  );

interface Jwk extends JsonWebKey {
  kid: string;
}
/** The team's signing keys, refetched hourly or when an unknown key id turns up. */
let keys: { at: number; byKid: Map<string, CryptoKey> } | undefined;

const signingKey = (team: string, kid: string) =>
  Effect.tryPromise({
    try: async () => {
      if (!keys || Date.now() - keys.at > 3_600_000 || !keys.byKid.has(kid)) {
        const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
        const { keys: jwks } = (await res.json()) as { keys: Jwk[] };
        const byKid = new Map<string, CryptoKey>();
        for (const k of jwks) {
          byKid.set(
            k.kid,
            await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
          );
        }
        keys = { at: Date.now(), byKid };
      }
      return keys.byKid.get(kid);
    },
    catch: () => new AccessTokenError({ reason: "keys unavailable" }),
  }).pipe(Effect.flatMap((k) => (k ? Effect.succeed(k) : Effect.fail(new AccessTokenError({ reason: "unknown key" })))));

/**
 * The signed-in email on `token`, for the Access application `aud` of the
 * team at `team` (e.g. `liferaydesign.cloudflareaccess.com`).
 */
export const verifyAccessToken = (token: string, team: string, aud: string) =>
  Effect.gen(function* () {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return yield* new AccessTokenError({ reason: "malformed" });
    const header = yield* decodeJson(Header, h);
    const claims = yield* decodeJson(Claims, p);
    const key = yield* signingKey(team, header.kid);
    const ok = yield* Effect.promise(() =>
      crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`)),
    );
    if (!ok) return yield* new AccessTokenError({ reason: "bad signature" });
    const auds = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
    if (!auds.includes(aud)) return yield* new AccessTokenError({ reason: "wrong audience" });
    if (claims.iss !== `https://${team}`) return yield* new AccessTokenError({ reason: "wrong issuer" });
    if (claims.exp * 1000 < Date.now()) return yield* new AccessTokenError({ reason: "expired" });
    if (!claims.email) return yield* new AccessTokenError({ reason: "no email" });
    return claims.email;
  });
