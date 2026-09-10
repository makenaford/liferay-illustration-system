# Illustration system

All nine marketing illustrations rebuilt as **token-driven JSON documents**,
each rendering to dark and light SVG from one source.

```bash
npm install
npm run build:svg    # render all nine illustrations, both themes
npm run dev          # the editor, at http://localhost:5273
open out/compare.html
```

Requires Node 22+ (the scripts use native TypeScript type-stripping).

**The generators read the design system.** `npm run tokens` and
`npm run icons` pull from `liferay-sites-design-system`, expected as a sibling
checkout. Point `SDS_PATH` elsewhere if yours lives somewhere else:

```bash
SDS_PATH=~/work/liferay-sites-design-system npm run tokens
```

Neither is needed to build — the generated files are committed — but they are
how you pick up a change to the design file.

`reference/` holds the nine original Figma exports (44 MB, two of them 21 MB
each). They are kept because `out/compare.html` renders against them, so the
port stays verifiable; move them to LFS or drop them if the repo weight
matters more.

## Results

| | Originals | Rebuilt |
|---|---|---|
| Total size | **43.8 MB** (dark only) | **349 KB** (dark + light) |
| Source of truth | 43.8 MB of exports | **32 KB** of JSON |
| `<text>` nodes | 0 | 132 |
| Embedded base64 rasters | 7 (~33 MB) | 0 |
| `foreignObject` / `backdrop-filter` | 45 / 23 | 0 / 0 |
| Themes per document | 1 | 2 |

Per illustration:

| Illustration | Original | Rebuilt (dark) | Document | `<text>` |
|---|---|---|---|---|
| Deploy Daily with Zero Downtime | 98.8 KB | 16.5 KB | 3.4 KB | 0 → 9 |
| Drive B2B Revenue with 24/7 Self-Serve Commerce | 775.2 KB | 24.8 KB | 3.8 KB | 0 → 19 |
| Drive Conversions with Tailored Experiences | 118.9 KB | 16.8 KB | 3.0 KB | 0 → 9 |
| Group 1000006504 | 673.3 KB | 27.0 KB | 4.6 KB | 0 → 25 |
| Integrate All Systems | 196.4 KB | 26.8 KB | 4.0 KB | 0 → 21 |
| Launch Campaigns Across Channels Faster | **21.2 MB** | 9.9 KB | 1.8 KB | 0 → 8 |
| Secure Access & Simplify Compliance | 147.4 KB | 14.5 KB | 4.6 KB | 0 → 15 |
| Slash Tech Debt & Software Costs | **21.3 MB** | 12.5 KB | 2.7 KB | 0 → 4 |
| Turn Analytics into Immediate Action | 370.4 KB | 29.9 KB | 4.2 KB | 0 → 22 |

## What's in here

```
src/tokens.ts              Dark + light token sets. The only place theme lives.
src/vsvg.ts                Virtual-SVG layer + id namespacing
src/document.ts            Document schema — what the editor saves
src/render.ts              Element dispatcher + renderDocument(doc, theme)
src/icons.ts               29 stroke icons (UI furniture inside the artwork)
src/glassIcons.generated.ts 19 design-system glass icons, both themes
src/palette.generated.ts   95 colour tokens per scheme, from the Figma export
src/fontMetrics.generated.ts Source Sans 3 advance widths, measured
src/autolayout.ts          the reflow engine + measurement
src/primitives/            21 primitives
docs/*.json                Nine illustrations, 32 KB total
scripts/build.ts           Renders both themes + the comparison page
scripts/extract.ts         Geometry extractor for the original exports (authoring aid)
reference/                 The original Figma exports
out/                       Generated: 18 SVGs + compare.html
```

**The 21 primitives**, in rough order of how much reuse they carry:

`ProgressRow` · `SubCard` · `Text` · `Badge` · `Button` · `GlassPanel` ·
`IconTile` · `Stage` · `SkeletonBar` · `Avatar` · `LineChart` · `WindowChrome` ·
`InputField` · `Pill` · `BarChart` · `MapDots` · `Toggle` · `Connector` ·
`IconGrid` · `StatBlock` · `Arrow`

## What porting all nine actually taught us

The spike proved the architecture. Porting is what found the bugs in it. Six
things changed, and they're the reason this was worth doing before building an
editor:

**1. There are no "scenes."** The spike had a `scene` union — `SinglePanel`,
`TwoUp`, `HubSpoke`, `BeforeAfter`. All four turned out to be the same stage
with a different number of glass panels. `panels` is now just an array, and
`layout` is descriptive metadata for a template picker rather than a renderer
branch. Four planned scene implementations collapsed into one array field.

**2. SVG ids must be namespaced per document, not per render.** The comparison
page grew a hard-edged rectangle across one illustration that vanished when
rendered alone: two inlined SVGs both had `wash-1`, and the second one's
gradients silently repainted the first. A per-render counter isn't enough —
SVG ids are global to the host page. Any marketing page showing two of these
would have hit it. Ids are now seeded with document id + theme; all 354 ids
across the 18 outputs are unique.

**3. Glow blur is a per-illustration property, not a token.** Eight references
blur the ambient bloom at 100px; Deploy Daily uses 60. Hardcoding 60 washed out
every new illustration with a bright blue haze. It's a composition choice and
now lives on each glow in the document.

**4. Light mode needed two fixes the single-illustration spike couldn't
surface.** A white "glass" button on a white card is invisible, and so is a
white card on a white stage. Both needed a tinted value (`#EFF3FA`) rather than
white. You only see this class of bug once several illustrations share a theme.

**5. `Button` needed left alignment.** Every CTA is centred; every segment
header is a left-aligned icon + label row. Without an `align` prop they'd have
had to be two primitives that must stay visually identical forever.

**6. Two primitives were missing entirely** once real content arrived: a soft
accent `SubCard` variant (the highlighted chat bubble) and a `success`-toned
chart series (the AI visibility line).

The token model itself held. No illustration needed a colour outside the token
set, which is the result that matters most.

## Three decisions this locks in

**Text is real `<text>`.** The exports had zero text nodes — every string
outlined, 739 paths in the analytics illustration alone. 132 live text nodes
now. Copy is editable, translatable, searchable, and re-themable.

**Glass is a gradient, not a backdrop filter.** Figma exports the frosted
panels as `<foreignObject>` + CSS `backdrop-filter` (45 and 23 occurrences
across the set), which renders in Chrome and silently fails in Safari, Firefox,
and every SVG rasteriser — so today's PNG exports don't match what designers
approve. The rebuilt recipe renders identically everywhere.

**Charts and maps follow data.** Curves come from number arrays via monotone
cubic interpolation; bars from values; the dotted world map is procedural. In
the originals all three are frozen geometry.

## The type scale

Nine sizes, from `tokens/figma/typography.desktop.tokens.json` multiplied by
**0.45** — an illustration depicts an interface at roughly that fraction of
page scale, and the factor comes from the hero title measuring 16.5px against
the design system's 37px `Heading F1`. So the ladder is the site's ladder, not
a parallel invention.

| Step | Design system source | Size |
|---|---|---|
| `display` | Display Sm | 19.4 |
| `title` | Heading F1 | 16.7 |
| `heading` | Heading F3 | 12.6 |
| `subheading` | Heading F4 | 10.8 |
| `body` | Paragraph Large | 9.5 |
| `bodySmall` | Heading F5 | 8.1 |
| `caption` | Paragraph Base | 7.2 |
| `label` | Paragraph Small | 5.9 |
| `micro` | Paragraph X-Small | 5.0 |

This replaced **seventeen ad-hoc roles** that conflated three independent
things — size, weight and colour. `metricXL` and `tileValue` differed only in
weight. `sectionTitle` and `labelSmall` were the same size under two names.
`micro` and `rowLabel` were 0.4px apart. Splitting the axes leaves nine steps a
designer can hold in their head, with `weight` and `tone` as separate props.

**Badges now hug their label.** Migrating the scale grew text about 3%, and six
badges with pinned widths clipped. A badge is a label, and a label is as wide
as its text — the design system's `Label` hugs too — so `width` is optional and
omitting it measures. That removes the whole class of bug rather than widening
six numbers.

## Overriding a style

There is still no hex input anywhere. What `tone` now accepts is **any key in
the generated palette**, not just the nine semantic tones — so a designer who
needs `brand-primary-darken-3` for one label can have it, and it still resolves
per theme, still comes from the design file, and still cannot be an arbitrary
colour. Overriding stays inside the system.

The editor makes that usable: a dropdown of names like
`brand-primary-darken-3` is unusable, so every entry carries a **swatch and its
hex**, resolved in the theme currently being viewed. Semantic tones sit above
the raw palette because those are what a document should normally say.

## Tokens are generated, not copied

Two layers, the same split the design system itself uses:

```
palette.generated.ts   the RAW palette — 95 tokens per scheme, generated from
                       tokens/figma/color.*.tokens.json by `npm run tokens`.
                       Aliases resolved, sub-1 alphas rendered as rgba().
                       Never hand-edited.
tokens.ts              the SEMANTIC layer — what a stage, a card edge or a
                       chart series is MADE of, as references into that palette.
```

Key names match the design system's own generated names exactly, so any value
can be traced across the two repos by grep. Every hex that remains in
`tokens.ts` is from the `Components/*` group — the one colour group Figma has
not exported, which the design system also keeps as literals in
`cssVariables.ts` — and each one says where it came from.

This closes the drift risk: previously every value was transcribed by eye and
nothing would have reported it when the design file moved one. A renamed token
now throws at build time rather than rendering the wrong colour.

`SPACE` and `RADIUS` come from `spacing.tokens.json` and `radius.tokens.json`
the same way.

Sources, for auditing:

| What | Where |
|---|---|
| Surfaces, text, accents, status | `tokens/figma/color.*.tokens.json` → generated |
| Spacing and radius scales | `tokens/figma/{spacing,radius}.tokens.json` |
| Ambient bloom colours | `tokens/figma/color.gradient-card.*.tokens.json` |
| The glass recipe | `src/theme/cssVariables.ts` |
| How glass composites | `src/theme/components.module.css` → `.cardRoot[data-surface='glass']` |
| Typeface | `src/theme/theme.ts` |

**The glass recipe, as the site draws it** — and now as the illustrations do:

```
fill      linear-gradient(60deg,  Glass Step 01 0%, Glass Step 02 100%)
hairline  linear-gradient(225deg, Glass Line 01 1%, Glass Line 02 92%)   1px
blur      backdrop-filter: blur(50px)        (Figma BACKGROUND_BLUR 100)
elevation inset 0 1px 0 lit-edge, then two cast-shadow layers
```

| Token | Light | Dark |
|---|---|---|
| Glass Step 01 | `#ADC9FF` @ 10% | `#FFFFFF` @ 5.5% |
| Glass Step 02 | `#8C96A9` @ 3% | *same* |
| Glass Line 01 / 02 | `#6FA0FF` @ 60% / 40% | `#FFFFFF` @ 16% / 12% |
| Lit top edge | *none* | `#FFFFFF` @ 10% |
| Cast shadow | `rgba(16,24,40,.08)` + `.06` | `rgba(0,0,0,.28)` + `.22` |
| Page ground | `#FBFCFE` | `#070B13` |
| Card BG / Grey | `#F4F6FB` | `#0F131B` |
| Card BG / Translucent | `#FFFFFF` @ 10% | **identical** |

**Where I had been wrong.** I'd built light mode as *opaque* white cards with
real shadows, on the reasoning that translucency over a pale ground reads as
grey haze. The design system says otherwise, and it's right: light glass is
translucent exactly like dark, and `Surfaces/Card BG/Translucent` is white at
10% in **both** themes. The material doesn't change between themes — only its
tint and its elevation cue do. Light tints the sheen and the hairline brand
blue and leans on a real cast shadow; dark tints them white and raises the card
with a lit top edge instead. That is why light glass doesn't turn to haze: the
sheen carries the blue, not plain white.

My other light-mode guesses were also off, and are now replaced with the real
values: success `#00873D` → **`#0C8104`**, info/aqua `#007D7A` → **`#00E0DC`**,
text `#020812` → **`#262C37`**.

**The light background is the design system's mesh.** Three radial blooms
transcribed from the `highlighted` card (`[data-tone='blue']`): `Brand/Primary`
from the leading corner at 34%, `Lighten 1` answering from the trailing top at
26%, and a wider, fainter `Brand/Primary` rising from the bottom edge. The
corners carry the colour and the middle stays clean — which is what makes a
mesh rather than a wash, and it means copy can sit on the centre. Dark keeps
the blurred-ellipse bloom the original artwork was drawn with.

**Component recipes** are transcribed from `componentTokens()` in
`src/theme/cssVariables.ts` and the component rules in
`components.module.css`:

| Element | Design system source | What it draws |
|---|---|---|
| `Button` outline | `Components/Button Outline` | Vertical sheen fading to nothing, solid brand hairline, `Action/Link` blue text, and a 6px ambient glow |
| `Button` gradient | `GradientText` / gradient Label | The **brand gradient** — see the warning below |
| `Badge` tonal | `Label Style=Filled` | `lab-tonal-bg` under `lab-tonal-text`, no hairline |
| `Badge` ring | `Chip State=Default` | Transparent, 1px 135° `outline-line → Primary Blue Accent` ring |
| `Badge` gradient | `Label Style=Gradient` | Transparent, 1px brand-to-accent ring corner to corner |
| `Badge` glass | `Label Style=Glass` | `Card BG/Translucent`, no hairline |
| `Pill` | `Components/Label` | Solid, glass or status fill — the file binds no stroke to these |

**⚠️ The brand gradient is blue → PURPLE, not blue → cyan.** `GradientText`
uses `Brand/Primary/Lighten/1 → Accent/Product Accent`, and the gradient Label
uses `Brand/Primary → Accent/Product Accent`. The illustrations were drawn with
blue → cyan, so every gradient CTA has visibly changed colour ("Unified
Platform", "Exclusive Tailored Offer!", "Publish"). This follows the design
system, but it is the most visible single change in the whole port and someone
should confirm it is wanted rather than discover it.

`accent.gradient` stays blue/aqua and is kept separate, because it paints
*data* — chart bars, connectors — rather than brand moments.

**The four card surfaces** map one-to-one onto `SubCard`'s variants:

| `SubCard` variant | Site surface | What it means |
|---|---|---|
| `sheen` | `glass` | Translucent sheen, hairline, frosted backdrop |
| `flat` | `static` | Opaque `Card BG/Grey`, third-strength edge |
| `accent` | `highlighted` | `Card BG/Blue` — the one card that matters more |
| `sunken` | *no analogue* | A recessed well for inputs and log rows |

**One rule I have deliberately not followed.** The site says a non-interactive
card uses `static`, never `glass` — glass exists to carry the interaction. In
the illustrations every inner tile is drawn with the glass sheen, because these
are *depictions* of an interface rather than a live one, and nothing in them is
clickable. Worth a designer's ruling: follow the artwork, or follow the rule and
make dashboard tiles opaque grey.

## Fidelity notes

These are structurally faithful ports, not pixel traces. Deliberate deltas:

- **Third-party logos are gone, on purpose.** The original "Integrate All
  Systems" draws the actual SAP and Salesforce marks. The rebuild uses Liferay's
  own glass icons (`Data/Database`, `General/Personalization`) instead:
  trademarks shouldn't be redrawn into a component library, and the design
  system's icons are what the site would use anyway.
- **Third-party logos are avatar slots.** SAP and Salesforce marks in
  "Integrate All Systems" are `Avatar` initials placeholders. Trademarks
  shouldn't be re-drawn into a component library; they belong in an external
  asset slot.
- **The dotted world map is procedural**, from nine overlapping ellipses
  standing in for landmasses. At ~140px wide it reads as "world"; it is not
  geographic data.
- **Chart data is eyeballed** from the frozen curves in the originals. The
  shapes match; the numbers are invented because the originals contain no data.
- **Type sizes** in `TYPE_ROLES` are reconstructed from measured cap heights,
  since outlined text gave nothing to read. Expect small discrepancies until
  they're checked against the Figma text styles.
- **Dark mode moved to match the site**, which changes it visibly from the
  original exports: the ground is `#070B13` rather than `#020812`, and glass is
  a much lighter material (5.5% white, not 40%) with a 16% hairline rather than
  a 100% one. Panels read more subtly than the shipped artwork as a result.
  This is the design system's call, not mine — but it is a real change, and if
  the artwork is meant to stay heavier than the site's cards, that is a
  deliberate divergence someone should sign off rather than something to fix
  quietly in tokens.

## Glass icons come from the design system

The five spot glyphs I had hand-drawn are deleted. `SpotIcon` now renders the
design system's real glass icons, imported by `npm run icons` from
`assets/glass-icons/` (dark) and `assets/glass-icons-light/` (light).

These are **genuinely separate artwork per theme, not a recolour** — the dark
version is lit from inside, the light one from outside — which is the only
honest way to theme illustration this rich, and is exactly the model this
library needed.

| Illustration | Glass icon | Source |
|---|---|---|
| Deploy Daily | `dashboard` | `Business/Dashboard` |
| Drive Conversions | `personalization` | `General/Personalization` |
| Secure Access | `compliance` | `Security/Security & Compliance` |
| Slash Tech Debt — before | `costly` | `Business/Costly` |
| Slash Tech Debt — after | `composable` | `General/Composable` |
| Launch Campaigns | `campaigns` | `Product Modules/Content Marketing Platform` |
| Integrate All Systems | `dxp`, `database`, `pim`, `personalization`, `commerce`, `security` | hub + five nodes |

`out/glass-icon-sheet.html` is a contact sheet of all 19 in both themes.

**Four things the importer has to fix** (`scripts/build-glass-icons.ts`):

1. **Ids.** Figma names them `paint0_linear_65_14547`. Every id is rewritten
   with a `__NS__` placeholder that the renderer swaps for a per-instance
   namespace — so the same icon can appear twice on a page, or in two documents
   inlined side by side, without its gradients colliding. A fixed prefix would
   have been *almost* enough; this project has already been bitten by that
   exact bug once.
2. **`foreignObject` + `backdrop-filter`.** The icons carry the same
   non-portable hack the illustrations did. Stripped — the `<g filter>`
   underneath still draws the shape and its shadows, so the loss is a 3px blur
   behind a 30%-opacity rect, and the icons now rasterise.
3. **viewBox.** Every icon has its own bleed (`-2 -8 74 74`, `-9 -2 76 76` …),
   so each one's box is recorded and mapped onto the requested size.
4. **Light coverage.** Only **34 of the 165** icons have a light variant.
   Missing ones fall back to the dark artwork, flagged per-entry as
   `lightIsFallback` and labelled in the editor's picker as "no light variant"
   — so the gap is visible when picking, not discovered after export.

`Business/Costly` is the one icon in the working set with no light variant, and
you can see it in the comparison: on the light "BEFORE" panel the piggy bank is
dark artwork, visibly less crisp than `composable` beside it. **Getting the
remaining 131 light variants drawn is the blocker on every illustration
shipping a light version with real spot artwork.**

## The surface set

Eight surfaces, as token data rather than branches inside a primitive. Three
glass elevations plus five specials:

| Surface | What it is |
|---|---|
| `glass1` | Nested tile. No shadow — it is inset, not floating. |
| `glass2` | The default card. The design system's shipped glass, exactly. |
| `glass3` | Floating over the composition: an overlay, a callout. |
| `highlighted` | The one card that matters more — **lit blue rather than brighter**: a blue cast shadow and a blue lit edge instead of a black shadow. |
| `gradient` | **`Blue Gradient`, sampled from Figma.** Solid, not glass. |
| `solid` | Opaque brand blue, for a callout that is an action. |
| `outline` | Structure without weight — hairline only, no fill. |
| `sunken` | Cut *into* its parent: inputs, log rows, wells. |

The three glass steps differ only in **how much light they catch** — fill
opacity, hairline strength, shadow depth and lit edge all rise together,
because that is what reads as "further forward" rather than as a different
material. All of them are still `Glass Step 01/02` and `Glass Line 01/02`:
`glass2` is the shipped value, and 1 and 3 step down and up from it.

**`gradient` is sampled, not invented.** It comes from node `268:7322` in the
Marketing UI Assets Repo — the "0 OPEN VULNERABILITIES" card. Reading the
render back pixel by pixel: it holds `#0b5fff`, which is `Brand/Primary`
*exactly*, for the first ~35% of a ~70° axis, then ramps to `#17aff1`, which is
`Accent/Cyan`. So the gradient turned out to be two tokens the palette already
has, and both ends are bound to them rather than to the sampled hexes — which
means light picks up its own `Accent/Cyan` (`#0e98e2`, deeper, so it holds
against a pale ground) for free.

It is **solid**: a fill, not glass. No backdrop blur, no hairline. That is the
whole difference from the glass surfaces, and it is why the card reads as a
block of colour rather than as a pane.

Note this is a different gradient from `brandGradient` (blue → purple), which
is what `GradientText` and the gradient `Label` use. One paints a surface, the
other paints brand moments; they are not interchangeable and are kept apart.

`highlighted` is worth calling out. The obvious way to emphasise a card is to
make it brighter, which makes it look like a *different* material sitting
among its neighbours. Casting its shadow in brand blue instead of black raises
it by colour, so it stays the same glass and still pulls the eye.

`npm run surfaces` renders the specimen sheet in both themes.

### Applied across the nine illustrations

`npm run surface-pass` assigns a surface by what a card **does**, not one by
one:

| Role | Surface | Count |
|---|---|---|
| Hero panel | `glass2` | 11 |
| Tile on a panel, or a card inside a card | `glass1` | 28 |
| Card overlapping its siblings — it floats over them | `glass3` | 4 |
| Stroke-only in the original export | `outline` | 1 |
| Sampled `Blue Gradient` | `gradient` | 1 |
| The focal card of its illustration | `highlighted` | 1 |

The floating test is the useful part: a root-level card is `glass3` if it
overlaps something drawn before it. That found exactly the overlays — "Order
Confirmed", "AI Source Breakdown", the segmentation panel, the two cards
sitting over the traffic chart — without anyone listing them.

Two were set by hand, because no structural rule could know them: the b2b
price table (`outline` — the original drew it as a stroke with no fill) and
the AI Source Breakdown overlay (`highlighted` — it is the card that
illustration is named for).

`solid` and `sunken` are not used at card level. `sunken` is what `InputField`
draws through, and the solid callouts in these illustrations are buttons
rather than cards. Both stay in the set because they are part of the ladder,
not because every illustration happens to need them.

This also collapsed a duplication: `GlassPanel` and `SubCard` each carried
their own copy of the glass recipe, so eight surfaces would have meant eight
branches across two files. Both are now thin wrappers over one `Surface`
primitive that paints whatever spec it is handed. Adding a surface is a token
entry.

## Cards reflow

Cards can carry a `layout` spec and position their own children — flexbox's
model, which is also Figma's auto-layout, so it is the one a designer already
has. Direction, gap, padding, cross-axis `align`, main-axis `justify`, per-child
`grow` and `alignSelf`, and `hugWidth`/`hugHeight` to shrink a container to its
content. Nested containers resolve inside-out.

`resolveLayout` is a document → document transform applied before rendering,
not something the renderer does inline. That matters for the editor: it renders
the resolved document **and measures selection bounds from it**, so the
selection box lands where an element actually is rather than on the stale
coordinates still in the source.

**Rows align on the baseline.** `align: 'baseline'` puts every child's first
text baseline on one line, which is what makes a row of mixed type look right:
a 16.7px title beside a 5px caption aligned by box tops leaves the caption
floating, and by box bottoms leaves it hanging. Measured on a real row, `start`
scatters three labels across 8px and `baseline` puts all three on 21.89.
Children with no text — an icon, an avatar — centre on the row instead of being
dragged to an arbitrary line. Six rows across the nine documents are now pinned
to it; three were left alone because their baselines differ deliberately.

**Text measurement is the part that had to be solved first.** Layout has to
know how wide a string is, and it has to get the same answer in the Node build
as in the browser editor — otherwise an exported SVG disagrees with the canvas
it was composed on. Measuring at runtime only works in the browser; guessing at
an average character width is off by 10–20% on real labels, which is enough to
break an alignment. So the real advance widths for Source Sans 3 were measured
once with `canvas.measureText` and embedded as
`fontMetrics.generated.ts` — 400/600/700, verified against `measureText` on
real strings from the illustrations at **under 1% error**, which is rounding in
the 3dp table.

### Nested containers

A one-dimensional flow cannot express "a title on the left with two icons on
the right". A column of rows can — so `npm run nest` decomposes each card with
a **guillotine partition**: find horizontal cut lines no child straddles (a
vertical flow of bands), else vertical ones (a horizontal flow of columns), and
recurse. Each intermediate becomes a `group` — a container that draws nothing
and only positions.

**All 34 cards now reflow. None are left absolute**, and 18 groups carry the
two-dimensional structure.

Three things the partition needs beyond the basic algorithm:

- **Split at the largest gap when gaps vary.** A flow has ONE gap, so
  "Title ......... icon icon" is not a three-column row with a 66px gap; it is
  a title and an icon pair, far apart. Splitting there and recursing recovers
  the real structure.
- **Absorb arbitrary offsets into padding.** A status row sitting 29px in from
  a card's edge is neither start, centre nor end. Flex still expresses it
  exactly: widen the group to the full extent and push its contents across with
  padding. Only a group can absorb this — a leaf has no padding of its own.
- **Never stretch a leaf.** `stretch` resizes, which is right for a group and
  wrong for an element: it turned a 96px outline button into a 174px one and
  moved its centred label 39px.

`npm run flatten` is the inverse — it bakes computed positions back to absolute
and dissolves the groups, so the conversion round-trips instead of being
one-way. That is also what made developing the converter possible.

### The earlier one-dimensional pass

`npm run autolayout` handles the simpler case — a card that is already a single
stack — and is what `nest` falls back on conceptually.

Two things had to be true before a card converted (both still apply to `nest`):

1. **No two children share a band along the flow axis.** A one-dimensional flow
   cannot express a check icon sitting *beside* its caption, and flattening one
   into a stack silently restructures the design. Drift alone missed this — a
   tight side-by-side pair scores a small error — so the test is direct overlap,
   using each element's true box. That is not its `x`/`y`: text `y` is a
   *baseline*, and a labelled progress row draws *above* its origin. Getting
   that wrong was a real bug, and it showed up as a section title colliding with
   the first row beneath it.
2. **The move stays under 20px.** The nine documents were hand-placed, so their
   gaps vary — a stat tile runs 18 / 10 / 8 between its four rows. A single-gap
   flow cannot reproduce that, so converting always moves something;
   **normalising the rhythm is the point**. The measured drift splits cleanly
   into two populations: genuine stacks all land under 15px, two-dimensional
   cards are 32px and up. 20 sits in the gap.

Cards that resist both passes are listed by name when the script runs. The
editor's **Auto layout** button converts any card on demand, and **detach**
bakes the computed positions back and removes the spec.

### Three bugs worth recording

Each of these reported success while being wrong, which is the dangerous kind:

1. **The drift check compared nothing.** It re-stamped identity tags on one
   side, so no key ever matched, the comparison loop never ran, and every card
   reported "exact" while text moved up to 34px. A verification step that can
   silently pass is worse than none.
2. **Comparing leaves by list order.** Nesting *reorders* leaves — grouping a
   title with the icons beside it moves both ahead of a caption that used to
   sit between them — so an order-based diff compares unrelated elements and
   reports a huge phantom drift. Identity is the only safe key.
3. **Snapping every gap to the spacing scale.** The scale tops out at 80, so
   the 104px between a table's name and price columns became 80 and threw the
   header 34px out of place. A gap that large is layout geometry, not a
   spacing token, so it is now kept unless it lands within 3px of a step.

A fourth was mine, in the repair tooling rather than the converter: matching
elements **by their label text** meant four node cards that all read
"Last Sync 2s Ago" got one card's coordinates written into all of them. Keys
have to be unique, and a visible string is not.

## One canvas

All nine export at **560 × 372**, so they drop into the same slot.

Two were not: `ai-visibility-dashboard` was drawn at 578 × 386 and
`integrate-all-systems` at 860 × 571 — three different aspect ratios across
the set.

Rewriting their coordinates was the wrong fix. Scaling `integrate-all-systems`
by 0.651 would have put every coordinate off the 2px grid, and snapping them
back means up to 1px of error each — enough to undo the alignment those
documents had just been corrected to. Type is worse: sizes come from a
nine-step scale, so a 65% layout with 100% text is a redesign, not a resize.

So the artboard is kept and the drawing is scaled to fit the canvas on the way
out — uniformly, and centred. `Doc.artboard` holds the space the elements are
authored in; `Doc.canvas` is what the SVG exports at. Absent means they are the
same, which is the case for the other seven, and those seven emit no wrapper
element at all, so their output is unchanged.

| | Artboard | Canvas | Scale |
|---|---|---|---|
| `ai-visibility-dashboard` | 578 × 386 | 560 × 372 | 96.4% |
| `integrate-all-systems` | 860 × 571 | 560 × 372 | 65.1% |
| the other seven | — | 560 × 372 | 1:1 |

Nothing is lost: it is vector output, and `integrate-all-systems` was already
being *displayed* at the same width as the others, so its text was already
effectively smaller. The scale makes the file say what the page was already
doing.

A contain-fit can leave a gutter where the aspect ratios do not match exactly
— `ai-visibility-dashboard` draws 557.04px wide inside 560. It does not,
because `Stage` overscans for the glows: rendering both illustrations over
magenta and counting the pixels gives **zero** in either theme.

The editor works in artboard units — elements, grid, selection and drag all
share one coordinate system, and only the export scales. The Document panel
names the artboard and offers **Export 1:1** to drop it.

## The conformance audit

`npm run audit` checks the nine documents against the system and reports
without fixing anything, because most findings are judgement calls: a 6px gap
is off-scale but might be deliberate. It checks:

- **surface** — every card and subCard names a surface that exists in the set,
  and no legacy `variant` alias survives
- **off-grid** — authored coordinates and sizes are multiples of the 2px base
  unit. Children of an auto-layout container are exempt on the axes they do
  not own, and a hugged axis is measured rather than authored, so the grid
  does not apply to it
- **gap / padding off-scale** — spacing that is not a step on the scale
- **overflow** — a child drawn outside the box that contains it
- **row / column misalignment** — sibling panels whose tops, bottoms, or side
  edges nearly line up but do not

The last one needs a definition of "nearly", and getting it wrong makes the
report useless in both directions. It settled on: compare only panels (a
heading's right edge has no business lining up with a card's), ignore pairs
that are centre-aligned or stacked one over the other, and treat a difference
that is both ≥16px and exactly on the spacing scale as a deliberate stagger
rather than drift. Drift is the range where a mistake is invisible.

### What the first run found

**196 findings.** After the fixes below, **0**.

| Rule | Found | Resolution |
|---|---|---|
| Surface inconsistency | 31 | One rule, applied — see below |
| Off-grid sizes | 22 | `npm run snap:sizes` |
| Padding off-scale | 6 | Snapped to the nearest step |
| Column / row misalignment | 12 | 2 were real drift; the rest were centring, stacking or a deliberate stagger the check could not see |
| Overflow | 2 | One was a layout **bug**, below |
| Gap off-scale | 1 | The price table, rebuilt as a real table |

The other 145 were the checker's fault, not the documents': it was measuring
resolved coordinates, so every text baseline and hug height computed from font
metrics came back "off-grid". Fractional is what a measurement *is*. The check
now runs on authored values.

### The surface rule

Five illustrations drew their top-level panels on `glass1` — the *nested tile*
surface, which has no shadow — and three drew them on `glass3`, the *floating
overlay*. The same visual role, three different treatments, because the
documents were ported before the surface set existed.

`npm run surfaces:conform` replaces taste with depth:

| Position | Surface |
|---|---|
| Depth 0, resting on the stage | `glass2` — the default card |
| Depth 0, covering an *earlier* sibling | `glass3` — floating overlay |
| Depth 1+ | `glass1` — nested tile, no shadow |

Only the panel drawn on top is the overlay. Document order is paint order, so
"covers an earlier sibling" is the test; the first pass promoted both sides of
an overlap and turned base panels into overlays.

Surfaces chosen for *meaning* rather than elevation — `highlighted`,
`gradient`, `outline`, `sunken`, `solid` — are left alone. They are saying
something the depth rule cannot. 31 panels changed.

### A real layout bug, found by an overflow of 4.98px

`resolveLayout` resolved each child **before** placing it. A nested container
therefore laid its own children out around its authored `x`/`y`, and then
`placeAt` moved the container without moving what was inside it: the box
travelled and its contents stayed behind.

It was invisible because the box is invisible. It surfaced as one group
reported 4.98px outside its parent; the minimal repro put two icons at x=0 and
x=24 inside a group placed at x=65.97.

The fix is an ordering change — place first, resolve after; measuring never
needed resolved children — and it corrects every nested container in the set.

### The price table was not a table

The b2b contract-pricing table was four independent rows: a header with `gap:
114` and three body rows with `gap: 40`. The gap was the audit's off-scale
finding, but the gap was the symptom. Nothing made the header's columns land
above the body's, and they did not.

It is now four rows of the same width with `justify: 'between'`, so the first
column is flush left and the last flush right in every row, header included.

### Colour that was not tokenised

Eight literals were still painted by hand in the primitives — skeleton bars,
progress tracks, the toggle knob, the window-chrome dots, avatar placeholders,
map dots, the success chip's text. `#101828` in particular is **not in the
palette at all**: it is light mode's shadow ink, which tokens.ts already used
in nine places as a literal and the primitives were copying by eye.

It is now one named constant behind two semantic tokens:

- `neutral.ink` — the colour every decorative neutral tint is drawn from at
  low opacity (skeletons, tracks, grid lines, the `static` hairline, light
  mode's cast shadows). One token because those things must agree.
- `status.onStatus` — text on a filled status chip. Dark mode's success green
  is light enough that white text on it fails contrast, so this flips where
  `text.onAccent` (which sits on the much darker brand blue) does not.

No primitive contains a colour literal any more.

## The documents are on-grid

`npm run normalize` snaps every coordinate and size to the 2px base unit and
pulls each card's children onto a common left edge. It reports before it
writes; `--write` applies.

Run against the nine documents it moved **325 values, none by more than 1px** —
they were authored by reading coordinates off Figma exports, so they carried
values like `98.577` and `128.667` that nobody chose. Rendered output is
unchanged; this was pure cleanup. Every card inset it found (12px, 10px) was
already on the spacing scale.

It is deliberately conservative: a child is only pulled onto the modal left
edge if it is already within 3px of it, so a deliberate indent stays indented.

## Also worth knowing

Two typos have been sitting in shipped illustrations, invisible inside outlined
paths. Both are corrected in the documents:

- **"Deploy Cadece"** → "Deploy Cadence" (Deploy Daily)
- **"HIPPA"** → "HIPAA" (Secure Access) — a compliance badge with the
  compliance standard misspelled

This is the concrete argument for live text: no spellcheck, review, or search
could reach either one.

## Open questions

1. ~~**The typeface.**~~ **Resolved:** `src/theme/theme.ts` confirms
   `"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
   — the original guess was right, and the stack now matches exactly.
2. **Font strategy on export.** Ship the webfont alongside, subset and inline
   it as a data URI, or outline text at export only (keeping it live in the
   document)?
3. ~~**Token source of truth.**~~ **Resolved:** it is
   `liferay-sites-design-system`, and `tokens.ts` now mirrors it. The remaining
   question is whether to generate `tokens.ts` from that repo's token JSON in
   CI, rather than keeping a hand-mirrored copy that can drift.
4. **The `glass` vs `static` ruling** on non-interactive tiles (above).
5. **Is blue → purple right for the illustrations?** It is the brand gradient,
   but it changes every CTA in the set (above).
6. **Inputs have no tokens.** There is no `Components/Input` group and no input
   rules in `components.module.css` — Mantine's defaults carry it, so
   `InputField` is *derived* (the recessed surface plus the outline button's
   hairline at reduced strength) rather than transcribed. Worth tokenising in
   the design file.
7. **The 131 missing light glass icons** — needed before every illustration can
   ship a light variant with real spot artwork. 19 are wired; the working set
   is `MANIFEST` in `scripts/build-glass-icons.ts`, and adding one is a line.

## Next

1. Confirm the font and the light-mode direction; review the spot glyphs.
2. Wire `IconTile` to a real icon set instead of the hand-kept 29.
3. Then the editor: Vite + React, canvas rendered as live SVG, a `toReact`
   adapter over the same virtual-SVG tree, selection overlay, and a properties
   panel driven by the primitive prop types. The nine documents are the fixture
   set to build it against.

## Note on the virtual-SVG layer

Primitives return plain `{tag, attrs, children}` data rather than JSX. That
looks odd for a React app, but it means one renderer serves both targets:
`toSVGString` is the export path today, and a ~30-line `toReact` adapter
renders the identical tree as JSX in the editor. The alternative — JSX
primitives plus a separate serialiser — is two implementations of all 21
primitives that must agree pixel-for-pixel forever.

---

# The editor

A standalone web app for composing illustrations from the library.

```bash
npm run dev          # http://localhost:5273
npm run build:svg    # render all documents to out/*.svg
```

## The one rule it enforces

**Freeform placement, zero freeform creation.** Designers can drag, nudge,
resize, nest and reorder anything — but there is no rectangle tool, no pen, and
**no colour picker anywhere in the UI**. Every paint decision is a
`tone` / `variant` / `role` dropdown that resolves through tokens.

That's not a lint rule or a convention, it's the absence of a control. An
off-system colour physically cannot enter a document, which is what guarantees
every illustration themes correctly and stays on brand. It's also the honest
answer to "why not just use Figma?" — Figma will always win on freedom, so this
wins on systematised speed instead.

## What it does

| | |
|---|---|
| **Canvas** | The document rendered as live SVG in the DOM. What you drag *is* what you export — same renderer, no preview/output drift. |
| **Selection** | Click to select (including nested children), corner handles to resize, drag to move. Children move with their container. |
| **Grid** | Snap to 1/2/4/8px (default 2, the scale's base unit), a toggleable grid overlay, and `shift` to bypass. Nudge steps by the grid too. |
| **Colour tokens** | Every colour control is a picker showing the actual **swatch and hex**, resolved in the current theme — semantic tones first, then the whole design-system palette, searchable. |
| **Z-order** | Back / backward / forward / front, in the inspector and on `[` `]` / `⌘[` `⌘]`. Inside an auto-layout container the same control reorders the flow, and says so. |
| **Import** | Bring in an SVG or a raster from your computer, from the Library's *Import* button or from an `Image`/`Imported SVG` element's **File** field in the Inspector. SVGs are parsed, **sanitised** (`<script>` and inline handlers stripped), id-namespaced and inlined so they scale and export as one file. Rasters become data URIs, with a warning past 512 KB. An element with no file yet draws as a dashed box rather than nothing, so it stays visible and selectable. |
| **Auto layout** | Figma-shaped: a 3×3 alignment pad, `space between` / `stretch` / `baseline` toggles, gap and padding as one-click steps off the spacing scale (padding splits into vertical and horizontal), and Hug W/H. Per-child `grow` and `alignSelf`. Auto-placed children can't be dragged — their position is computed — so they reorder with arrows in Layers, which work at every depth. **detach** bakes positions back. |
| **Card layout** | For absolute cards: content box drawn as a guide, padding from the spacing scale, and actions over children — align left/centre/right, fit widths, distribute, stack at 4/8/12, snap subtree to grid. |
| **Clipboard** | ⌘C / ⌘X / ⌘V / ⌘D, plus buttons in the inspector. Works across documents and browser tabs; pasting into a different card preserves the element's offset *within* its card. |
| **Keyboard** | Arrows nudge 1px, shift-arrows 10px, shift-drag for sub-pixel, ⌫ delete, esc deselect, `t` theme, `o` outlines, ⌘Z / ⇧⌘Z. |
| **Inspector** | Generated entirely from `editor/schema.ts` — no per-element UI code. |
| **Document panel** | Canvas size, hero panels, and ambient glows (with a live blur slider). |
| **Layers** | The element tree, and the only place z-order changes. |
| **Library** | 21 primitives grouped by kind. Adding with a card selected nests inside it. |
| **Themes** | Toggle dark/light live; both render from the same document. |
| **Export** | Optimised SVG per theme, or the `.json` document. Editor metadata is stripped. |
| **Undo** | Full history. A drag coalesces into one step, not sixty. |
| **View** | ⌘scroll zoom, ⌥drag pan, zoom controls, and an outline overlay for debugging. |

## Architecture

```
editor/toReact.tsx    VNode -> JSX. The payoff of the virtual-SVG layer:
                      toSVGString exports, toReact renders the SAME tree.
editor/schema.ts      Field descriptors per element type -> generates Inspector
editor/state.ts       ~90-line store on useSyncExternalStore + undo stack
editor/clipboard.ts   copy / cut / paste / duplicate, two clipboards
editor/grid.ts        snapping helpers
editor/layout.ts      card layout actions (align / stack / distribute / fit)
editor/bounds.ts      Selection bounds (props first, DOM measurement second)
editor/geometry.ts    Position/size abstraction over inconsistent anchoring
editor/Canvas.tsx     Live SVG, pan/zoom, selection overlay, drag/resize
editor/Inspector.tsx  Schema-driven property editing
editor/DocumentPanel.tsx  Canvas, panels, glows
editor/Layers.tsx     Element tree + z-order
editor/Palette.tsx    The library — the only way to create anything
```

`toReact` is the whole reason primitives return plain data instead of JSX. One
implementation of each of the 21 primitives serves both the editor canvas and
the export pipeline, so they cannot drift.

Adding a primitive is three steps and no new UI code: write the primitive, add
its document type, add a row to `schema.ts`.

## What building the editor found

**Selection bounds must come from the document, not `getBBox()`.** Glass
surfaces contain a `<use>` of the canvas-sized backdrop for their frosted pane,
and `getBBox()` ignores both `clip-path` and `filter` — so measuring a card
returned the entire canvas. `bounds.ts` computes from props wherever the
geometry is already in the document and only measures text, icons and chrome.

**`doc.panels` and `doc.glow` were unreachable.** They're scene-level, so the
element inspector couldn't see them — and the port had already shown that glow
placement is something designers touch constantly. Hence the document panel,
which is why the right-hand panel is never dead space.

**The inspector was quietly lying.** A badge's status dot derives from its
`tone`, so the checkbox read "off" while the artwork clearly showed a dot; the
same applied to every defaulted number, which rendered as an empty field.
Boolean fields now resolve their real default (`dot` via a function of the
element) and number fields show theirs as a placeholder — so an empty box reads
as "defaults to 13" rather than "unset".

**Snap the destination, not the delta.** The obvious implementation snaps how
far a drag moves, which preserves whatever off-grid offset an element started
with — so nothing ever converges onto the grid and the feature quietly does
nothing. Snapping *where it lands* is what actually pulls a document into
alignment as you work it. Same for resize: the edge is snapped, so widths land
on the grid rather than merely changing by it.

**Layout actions act on a card, not a selection.** The editor is
single-selection, and rather than bolt on multi-select to enable alignment,
these operate on *a card and its direct children*. That turns out to be the
right unit anyway — "make this card's contents line up" is the actual task, and
it keeps padding, alignment and gap coming from one place instead of being
agreed between three separately-selected elements.

**`navigator.clipboard.readText()` is the wrong API for paste.** The first
implementation used it and it was refused outright on the very first test
(`NotAllowedError: Read permission denied`) — which would have shipped a
cross-document paste that silently never worked. The native `copy` / `cut` /
`paste` events carry `clipboardData` with **no permission prompt at all**, so
those are the primary path now; the async API survives only as a best-effort
mirror behind the inspector's Copy button. Verified by handing the app a
foreign element it had never seen via a synthetic `paste` event: accepted,
rendered, selected.

**Two clipboards are better than one.** The in-memory entry remembers which
container an element came *out of*, so pasting into a different card can
preserve the element's offset within that card rather than its absolute canvas
position — copy a label sitting 60×24 inside one card, paste into a card at
(77, 234), and it lands at (137, 258) rather than on top of wherever it used to
be. The system clipboard can't carry that provenance, so it's the fallback.

**⌘D collided with the theme shortcut.** Theme toggle moved from `d` to `t`.

## Verified end to end

Driven in a real browser, not just typechecked: selection (including nested,
via the layer tree), drag (Y 151 → 191, exactly 40 canvas px), undo, resize
(W 182 → 224), theme toggle, adding from the library, the glow blur slider,
document switching to the hub-and-spoke (860×571 artboard, 560×372 export), and export.

Clipboard specifically: ⌘D cascades correctly (405 → 413 → 421) and works on
nested children; copy-out-of-one-card / paste-into-another rebased to
(137, 258) as designed; the `copy` handler writes tagged JSON into
`clipboardData`; and a synthetic `paste` event carrying a foreign element was
accepted, rendered and selected.

The export path was intercepted at the blob: two files, correct per-theme
attributes, `data-path` metadata stripped, zero `foreignObject`, and three real
frosted panes. Zero failed resources and no errors on the current page load.

## Not built yet

Honest list of what a designer would ask for next:

- **Multi-select and alignment tools.** Single selection only today — and now
  the most obvious gap, since clipboard operations make you want to move
  several things at once.
- **Snapping and guides.** It snaps to whole pixels, nothing else.
- **Reordering nested children** — z-order controls are root-level only.
- **Reparenting by drag.** Adding into a container works; moving between them
  needs a JSON edit.
- **Persistence.** Documents load from `docs/` and export as files; there's no
  save-back or library of user documents.
- **PNG export.** SVG only, per the earlier decision.
