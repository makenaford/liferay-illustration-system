import type { Doc, Element } from '../src/document.ts';
import { dashboard } from './dashboardGrid.ts';
import { placeholder } from './placeholder.ts';
import { SLOT_RADIUS } from '../src/imageBase.ts';
import { CARD_PRESETS, placePreset } from './cardPresets.ts';

import aiVisibility from '../docs/ai-visibility-dashboard.json';
import b2bCommerce from '../docs/b2b-commerce.json';
import deployDaily from '../docs/deploy-daily.json';
import driveConversions from '../docs/drive-conversions.json';
import integrate from '../docs/integrate-all-systems.json';
import launchCampaigns from '../docs/launch-campaigns.json';
import partnerDashboard from '../docs/partner-dashboard.json';
import partnerDashboardPage from '../docs/partner-dashboard-page.json';
import secureAccess from '../docs/secure-access.json';
import slashTechDebt from '../docs/slash-tech-debt.json';
import turnAnalytics from '../docs/turn-analytics.json';
import deploySecurity from '../docs/deploy-security-anywhere.json';
import buildPortals from '../docs/build-portals-low-code.json';
import connectSystems from '../docs/connect-every-system.json';
import bringProduct from '../docs/bring-product-enterprise.json';
import patientCare from '../docs/patient-care-insights.json';
import ordersOverview from '../docs/orders-overview.json';
import permitApplication from '../docs/permit-application.json';
import energyConsumption from '../docs/energy-consumption.json';
import scaleFasterDxp from '../docs/scale-faster-dxp.json';

/**
 * The nine ported illustrations plus anything built since, loaded as the
 * editor's fixture set. Building against real documents rather than a
 * hello-world is what surfaced the bounds and z-order requirements.
 */
export const DOCS = [
  deployDaily,
  driveConversions,
  secureAccess,
  slashTechDebt,
  turnAnalytics,
  aiVisibility,
  integrate,
  b2bCommerce,
  launchCampaigns,
  partnerDashboard,
  partnerDashboardPage,
  // The mockups: a product screenshot with glass frames of real UI over it.
  deploySecurity,
  buildPortals,
  connectSystems,
  bringProduct,
  scaleFasterDxp,
  // Image base, a photo left to fill: one glass panel of UI at its edge.
  patientCare,
  ordersOverview,
  permitApplication,
  energyConsumption,
] as unknown as Doc[];

/** A blank document, for starting something new. */
export function blankDoc(): Doc {
  return {
    id: 'untitled',
    name: 'Untitled illustration',
    layout: 'singlePanel',
    canvas: { width: 560, height: 372 },
    glow: [{ cx: 280, cy: 272, rx: 168, ry: 164, blur: 100 }],
    panels: [{ x: 65, y: 46, width: 430, height: 280 }],
    elements: [],
  };
}

/**
 * MOCKUP — a product screenshot, with frames of detail on top of it,
 * as the set's mockup illustrations are drawn ("Deploy with enterprise-grade
 * security, anywhere", "Turn your site into a B2B revenue engine"):
 *
 *   canvas   800 × 533, 3:2
 *   mockup   756 × 489, 22px in from every edge, 16px corners. It is the
 *            document's screenshot slot (`Doc.mockup`): the builder shows
 *            it as a guide, a screenshot dropped in it fills it, and the
 *            screenshot cannot be moved or resized off it.
 *   cards    776 × 509, 12px in from every edge — room for any card's drop
 *            shadow, which reaches at most `SHADOW_REACH` (12px), before
 *            the canvas clips it. The card guide
 *            (`Doc.cardArea`): the builder's safe area, which nothing
 *            on the canvas is placed past, and what the audit checks them
 *            against, in place of the canvas inset.
 *
 * Both are held in the builder — see editor/strict.ts and src/imageBase.ts.
 * A new one is the screenshot alone on no background; cards come from the
 * Library.
 *
 * It was drawn at 1440 × 960 first and scaled to 800 wide; the illustrations
 * made from that keep its 720 × 480 slot.
 *
 * The screenshot is a placeholder to replace, not artwork.
 */
export const MOCKUP = {
  canvas: { width: 800, height: 533 },
  image: { x: 22, y: 22, width: 756, height: 489, radius: SLOT_RADIUS },
  cards: { x: 12, y: 12, width: 776, height: 509 },
} as const;

/**
 * A new Image base, laid out as "Solution Partner" is: the screenshot in its
 * slot on no background — a page shows through it, as it will where it is
 * used — with a second image contained in a Highlighted card on the right,
 * against the card guide's edge and centred, 12px in, and an Icon card over
 * that card's left edge. The guides hold them (editor/strict.ts).
 */
export const IMAGE_BASE_CARD = { x: 364, y: 128, width: 424, height: 278, pad: 12 } as const;

export function mockupDoc(): Doc {
  const { canvas, image, cards } = MOCKUP;
  const c = IMAGE_BASE_CARD;
  const inner = { x: c.x + c.pad, y: c.y + c.pad, width: c.width - 2 * c.pad, height: c.height - 2 * c.pad };
  const makeIcon = CARD_PRESETS.find((p) => p.label === 'Icon card')!.make;
  const iconH = (placePreset(makeIcon(), { x: 0, y: 0 }) as { height: number }).height;
  const iconY = Math.round((canvas.height - iconH) / 4) * 2;
  return {
    id: 'untitled-mockup',
    name: 'Untitled image base',
    layout: 'bare',
    canvas: { ...canvas },
    mockup: { x: image.x, y: image.y, width: image.width, height: image.height },
    cardArea: { ...cards },
    background: 'none',
    panels: [],
    elements: [
      {
        type: 'image',
        ...image,
        fit: 'cover',
        href: placeholder(image.width, image.height, 'Screenshot'),
        alt: 'Screenshot — replace with a product screenshot',
      },
      {
        type: 'card',
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        surface: 'glass-highlighted',
        radius: 8,
        hugWidth: true,
        hugHeight: true,
        children: [
          {
            type: 'image',
            ...inner,
            fit: 'cover',
            radius: 4,
            grow: 1,
            absolute: true,
            crop: { x: 0.5, y: 0, zoom: 1 },
            href: placeholder(inner.width, inner.height, 'Image'),
            alt: 'Image — replace with a product image',
          },
        ],
      } as Element,
      placePreset(makeIcon(), { x: 340, y: iconY }),
    ],
  };
}

/**
 * STATIC IMAGE — a finished image brought in whole (a prebuilt mockup, a
 * screenshot), shown on a Blue tinted card: the card fills the canvas, and
 * the image sits on it STATIC_PAD in from every edge, both with 16px corners.
 * The image's slot (`Doc.mockup`) is that inset, so dropping an image on it,
 * or choosing one in the Inspector, puts it there — and the canvas takes the
 * image's shape plus the border (`fitCanvasToImage`), so it is never cropped
 * or letterboxed.
 */
export const STATIC_PAD = 16;

export function staticImageDoc(): Doc {
  const { canvas } = MOCKUP;
  const p = STATIC_PAD;
  const slot = { x: p, y: p, width: canvas.width - 2 * p, height: canvas.height - 2 * p };
  return {
    id: 'untitled-static-image',
    name: 'Untitled static image',
    layout: 'bare',
    canvas: { ...canvas },
    mockup: { ...slot },
    background: 'none',
    panels: [],
    elements: [
      { type: 'card', x: 0, y: 0, width: canvas.width, height: canvas.height, surface: 'glass-blue', radius: SLOT_RADIUS },
      {
        type: 'image',
        ...slot,
        fit: 'cover',
        radius: SLOT_RADIUS,
        href: placeholder(slot.width, slot.height, 'Drop an image here'),
        alt: 'Image — replace with a finished image or mockup',
      },
    ],
  };
}

/**
 * Whether a document is a static image: its slot inset the same on every
 * side, with no card guide — this template's, or the earlier one's that
 * filled the whole canvas.
 */
export function isStaticImage(doc: Doc): boolean {
  const m = doc.mockup;
  if (!m || doc.cardArea) return false;
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  const r = doc.canvas.width - m.x - m.width;
  const bottom = doc.canvas.height - m.y - m.height;
  return near(m.x, m.y) && near(m.x, r) && near(m.x, bottom);
}

/**
 * A static image's canvas reshaped to its image, at the canvas's width: the
 * image's height from its own shape, the canvas the border taller, both to
 * even pixels so they stay on the grid. The slot, the image filling it and
 * the card filling the canvas follow.
 */
export function fitCanvasToImage(doc: Doc, natural: { width: number; height: number }): Doc {
  const m = doc.mockup;
  if (!m || !natural.width || !natural.height) return doc;
  const p = m.x;
  const width = doc.canvas.width;
  const inner = width - 2 * p;
  const imageH = Math.max(2, Math.round((inner * natural.height) / natural.width / 2) * 2);
  const height = imageH + 2 * p;
  const same = (el: { x?: number; y?: number; width?: number; height?: number }, b: { x: number; y: number; width: number; height: number }) =>
    el.x === b.x && el.y === b.y && el.width === b.width && el.height === b.height;
  const whole = { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
  return {
    ...doc,
    canvas: { ...doc.canvas, width, height },
    mockup: { x: p, y: p, width: inner, height: imageH },
    elements: doc.elements.map((el) =>
      el.type === 'image' && same(el, m)
        ? { ...el, x: p, y: p, width: inner, height: imageH }
        : (el.type === 'card' || el.type === 'subCard') && same(el, whole)
          ? { ...el, width, height }
          : el,
    ),
  };
}

/** Whether a static image sits on its Blue tinted card, or fills the canvas. */
export function hasStaticContainer(doc: Doc): boolean {
  return (doc.mockup?.x ?? 0) > 0;
}

/**
 * A static image with or without its container, keeping the image's shape:
 * with it, the image is STATIC_PAD in on a Blue tinted card filling the
 * canvas; without it, the image fills the canvas and the card goes. The
 * canvas keeps its width, and its height follows the image, to even pixels.
 */
export function setStaticContainer(doc: Doc, on: boolean): Doc {
  const m = doc.mockup;
  if (!m || hasStaticContainer(doc) === on) return doc;
  const width = doc.canvas.width;
  const p = on ? STATIC_PAD : 0;
  const inner = width - 2 * p;
  const imageH = Math.max(2, Math.round((m.height * inner) / m.width / 2) * 2);
  const height = imageH + 2 * p;
  const near = (a: number | undefined, b: number) => Math.abs((a ?? NaN) - b) < 1;
  const isSlot = (el: Element) =>
    el.type === 'image' && near(el.x, m.x) && near(el.y, m.y) && near(el.width, m.width) && near(el.height, m.height);
  const isCard = (el: Element) =>
    (el.type === 'card' || el.type === 'subCard') &&
    near(el.x, 0) && near(el.y, 0) && near(el.width, doc.canvas.width) && near(el.height, doc.canvas.height);
  const slot = { x: p, y: p, width: inner, height: imageH };
  const elements = doc.elements
    .filter((el) => on || !isCard(el))
    .map((el) => (isSlot(el) ? ({ ...el, ...slot, radius: SLOT_RADIUS } as Element) : el));
  if (on && !elements.some(isCard)) {
    elements.unshift({ type: 'card', x: 0, y: 0, width, height, surface: 'glass-blue', radius: SLOT_RADIUS } as Element);
  }
  return {
    ...doc,
    canvas: { ...doc.canvas, width, height },
    mockup: slot,
    elements: elements.map((el) => (on && isCard(el) ? ({ ...el, width, height } as Element) : el)),
  };
}

/**
 * DASHBOARD — a hero panel holding a grid of cards, as the set's dashboards
 * ("Turn analytics into action", "AI visibility") are drawn: a header, a row
 * of three stat tiles, and a chart beside a breakdown.
 *
 * The grid is a dashboard grid (editor/dashboardGrid.ts): rows of slots
 * that divide the panel exactly, set under Grid — up to four rows of up to
 * four — so editing a label, a figure or the size reflows it rather than
 * leaving cards to nudge.
 */
export function dashboardDoc(): Doc {
  return {
    id: 'untitled-dashboard',
    name: 'Untitled dashboard',
    layout: 'dashboard',
    canvas: { width: 560, height: 372 },
    glow: [
      { cx: 13, cy: 42, rx: 86, ry: 84, blur: 100 },
      { cx: 501, cy: 243, rx: 147, ry: 144, blur: 100 },
    ],
    // The guides the Image base follows: the panel 22px in from every edge,
    // cards inside a card guide 12px in.
    panels: [{ x: 22, y: 22, width: 516, height: 328 }],
    cardArea: { x: 12, y: 12, width: 536, height: 348 },
    elements: [
      // The grid itself, inside the panel: rows and slots set under Grid.
      { ...dashboard('full', 'group'), x: 34, y: 34, width: 492, height: 304 } as Element,
    ],
  };
}

/** What a new illustration can start from. */
export const TEMPLATES = {
  simple: {
    label: 'Simple illustration',
    description: 'An empty 560 × 372 canvas with one hero panel.',
    make: blankDoc,
  },
  imageBase: {
    label: 'Image base',
    description: 'An 800 × 533 product screenshot on no background, with an image in a Highlighted card on the right and an Icon card over it.',
    make: mockupDoc,
  },
  mockup: {
    label: 'Static image',
    description: 'A finished image on a Blue tinted card, 16px in — the canvas takes the image’s shape.',
    make: staticImageDoc,
  },
  dashboard: {
    label: 'Dashboard',
    description: 'A hero panel holding a grid of cards: stat tiles, a chart and a breakdown.',
    make: dashboardDoc,
  },
} as const;
export type TemplateName = keyof typeof TEMPLATES;
