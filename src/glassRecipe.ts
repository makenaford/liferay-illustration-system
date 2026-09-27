import type { Corner, GlassIconSpec, GlyphBounds, Layer, LayoutName } from './glassIconMaker.ts';

/**
 * GLASS RECIPE — what the Glass Icon Builder made an icon from, kept with the
 * icon so it can be opened in the builder again and changed.
 *
 * Each layer is a MingCute icon (its key and style: the builder's picker
 * restores it) or drawn shapes fitted onto the grid — an existing icon's
 * own, as src/glassRebuild.ts takes them apart.
 */
export interface GlassRecipe {
  v: 1;
  front: RecipeLayer;
  back: RecipeLayer;
  layout: LayoutName;
  /** The front icon's corner. Older recipes have `mirror` instead — see `cornerOf`. */
  corner?: Corner;
  mirror?: boolean;
}

export type RecipeLayer =
  | { icon: string; style: 'fill' | 'line' }
  | { shape: Layer; bounds: GlyphBounds };

export const isShape = (l: RecipeLayer): l is Extract<RecipeLayer, { shape: Layer }> => 'shape' in l;

/** A rebuild's spec as a recipe: both layers the icon's own shapes. */
export function recipeOf(spec: GlassIconSpec): GlassRecipe | undefined {
  const { front, back, frontBounds, backBounds } = spec;
  if (typeof front === 'string' || typeof back === 'string' || !frontBounds || !backBounds) return undefined;
  return {
    v: 1,
    front: { shape: front, bounds: frontBounds },
    back: { shape: back, bounds: backBounds },
    layout: spec.layout ?? 'glass',
    ...(spec.corner ? { corner: spec.corner } : spec.mirror ? { mirror: true } : {}),
  };
}
