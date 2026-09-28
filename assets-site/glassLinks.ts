import { rebuild } from '../src/glassRebuild.ts';
import { recipeOf, type GlassRecipe } from '../src/glassRecipe.ts';
import { GLASS_ICON_LINKS } from '../src/glassIconLinks.generated.ts';
import { iconParts, type IconRow } from './store.ts';

/**
 * What an icon opens in the Glass Icon Builder with.
 *
 * One made there keeps the recipe it was saved with. One uploaded from Figma
 * has none, so it is taken apart (src/glassRebuild.ts) into its two layers,
 * in the builder layout closest to how it was drawn; then each layer the set
 * is known to draw from a MingCute icon (GLASS_ICON_LINKS, by the icon's
 * "Category - Name") opens as that icon, picked in the builder, instead of as
 * the icon's own shape. Undefined when the icon doesn't take apart.
 */
export function recipeFor(icon: IconRow): GlassRecipe | undefined {
  if (icon.builder) return icon.builder;
  let base: GlassRecipe | undefined;
  try {
    const r = rebuild(icon.svg);
    base = r.spec && recipeOf(r.spec);
  } catch {
    return undefined;
  }
  if (!base) return undefined;
  const { category, name } = iconParts(icon);
  const link = GLASS_ICON_LINKS[`${category} - ${name}`] ?? GLASS_ICON_LINKS[icon.name];
  return {
    ...base,
    ...(link?.front && { front: link.front }),
    ...(link?.back && { back: link.back }),
  };
}
