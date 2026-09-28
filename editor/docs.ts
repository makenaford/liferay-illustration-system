import type { Doc, Element } from '../src/document.ts';

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
 *   mockup   720 × 480 — 3:2 — centred, 10px corners: the same size in every
 *            mockup illustration, so they line up side by side. It is the
 *            document's screenshot slot (`Doc.mockup`): the builder shows it
 *            as a guide, and a screenshot dropped in it fills it.
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
  image: { x: 40, y: 28, width: 720, height: 480, radius: 10 },
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
  const { canvas, pad, image } = MOCKUP;
  const left = { width: 290, height: 155 };
  const right = { width: 246, height: 140 };
  return {
    id: 'untitled-mockup',
    name: 'Untitled image base',
    layout: 'bare',
    canvas: { ...canvas },
    mockup: { x: image.x, y: image.y, width: image.width, height: image.height },
    panels: [],
    elements: [
      {
        type: 'image',
        ...image,
        fit: 'cover',
        href: placeholder(image.width, image.height, 'Screenshot'),
        alt: 'Screenshot — replace with a product screenshot',
      },
      // Left: meets the canvas's left edge with the pad to spare.
      panel(pad, 161, left.width, left.height, 'Detail'),
      // Right: meets the canvas's right edge the same way.
      panel(canvas.width - pad - right.width, 94, right.width, right.height, 'Detail'),
    ],
  };
}

/** A stat tile: label and change, the figure and its sparkline, a note. */
function statTile(label: string, change: string, value: string, note: string, data: number[]): Element {
  const row = (align: 'center' | 'end', gap: number, children: Element[]): Element => ({
    type: 'group', x: 0, y: 0, width: 122, height: 16,
    layout: { direction: 'horizontal', gap, padding: 0, align, justify: 'between', hugHeight: true },
    children,
  });
  return {
    type: 'subCard', x: 0, y: 0, width: 146, height: 62, grow: 1, surface: 'glass-default',
    layout: { direction: 'vertical', gap: 2, padding: 12, align: 'start', hugHeight: true },
    children: [
      row('center', 6, [
        { type: 'text', x: 0, y: 0, role: 'label', content: label },
        { type: 'badge', x: 0, y: 0, label: change, tone: 'info', dot: false },
      ]),
      row('end', 8, [
        { type: 'text', x: 0, y: 0, role: 'heading', weight: 'bold', content: value },
        {
          type: 'lineChart', x: 0, y: 0, width: 36, height: 12, gridLines: 0, domain: [0, 1],
          series: [{ role: 'secondary', data, strokeWidth: 1.25 }],
        },
      ]),
      { type: 'text', x: 0, y: 0, role: 'micro', weight: 'semibold', tone: 'muted', content: note },
    ],
  };
}

/** A progress row with its figure, as the set's category breakdowns are drawn. */
function progressRow(label: string, value: number): Element {
  return {
    type: 'group', x: 0, y: 0, width: 152, height: 14,
    layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'baseline', justify: 'between' },
    children: [
      { type: 'progress', x: 0, y: 0, width: 122, value, label, tone: 'accent' },
      { type: 'text', x: 0, y: 0, role: 'micro', tone: 'muted', content: `${Math.round(value * 100)}%` },
    ],
  };
}

/**
 * DASHBOARD — a hero panel holding a grid of cards, as the set's dashboards
 * ("Turn analytics into action", "AI visibility") are drawn: a header, a row
 * of three stat tiles, and a chart beside a breakdown.
 *
 * The grid is auto-layout, not placed by hand: one column of rows, the
 * tiles sharing their row's width equally (`grow`), so editing a label, a
 * figure or the grid's width reflows it rather than leaving cards to nudge.
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
    panels: [{ x: 40, y: 30, width: 480, height: 312, surface: 'glass-default' }],
    elements: [
      {
        type: 'group', x: 52, y: 42, width: 456, height: 288,
        layout: { direction: 'vertical', gap: 8, padding: 0, align: 'stretch', hugHeight: true },
        children: [
          {
            type: 'group', x: 0, y: 0, width: 456, height: 20,
            layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'center', justify: 'between', hugHeight: true },
            children: [
              { type: 'text', x: 0, y: 0, role: 'subheading', content: 'Performance overview' },
              { type: 'badge', x: 0, y: 0, label: 'Live', tone: 'success' },
            ],
          },
          {
            type: 'group', x: 0, y: 0, width: 456, height: 62,
            layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'start', hugHeight: true },
            children: [
              statTile('Visitors', '+12.4%', '48,210', 'Last 30 days', [0.3, 0.36, 0.34, 0.48, 0.55, 0.62, 0.78]),
              statTile('Conversions', '+6.1%', '3,982', 'vs. 3,750 target', [0.4, 0.38, 0.5, 0.47, 0.6, 0.66, 0.7]),
              statTile('Revenue', '+9.8%', '$1.2M', 'This quarter', [0.2, 0.3, 0.42, 0.4, 0.58, 0.64, 0.84]),
            ],
          },
          {
            type: 'group', x: 0, y: 0, width: 456, height: 190,
            layout: { direction: 'horizontal', gap: 8, padding: 0, align: 'stretch' },
            children: [
              {
                type: 'subCard', x: 0, y: 0, width: 272, height: 190, grow: 1, surface: 'glass-default',
                layout: { direction: 'vertical', gap: 4, padding: 12, align: 'start' },
                children: [
                  { type: 'text', x: 0, y: 0, role: 'bodySmall', content: 'Traffic growth' },
                  {
                    type: 'lineChart', x: 0, y: 0, width: 248, height: 124, gridLines: 6, domain: [0, 1],
                    series: [
                      { role: 'secondary', data: [0.2, 0.3, 0.28, 0.45, 0.52, 0.6, 0.82] },
                      { role: 'primary', data: [0.1, 0.18, 0.24, 0.3, 0.34, 0.46, 0.5] },
                    ],
                    markers: true,
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
                    labelGap: 2,
                  },
                ],
              },
              {
                type: 'subCard', x: 0, y: 0, width: 176, height: 190, surface: 'glass-default',
                layout: { direction: 'vertical', gap: 10, padding: 12, align: 'start' },
                children: [
                  { type: 'text', x: 0, y: 0, role: 'bodySmall', content: 'By channel' },
                  progressRow('Organic', 0.68),
                  progressRow('Paid', 0.42),
                  progressRow('Email', 0.31),
                  progressRow('Social', 0.18),
                ],
              },
            ],
          },
        ],
      },
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
  dashboard: {
    label: 'Dashboard',
    description: 'A hero panel holding a grid of cards: stat tiles, a chart and a breakdown.',
    make: dashboardDoc,
  },
} as const;
export type TemplateName = keyof typeof TEMPLATES;
