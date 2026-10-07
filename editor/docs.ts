import type { Doc, Element } from '../src/document.ts';
import { dashboard } from './dashboardGrid.ts';
import { placeholder } from './placeholder.ts';

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
 *   mockup   740 × 473, 30px in from every edge, 10px corners. It is the
 *            document's screenshot slot (`Doc.mockup`): the builder shows
 *            it as a guide, and a screenshot dropped in it fills it.
 *   cards    760 × 493, 20px in from every edge — room for any card's drop
 *            shadow, which reaches at most `SHADOW_REACH` (20px), before
 *            the canvas clips it. The card guide
 *            (`Doc.cardArea`): the builder's safe area, which top-level
 *            cards snap to, and what the audit checks them against, in
 *            place of the 20px canvas inset.
 *   panels   glass, overlapping the mockup's edge and meeting the card
 *            guide; each holds a screenshot inset 12px
 *
 * It was drawn at 1440 × 960 first and scaled to 800 wide; the illustrations
 * made from that keep its 720 × 480 slot.
 *
 * The images are placeholders to replace, not artwork.
 */
export const MOCKUP = {
  canvas: { width: 800, height: 533 },
  /** Space between a panel and its screenshot. */
  pad: 12,
  image: { x: 30, y: 30, width: 740, height: 473, radius: 10 },
  cards: { x: 20, y: 20, width: 760, height: 493 },
} as const;

/** A frame holding a screenshot inset by the pad. */
function panel(x: number, y: number, width: number, height: number, label: string): Doc['elements'][number] {
  const p = MOCKUP.pad;
  return {
    type: 'card',
    x,
    y,
    width,
    height,
    surface: 'glass-highlighted',
    sheen: 'radial',
    radius: 8,
    // Frosts the mockup beneath it, not just the stage.
    frost: 'content',
    children: [
      {
        type: 'image',
        x: x + p,
        y: y + p,
        width: width - 2 * p,
        height: height - 2 * p,
        fit: 'cover',
        radius: 4,
        href: placeholder(width - 2 * p, height - 2 * p, label),
        alt: `${label} — replace with a screenshot`,
      },
    ],
  };
}

/** A new mockup illustration: the mockup image, and two frames at its edges. */
export function mockupDoc(): Doc {
  const { canvas, image, cards } = MOCKUP;
  const left = { width: 290, height: 155 };
  const right = { width: 246, height: 140 };
  return {
    id: 'untitled-mockup',
    name: 'Untitled image base',
    layout: 'bare',
    canvas: { ...canvas },
    mockup: { x: image.x, y: image.y, width: image.width, height: image.height },
    cardArea: { ...cards },
    panels: [],
    elements: [
      {
        type: 'image',
        ...image,
        fit: 'cover',
        href: placeholder(image.width, image.height, 'Screenshot'),
        alt: 'Screenshot — replace with a product screenshot',
      },
      // Left: meets the card guide's left edge.
      panel(cards.x, 169, left.width, left.height, 'Detail'),
      // Right: meets its right edge the same way.
      panel(cards.x + cards.width - right.width, 102, right.width, right.height, 'Detail'),
    ],
  };
}

/**
 * PREBUILT MOCKUP — a mockup made elsewhere, brought in whole: the canvas is
 * one image and nothing else. Its screenshot slot (`Doc.mockup`) is the whole
 * canvas, so dropping an image on it, or choosing one in the Inspector, puts
 * it there — and the canvas takes the image's shape (`fitCanvasToImage`), so
 * a prebuilt mockup is never cropped or letterboxed.
 */
export function prebuiltMockupDoc(): Doc {
  const { canvas } = MOCKUP;
  const slot = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return {
    id: 'untitled-mockup',
    name: 'Untitled mockup',
    layout: 'bare',
    canvas: { ...canvas },
    mockup: { ...slot },
    panels: [],
    elements: [
      {
        type: 'image',
        ...slot,
        fit: 'cover',
        href: placeholder(slot.width, slot.height, 'Mockup — drop an image here'),
        alt: 'Mockup — replace with a prebuilt mockup image',
      },
    ],
  };
}

/** Whether the document's screenshot slot is its whole canvas — a prebuilt mockup. */
export const isWholeCanvasSlot = (doc: Doc) =>
  !!doc.mockup && doc.mockup.x === 0 && doc.mockup.y === 0 && doc.mockup.width === doc.canvas.width && doc.mockup.height === doc.canvas.height;

/**
 * A prebuilt mockup's canvas reshaped to its image, at the canvas's width —
 * the height to the nearest even pixel, so it stays on the grid — with the
 * slot and every image filling it moved along.
 */
export function fitCanvasToImage(doc: Doc, natural: { width: number; height: number }): Doc {
  const m = doc.mockup;
  if (!m || !natural.width || !natural.height) return doc;
  const width = doc.canvas.width;
  const height = Math.max(2, Math.round((width * natural.height) / natural.width / 2) * 2);
  const fills = (el: Doc['elements'][number]) =>
    el.type === 'image' && el.x === m.x && el.y === m.y && el.width === m.width && el.height === m.height;
  return {
    ...doc,
    canvas: { ...doc.canvas, width, height },
    mockup: { x: 0, y: 0, width, height },
    elements: doc.elements.map((el) => (fills(el) ? { ...el, x: 0, y: 0, width, height } : el)),
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
    // The guides the Image base follows: the panel 30px in from every edge,
    // cards inside a card guide 20px in.
    panels: [{ x: 30, y: 30, width: 500, height: 312 }],
    cardArea: { x: 20, y: 20, width: 520, height: 332 },
    elements: [
      // The grid itself, inside the panel: rows and slots set under Grid.
      { ...dashboard('full', 'group'), x: 42, y: 42, width: 476, height: 288 } as Element,
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
    description: 'An 800 × 533 product screenshot with frames meeting the edges.',
    make: mockupDoc,
  },
  mockup: {
    label: 'Mockup',
    description: 'A prebuilt mockup: one image upload that fills the canvas.',
    make: prebuiltMockupDoc,
  },
  dashboard: {
    label: 'Dashboard',
    description: 'A hero panel holding a grid of cards: stat tiles, a chart and a breakdown.',
    make: dashboardDoc,
  },
} as const;
export type TemplateName = keyof typeof TEMPLATES;
