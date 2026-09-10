/**
 * Icon set, each path authored in its own square box (`box`) so `IconTile` can
 * scale it to any size. Stroke-based, 1px at authoring scale.
 *
 * In the real build this file becomes a thin adapter over Clay icons or
 * MingCute rather than a hand-kept list — but the port needed a fixed set to
 * prove the slot mechanism, and hand-authoring 24 glyphs was faster than
 * wiring an icon package into a zero-dependency spike.
 */

export interface Icon {
  path: string;
  box: number;
}

const I = (path: string, box = 24): Icon => ({ path, box });

export const ICONS: Record<string, Icon> = {
  /* --- time ------------------------------------------------------------ */
  clock: I('M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M12 6.5V12L16.5 14.5'),
  calendar: I(
    'M0 3.334H13.334M2.917 6.667H3.75M6.25 6.667H7.084M9.584 6.667H10.417M2.917 10H3.75M6.25 10H7.084M0.417 13.334H12.917C13.147 13.334 13.334 13.147 13.334 12.917V0.417C13.334 0.187 13.147 0 12.917 0H0.417C0.187 0 0 0.187 0 0.417V12.917C0 13.147 0.187 13.334 0.417 13.334Z',
    13.334,
  ),

  /* --- people ---------------------------------------------------------- */
  user: I('M12 12A4.5 4.5 0 1 0 12 3A4.5 4.5 0 1 0 12 12M3.5 21C3.5 17 7.3 15 12 15C16.7 15 20.5 17 20.5 21'),
  users: I(
    'M9 12A4 4 0 1 0 9 4A4 4 0 1 0 9 12M2 21C2 17.5 5 15.5 9 15.5C13 15.5 16 17.5 16 21M16 5.2A3.8 3.8 0 0 1 16 11.8M18 15.8C20.5 16.5 22 18.2 22 21',
  ),
  building: I(
    'M4 21V4.5C4 3.7 4.7 3 5.5 3H14.5C15.3 3 16 3.7 16 4.5V21M16 10H19.5C20.3 10 21 10.7 21 11.5V21M2.5 21H21.5M7 7H9M11 7H13M7 11H9M11 11H13M7 15H9M11 15H13',
  ),

  /* --- commerce -------------------------------------------------------- */
  dollar: I('M12 2V22M16.5 6.5C16.5 6.5 15 4.5 12 4.5C9 4.5 7.5 6 7.5 8.2C7.5 10.5 9.5 11.2 12 11.9C14.5 12.6 16.8 13.4 16.8 15.8C16.8 18 15 19.5 12 19.5C9 19.5 7.2 17.5 7.2 17.5'),
  cart: I('M2 3H4.5L7 14.5H19L21.5 6H6M9 20A1.5 1.5 0 1 0 9 17A1.5 1.5 0 1 0 9 20M18 20A1.5 1.5 0 1 0 18 17A1.5 1.5 0 1 0 18 20'),
  tag: I('M11.5 2.5H20A1.5 1.5 0 0 1 21.5 4V12.5L12 22L2 12L11.5 2.5ZM17 7.5A1 1 0 1 0 17 5.5A1 1 0 1 0 17 7.5'),

  /* --- security -------------------------------------------------------- */
  lock: I('M6 10.5V7.5A6 6 0 0 1 18 7.5V10.5M4.5 10.5H19.5V20.5C19.5 21.1 19.1 21.5 18.5 21.5H5.5C4.9 21.5 4.5 21.1 4.5 20.5V10.5ZM12 14.5V17.5'),
  shield: I('M12 2L20.5 5.5V12C20.5 17 16.8 20.8 12 22C7.2 20.8 3.5 17 3.5 12V5.5L12 2ZM8.5 12L11 14.5L15.5 10'),
  key: I('M15.5 3A5.5 5.5 0 1 1 10.4 10.6L3 18V21.5H6.5L8 20V17.5H10.5V15L12 13.5M17 8.5A1.2 1.2 0 1 0 17 6.1A1.2 1.2 0 1 0 17 8.5'),

  /* --- data ------------------------------------------------------------ */
  chart: I('M3 21H21M6 21V12M11 21V6M16 21V15M21 21V9'),
  trend: I('M3 17L9 11L13 15L21 7M21 7H15M21 7V13'),
  database: I(
    'M12 6.5C16.4 6.5 20 5.5 20 4.2C20 2.9 16.4 2 12 2C7.6 2 4 2.9 4 4.2C4 5.5 7.6 6.5 12 6.5ZM4 4.2V19.8C4 21.1 7.6 22 12 22C16.4 22 20 21.1 20 19.8V4.2M4 12C4 13.3 7.6 14.2 12 14.2C16.4 14.2 20 13.3 20 12',
  ),
  file: I('M14 2H6.5C5.7 2 5 2.7 5 3.5V20.5C5 21.3 5.7 22 6.5 22H17.5C18.3 22 19 21.3 19 20.5V7L14 2ZM14 2V7H19M8.5 12H15.5M8.5 16H15.5'),

  /* --- system ---------------------------------------------------------- */
  search: I('M10.5 18A7.5 7.5 0 1 0 10.5 3A7.5 7.5 0 1 0 10.5 18M16 16L21.5 21.5'),
  browser: I('M2.5 4.5H21.5V19.5H2.5V4.5ZM2.5 9H21.5M5.5 6.7H6.5M8 6.7H9M10.5 6.7H11.5'),
  globe: I('M12 22A10 10 0 1 0 12 2A10 10 0 1 0 12 22M2 12H22M12 2C14.5 5 15.5 8.5 15.5 12C15.5 15.5 14.5 19 12 22C9.5 19 8.5 15.5 8.5 12C8.5 8.5 9.5 5 12 2Z'),
  code: I('M8.5 7L3.5 12L8.5 17M15.5 7L20.5 12L15.5 17'),
  sync: I('M20.5 12A8.5 8.5 0 0 1 6 18M3.5 12A8.5 8.5 0 0 1 18 6M3.5 6V12H9.5M20.5 18V12H14.5'),
  package: I('M12 2L21 6.7V17.3L12 22L3 17.3V6.7L12 2ZM3 6.7L12 11.4L21 6.7M12 11.4V22'),
  layers: I('M12 2L21.5 7L12 12L2.5 7L12 2ZM2.5 12L12 17L21.5 12M2.5 17L12 22L21.5 17'),

  /* --- messaging ------------------------------------------------------- */
  mail: I('M2.5 5.5H21.5V18.5H2.5V5.5ZM2.5 6L12 13L21.5 6'),
  chat: I('M21 12C21 16.5 17 20 12 20C10.6 20 9.3 19.7 8.2 19.2L3 21L4.6 16.4C3.6 15.1 3 13.6 3 12C3 7.5 7 4 12 4C17 4 21 7.5 21 12Z'),
  send: I('M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z'),
  phone: I('M7.5 2.5H16.5C17.3 2.5 18 3.2 18 4V20C18 20.8 17.3 21.5 16.5 21.5H7.5C6.7 21.5 6 20.8 6 20V4C6 3.2 6.7 2.5 7.5 2.5ZM10.5 18.5H13.5'),

  /* --- status ---------------------------------------------------------- */
  check: I('M4 12.5L9.5 18L20 6'),
  star: I('M12 2.5L15 9L22 10L17 15L18.2 22L12 18.7L5.8 22L7 15L2 10L9 9L12 2.5Z'),
  bolt: I('M13.5 2L4 13.5H11L10.5 22L20 10.5H13L13.5 2Z'),
  cursor: I('M4 2L4 18.5L8.6 14.4L11.6 21.5L14.8 20.1L11.8 13.2L18 12.6L4 2Z'),
};

/*
 * The hand-drawn spot illustrations that used to live here are gone.
 *
 * They were a stopgap: five 48px glyphs standing in for artwork the design
 * system already ships properly. `src/glassIcons.generated.ts` now carries the
 * real thing — 19 glass icons with genuine per-theme variants — imported from
 * liferay-sites-design-system by `npm run icons`.
 *
 * The stroke icons above stay. They are UI furniture inside the depicted
 * interface (a clock in a card, a search glyph in an input), which is a
 * different job from a hero spot illustration.
 */
