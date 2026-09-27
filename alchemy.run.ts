import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import Site from "./cloudflare/Site.ts";

/**
 * Everything this project runs on Cloudflare, as one Alchemy stack:
 *
 *   Site      the Worker: the page (out/cloudflare) and its /api, behind
 *             Cloudflare Access for EMAIL_DOMAIN — see cloudflare/Site.ts
 *   Library   the Durable Object holding the team's library, live over
 *             WebSockets — see cloudflare/Library.ts
 *   Pin       the One-time PIN login: Access emails a code to the address
 *             you enter, so anyone at the domain signs in with no other
 *             account
 *
 *   pnpm cf:dev       local (stage dev_$USER), with a signed-in dev user
 *   pnpm cf:deploy    build the page, then deploy stage `prod` — the one
 *                     site everyone uses, whoever deploys it
 *   pnpm cf:destroy   remove `prod`
 */
export default Alchemy.Stack(
  "LiferayMarketingAssets",
  {
    providers: Cloudflare.providers(),
    // Kept in the Cloudflare account, so anyone who deploys shares it.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // Cloudflare allows one One-time PIN login per account, so only `prod`
    // owns it — local dev simulates the sign-in and needs none. If the
    // account already has one, Alchemy finds it and asks before adopting it.
    if ((yield* Alchemy.Stage) === "prod") {
      yield* Cloudflare.Access.IdentityProvider("Pin", { type: "onetimepin" });
    }
    const site = yield* Site;
    return { url: site.url };
  }),
);
