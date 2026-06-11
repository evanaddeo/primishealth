/**
 * Primis spacing tokens — 4-point base grid.
 * Source: UI/UX Spec §10.1 and §18.4 token example.
 *
 * All values are in logical pixels (React Native density-independent units).
 * Page padding: lg (16) or xl (20) per UX-SPACING-001.
 * Card internal padding: lg (16) or xl (20) per UX-SPACING-002.
 */
export const spacing = {
  /** 2pt — hairline gap; use sparingly */
  xxs: 2,
  /** 4pt — compact inner gap */
  xs: 4,
  /** 8pt — standard small gap */
  sm: 8,
  /** 12pt — compact card gap */
  md: 12,
  /** 16pt — standard page/card padding */
  lg: 16,
  /** 20pt — large card padding */
  xl: 20,
  /** 24pt — section gap */
  '2xl': 24,
  /** 32pt — major section gap */
  '3xl': 32,
  /** 40pt — page group gap */
  '4xl': 40,
  /** 48pt — large hero gap */
  '5xl': 48,
} as const;

export type SpacingTokens = typeof spacing;
export type SpacingKey = keyof SpacingTokens;
