import type { Ctx, VNode } from '../vsvg.ts';
import { Surface } from './surface.ts';
import type { SurfaceName } from '../tokens.ts';

/**
 * The original four variant names, mapped onto the surface set.
 *
 * Kept because nine documents reference them, and because they say what a
 * card IS where the surface names say what it looks like. New work should use
 * `surface` directly.
 */
const ALIAS: Record<string, SurfaceName> = {
  sheen: 'glass1',
  flat: 'glass2',
  sunken: 'sunken',
  accent: 'highlighted',
};

export interface SubCardProps {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  /** Legacy alias — see `ALIAS`. */
  variant?: 'sheen' | 'flat' | 'sunken' | 'accent';
  /** Any surface in the set. Wins over `variant`. */
  surface?: SurfaceName;
  backdrop?: boolean;
  children?: (VNode | null | undefined)[];
}

/**
 * SUB CARD — a tile nested inside a panel. Distinct from `GlassPanel` only in
 * its default radius and default surface; both now draw through `Surface`.
 */
export function SubCard(ctx: Ctx, props: SubCardProps): VNode {
  const surface = props.surface ?? ALIAS[props.variant ?? 'sheen'] ?? 'glass1';
  return Surface(ctx, {
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
    radius: props.radius ?? 4,
    backdrop: props.backdrop,
    surface,
    children: props.children,
  });
}
