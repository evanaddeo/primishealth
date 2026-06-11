/**
 * Primis radius tokens — border radius scale.
 * Source: UI/UX Spec §10.2 and §18.4 token example.
 *
 * Usage guidance (§10.2):
 *   Small chips: pill
 *   Buttons:     md or pill
 *   Cards:       lg or xl
 *   Bottom sheets: xl (top corners only)
 */
export const radius = {
  /** 0 — no rounding */
  none: 0,
  /** 6 — tight rounding for small elements */
  xs: 6,
  /** 10 — moderate rounding */
  sm: 10,
  /** 14 — standard buttons and chips */
  md: 14,
  /** 18 — cards and panels */
  lg: 18,
  /** 24 — prominent cards and bottom sheets */
  xl: 24,
  /** 999 — fully rounded (pill / capsule shape) */
  pill: 999,
  /** 9999 — always circular when width === height */
  full: 9999,
} as const;

export type RadiusTokens = typeof radius;
export type RadiusKey = keyof RadiusTokens;
