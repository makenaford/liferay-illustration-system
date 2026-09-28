import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * TRANSLATION — the two things a translated export needs from the Worker.
 *
 *   POST /api/translate   { to, strings }  ->  { translations }
 *   GET  /api/font?weight=&text=           ->  woff2 (Noto Sans JP)
 *
 * `translate` is a first draft for a person to review — the builder shows
 * every string beside its translation before anything downloads. The model
 * is gpt-oss-120b: tried on the illustrations' own copy beside Llama 3.3 70B
 * and Gemma 4 26B, it was the only one to get both languages right ("every 3
 * weeks", "Deploy Cadence") and the fastest. A reply that does not keep the
 * order and count of the strings it was given is refused.
 *
 * `font` exists because Source Sans 3 has no Japanese. An exported SVG has
 * to embed the glyphs it draws, and Google Fonts cuts a face down to exactly
 * the characters asked for (`text=`), so a Japanese export carries a few KB
 * per weight rather than a 5 MB font. Fetched here rather than by the page
 * so the viewer's browser never calls a third party, and cached at the edge.
 */

export const Lang = Schema.Literals(["ja", "es"]);
export type Lang = typeof Lang.Type;

export const TranslateRequest = Schema.Struct({
  to: Lang,
  strings: Schema.Array(Schema.String).check(Schema.isMaxLength(400)),
});
export const decodeTranslateRequest = Schema.decodeUnknownEffect(TranslateRequest);

const LANGUAGE_NAME: Record<Lang, string> = { ja: "Japanese", es: "Spanish (neutral, for Spain and Latin America)" };

export const MODEL = "@cf/openai/gpt-oss-120b";
/** Strings per model call — small enough that a reply keeps its count. */
const BATCH = 40;

export class TranslateError extends Data.TaggedError("TranslateError")<{ message: string }> {}

const Reply = Schema.Struct({ translations: Schema.Array(Schema.String) });
const decodeReply = Schema.decodeUnknownEffect(Reply);

const system = (to: Lang) =>
  [
    `You translate the on-screen copy of B2B software marketing illustrations from English into ${LANGUAGE_NAME[to]}.`,
    "The strings are UI labels, headings, button text, chart labels and short messages in a product mockup.",
    "Keep each one about as short as the original: it has to fit the same space.",
    "Keep product and brand names (Liferay, DXP, AI, API, SSO, ...), numbers, currency, percentages and units exactly as they are.",
    "Follow the target language's own capitalisation conventions, not English title case.",
    'Reply with JSON {"translations": [...]}: one translation per input string, in the same order, the same count.',
  ].join(" ");

/** One Workers AI call — the binding's `run`, loosened to this module's one model. */
export type Run<R> = (model: string, inputs: Record<string, unknown>) => Effect.Effect<unknown, unknown, R>;

/** Translate `strings` into `to`, in order. */
export const translate = <R>(run: Run<R>, to: Lang, strings: readonly string[]) =>
  Effect.gen(function* () {
    const out: string[] = [];
    for (let i = 0; i < strings.length; i += BATCH) {
      const batch = strings.slice(i, i + BATCH);
      const result = yield* run(MODEL, {
        messages: [
          { role: "system", content: system(to) },
          { role: "user", content: JSON.stringify({ strings: batch }) },
        ],
        max_tokens: 4096,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: { translations: { type: "array", items: { type: "string" } } },
            required: ["translations"],
          },
        },
      }).pipe(Effect.mapError((e) => new TranslateError({ message: `Workers AI: ${String((e as Error)?.message ?? e)}` })));

      // JSON mode hands back the object itself, other replies a string —
      // under `response`, or OpenAI-style under `choices` — maybe fenced.
      const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
      const response = r.response ?? r.choices?.[0]?.message?.content;
      const parsed =
        typeof response === "string"
          ? yield* Effect.try(() => JSON.parse(response.replace(/^\s*```(?:json)?|```\s*$/g, "")) as unknown).pipe(
              Effect.orElseSucceed(() => null),
            )
          : response;
      const reply = yield* decodeReply(parsed).pipe(
        Effect.mapError(() => new TranslateError({ message: "The model's reply was not a list of translations." })),
      );
      if (reply.translations.length !== batch.length) {
        return yield* new TranslateError({
          message: `The model returned ${reply.translations.length} translations for ${batch.length} strings.`,
        });
      }
      out.push(...reply.translations);
    }
    return out;
  });

/* ---- font ---------------------------------------------------------------- */

export const FONT_WEIGHTS = [400, 600, 700] as const;
/** Google Fonts serves woff2 only to a browser that says it takes it. */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/**
 * Noto Sans JP at `weight`, cut to the characters in `text`, as woff2 bytes.
 * Cached by the request URL, so the same export is fetched from Google once.
 */
export const notoSansJp = (weight: number, text: string) =>
  Effect.tryPromise({
    try: async () => {
      const chars = [...new Set(text)].sort().join("");
      const css = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(chars)}`;
      const cache = (caches as unknown as { default: Cache }).default;
      const key = new Request(css);
      const hit = await cache.match(key);
      if (hit) return hit.arrayBuffer();

      const sheet = await fetch(css, { headers: { "user-agent": UA } });
      if (!sheet.ok) throw new Error(`Google Fonts answered ${sheet.status}`);
      const src = /url\((https:[^)]+)\)\s*format\(['"]woff2['"]\)/.exec(await sheet.text())?.[1];
      if (!src) throw new Error("Google Fonts sent no woff2");
      const font = await fetch(src);
      if (!font.ok) throw new Error(`Google Fonts answered ${font.status}`);
      const bytes = await font.arrayBuffer();
      await cache.put(
        key,
        new Response(bytes, { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000" } }),
      );
      return bytes;
    },
    catch: (e) => new TranslateError({ message: `Font: ${(e as Error).message}` }),
  });
