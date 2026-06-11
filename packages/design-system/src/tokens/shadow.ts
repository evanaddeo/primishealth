/**
 * Primis shadow / elevation tokens.
 * Source: UI/UX Spec §10.3 (UX-ELEV-001, UX-ELEV-002, UX-ELEV-003).
 *
 * Design rules:
 *   UX-ELEV-001: Do not stack multiple heavy shadows.
 *   UX-ELEV-002: Prefer border + surface contrast over dramatic shadows.
 *   UX-ELEV-003: Use glow effects sparingly for active/hero states only.
 *
 * React Native shadow properties are split across iOS (shadowColor/shadowOffset/
 * shadowOpacity/shadowRadius) and Android (elevation). Both are provided per level.
 *
 * // TODO(design): finalize exact shadow opacity values with founder; current
 *   values are intentionally restrained per UX-ELEV-002 (no heavy shadows).
 */

export interface ShadowTokenEntry {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  /** Android elevation equivalent. */
  readonly elevation: number;
}

export const shadows = {
  /** No shadow — flat surface. */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Subtle card lift — standard dark-mode card. */
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  /** Standard elevated panel. */
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  /** High-elevation surface (bottom sheets, modals). */
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 8,
  },
  /**
   * Accent glow for active/hero states (UX-ELEV-003: use sparingly).
   * shadowColor should be overridden with the active accent color at component level.
   * // TODO(design): confirm glow intensity and radius with founder.
   */
  glow: {
    shadowColor: '#3B8EFF', // placeholder; override with theme.colors.accent at use site
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 0,
  },
} as const satisfies Record<string, ShadowTokenEntry>;

export type ShadowTokens = typeof shadows;
export type ShadowKey = keyof ShadowTokens;
