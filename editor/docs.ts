import type { Doc } from '../src/document.ts';

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
 * MOCKUP — a product screenshot, with glass panels of detail on top of it,
 * as the set's mockup illustrations are drawn ("Deploy with enterprise-grade
 * security, anywhere", "Turn your site into a B2B revenue engine"):
 *
 *   canvas   800 × 533, 3:2
 *   mockup   752 × 485 at (24, 24), 10px corners — the same size in every
 *            mockup illustration, so they line up side by side
 *   panels   glass, overlapping the mockup's edge and meeting the canvas
 *            edge with 12px to spare; each holds a screenshot inset 12px
 *
 * It was drawn at 1440 × 960 first; this is that layout scaled to 800 wide.
 *
 * The images are placeholders to replace, not artwork.
 */
export const MOCKUP = {
  canvas: { width: 800, height: 533 },
  /** Space between a panel and the canvas edge, and between a panel and its screenshot. */
  pad: 12,
  image: { x: 24, y: 24, width: 752, height: 485, radius: 10 },
} as const;

/** A labelled placeholder image, so the slot's size and purpose read at a glance. */
function placeholder(w: number, h: number, label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2434"/><stop offset="1" stop-color="#0e1420"/></linearGradient>` +
    `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#2a3548" stroke-width="1"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#p)"/>` +
    `<text x="50%" y="50%" fill="#8a97ad" font-family="'Source Sans 3', system-ui, sans-serif" font-size="${Math.max(14, Math.round(Math.min(w, h) / 14))}" text-anchor="middle" dominant-baseline="middle">${label} · ${w} × ${h}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A glass panel holding a screenshot inset by the pad. */
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

/** A new mockup illustration: the mockup image, and two glass panels at its edges. */
export function mockupDoc(): Doc {
  const { canvas, pad, image } = MOCKUP;
  const left = { width: 290, height: 155 };
  const right = { width: 246, height: 140 };
  return {
    id: 'untitled-mockup',
    name: 'Untitled mockup',
    layout: 'bare',
    canvas: { ...canvas },
    panels: [],
    elements: [
      {
        type: 'image',
        ...image,
        fit: 'cover',
        href: placeholder(image.width, image.height, 'Mockup'),
        alt: 'Mockup — replace with a product screenshot',
      },
      // Left: meets the canvas's left edge with the pad to spare.
      panel(pad, 161, left.width, left.height, 'Detail'),
      // Right: meets the canvas's right edge the same way.
      panel(canvas.width - pad - right.width, 94, right.width, right.height, 'Detail'),
    ],
  };
}

/** What a new illustration can start from. */
export const TEMPLATES = {
  blank: { label: 'Blank', description: 'An empty canvas with one glass panel.', make: blankDoc },
  mockup: {
    label: 'Mockup',
    description: 'An 800 × 533 product screenshot with glass panels meeting the edges, 12px in.',
    make: mockupDoc,
  },
} as const;
export type TemplateName = keyof typeof TEMPLATES;
