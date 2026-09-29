import type { Slot } from './insertion.ts';

/**
 * DRAGGING A COMPONENT FROM THE LIBRARY onto the canvas.
 *
 * What a Library button adds depends on where it lands, so the drag carries
 * the add itself — the same one a click runs — and the canvas, which knows
 * the container under the pointer (`slotForDrop`), calls it there. That is
 * what fills a drop zone: an empty dashboard slot, or a blank card's area.
 */
export const COMPONENT_DRAG = 'application/x-illustration-component';

/** Adds the dragged component into `slot`, placed at `at` where the container does not lay it out. */
export type AddAt = (slot: Slot, at: { x: number; y: number }) => void;

let pending: AddAt | null = null;

/** Props that make a Library button draggable, carrying `add`. */
export const draggable = (add: AddAt) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    pending = add;
    e.dataTransfer.setData(COMPONENT_DRAG, '1');
    e.dataTransfer.effectAllowed = 'copy';
  },
  onDragEnd: () => {
    pending = null;
  },
});

export const isComponentDrag = (e: DragEvent | React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes(COMPONENT_DRAG);

/** The dragged component's add, once — the drop takes it. */
export function takeDrag(): AddAt | null {
  const p = pending;
  pending = null;
  return p;
}
