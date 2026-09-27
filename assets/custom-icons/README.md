# Custom icons

The team's own icons, beside MingCute's. They show in the icon picker under
**Our icons** — and in the Glass Icon Builder — and illustrations use them
like any other icon, in either style and in the illustration's own colours.

## Adding an icon

1. Draw it on a **24 × 24** frame, as MingCute's are.
2. **Outline every stroke** and flatten it into filled shapes (Outline Stroke,
   then Flatten, in Figma). Colours don't matter; they're dropped.
3. Export it as SVG, named for the icon and its style:

   | File | Is |
   |---|---|
   | `rocket_line.svg` | the outline version |
   | `rocket_fill.svg` | the filled version |
   | `rocket.svg` | one style only — offered as both |

   A subfolder is its category: `Commerce/cart_line.svg` sits under
   Commerce. Files at the top level sit under Custom.
4. Run `pnpm icons:custom`. It lists anything it had to leave out, and why.
5. Deploy (`pnpm cf:deploy`) to put it on the site.

In a document the icon is `custom:rocket` — the name, lowercased, with
spaces and dashes as underscores.

## What gets left out

`pnpm icons:custom` skips a file, and says so, when it:

- isn't on a 24 × 24 grid (`viewBox="0 0 24 24"`)
- has a stroke, rectangle, circle, line or polygon still to outline
- has a transform still to flatten
- has no filled shapes at all
- repeats a name already used in another category
