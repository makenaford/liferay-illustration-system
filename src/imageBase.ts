import type { Doc, Element } from './document.ts';

/**
 * THE IMAGE BASE, held to its guides.
 *
 * An Image base illustration is a screenshot in a fixed slot (`Doc.mockup`)
 * with cards over it, all inside the card guide (`Doc.cardArea`). Both are
 * strict in the builder: the screenshot always fills its slot exactly, and
 * nothing is placed past the guide (editor/strict.ts). A prebuilt mockup —
 * one image filling the whole canvas — has no slot to hold it in, and is
 * not held.
 *
 * Every screenshot has 16px corners, in every drawing and export: an Image
 * base's, an older layout's and a prebuilt mockup's alike (`withSlotRadius`).
 */

/** The screenshot's corners, always. */
export const SLOT_RADIUS = 16;

const near = (a: number, b: number) => Math.abs(a - b) < 1;

/** Whether a document is an Image base: a screenshot slot inside the canvas, and a card guide. */
export function isImageBase(doc: Pick<Doc, 'mockup' | 'cardArea' | 'canvas'>): boolean {
  const m = doc.mockup;
  if (!m || !doc.cardArea) return false;
  const whole = near(m.x, 0) && near(m.y, 0) && near(m.width, doc.canvas.width) && near(m.height, doc.canvas.height);
  return !whole;
}

/** The top-level image that is the screenshot — the one filling the slot — or -1. */
export function slotIndex(doc: Pick<Doc, 'mockup' | 'elements'>): number {
  const m = doc.mockup;
  if (!m) return -1;
  return doc.elements.findIndex(
    (e) => e.type === 'image' && near(e.x, m.x) && near(e.y, m.y) && near(e.width, m.width) && near(e.height, m.height),
  );
}

/**
 * The top-level image that is a document's screenshot: the one filling its
 * slot, else — for an older layout, drawn before slots were kept exact — the
 * largest image covering most of the canvas. -1 when there is none.
 */
export function screenshotIndex(doc: Pick<Doc, 'mockup' | 'canvas' | 'elements'>): number {
  const inSlot = slotIndex(doc);
  if (inSlot >= 0) return inSlot;
  const canvas = doc.canvas.width * doc.canvas.height;
  let best = -1;
  let area = canvas * 0.5;
  doc.elements.forEach((e, i) => {
    if (e.type !== 'image') return;
    const a = e.width * e.height;
    if (a >= area) {
      area = a;
      best = i;
    }
  });
  return best;
}

/**
 * The document with its screenshot's corners at SLOT_RADIUS — every
 * illustration with one, Image base or older, and a prebuilt mockup's too.
 */
export function withSlotRadius<D extends Pick<Doc, 'mockup' | 'cardArea' | 'canvas' | 'elements'>>(doc: D): D {
  const i = screenshotIndex(doc);
  if (i < 0 || (doc.elements[i] as { radius?: number }).radius === SLOT_RADIUS) return doc;
  return { ...doc, elements: doc.elements.map((e, j) => (j === i ? ({ ...e, radius: SLOT_RADIUS } as Element) : e)) };
}
