import type { Ctx, VNode } from '../vsvg.ts';
import { Surface, cssAngleLine } from './surface.ts';
import type { SurfaceName } from '../tokens.ts';

export interface GlassPanelProps {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  /** Retained for the document schema; both values now mean `glass2`. */
  sheen?: 'radial' | 'linear';
  /** Which surface to draw. Defaults to the standard card. */
  surface?: SurfaceName;
  backdrop?: boolean;
  /** `nested` drops to the lowest glass step, which casts no shadow. */
  elevation?: 'card' | 'nested';
  children?: (VNode | null | undefined)[];
}

/**
 * GLASS PANEL — the hero card. A thin wrapper over `Surface`, which carries
 * the actual recipe as token data.
 */
export function GlassPanel(ctx: Ctx, props: GlassPanelProps): VNode {
  return Surface(ctx, {
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
    radius: props.radius ?? ctx.tokens.radius.panel,
    backdrop: props.backdrop,
    surface: props.surface ?? (props.elevation === 'nested' ? 'glass1' : 'glass2'),
    children: props.children,
  });
}

export { cssAngleLine };
