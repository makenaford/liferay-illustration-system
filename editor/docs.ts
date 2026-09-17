import type { Doc } from '../src/document.ts';

import aiVisibility from '../docs/ai-visibility-dashboard.json';
import b2bCommerce from '../docs/b2b-commerce.json';
import deployDaily from '../docs/deploy-daily.json';
import driveConversions from '../docs/drive-conversions.json';
import integrate from '../docs/integrate-all-systems.json';
import launchCampaigns from '../docs/launch-campaigns.json';
import partnerDashboard from '../docs/partner-dashboard.json';
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
