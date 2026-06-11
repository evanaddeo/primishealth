/**
 * Primis typography tokens — semantic type scale and font weights.
 * Source: UI/UX Spec §9.2, §9.3, §9.4.
 *
 * Font strategy: system fonts only (iOS: SF Pro, Android: Roboto).
 * No custom font family is imported per §9.2 guidance.
 * fontFamily is intentionally omitted — React Native uses the platform system font.
 *
 * UX-TYPE-001: Large numeric values should use tabular numerals where platform supports it.
 * UX-TYPE-004/005: Components must tolerate larger dynamic type settings.
 */

export interface TypeScaleEntry {
  readonly fontSize: number;
  readonly lineHeight: number;
}

/** Semantic type scale matching §9.3. */
export const typeScale = {
  /** 40/46 — hero scores; use sparingly */
  displayLarge: { fontSize: 40, lineHeight: 46 },
  /** 34/40 — screen hero values */
  displayMedium: { fontSize: 34, lineHeight: 40 },
  /** 28/34 — main screen titles */
  titleLarge: { fontSize: 28, lineHeight: 34 },
  /** 22/28 — section titles */
  titleMedium: { fontSize: 22, lineHeight: 28 },
  /** 18/24 — card titles */
  titleSmall: { fontSize: 18, lineHeight: 24 },
  /** 16/24 — primary body */
  bodyLarge: { fontSize: 16, lineHeight: 24 },
  /** 14/20 — secondary body */
  bodyMedium: { fontSize: 14, lineHeight: 20 },
  /** 13/18 — compact labels */
  bodySmall: { fontSize: 13, lineHeight: 18 },
  /** 12/16 — metadata, timestamps */
  caption: { fontSize: 12, lineHeight: 16 },
  /** 11/14 — rarely used; avoid for important data */
  micro: { fontSize: 11, lineHeight: 14 },
} as const satisfies Record<string, TypeScaleEntry>;

/** Font weight tokens aligned with cross-platform string values. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Composed typography tokens exported as a single object for Theme. */
export const typography = {
  scale: typeScale,
  weight: fontWeight,
} as const;

export type TypeScaleKey = keyof typeof typeScale;
export type FontWeightKey = keyof typeof fontWeight;
export type TypographyTokens = typeof typography;
