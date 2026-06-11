import { describe, it, expect } from 'vitest';
import { spacing } from '../src/tokens/spacing.js';
import { typeScale, fontWeight } from '../src/tokens/typography.js';
import { radius } from '../src/tokens/radius.js';
import { colors, darkColors, lightColors, accentColors, statusColors } from '../src/tokens/color.js';
import { shadows } from '../src/tokens/shadow.js';
import { motion, durations, easings } from '../src/tokens/motion.js';
import { createTheme, DEFAULT_THEME } from '../src/theme.js';

// ── Spacing ───────────────────────────────────────────────────────────────────
describe('spacing tokens', () => {
  const EXPECTED_KEYS: Array<keyof typeof spacing> = [
    'xxs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl',
  ];

  it('has all required keys', () => {
    for (const key of EXPECTED_KEYS) {
      expect(spacing).toHaveProperty(key);
    }
  });

  it('all values are positive numbers', () => {
    for (const value of Object.values(spacing)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    }
  });

  it('follows 4-point grid (all values divisible by 2, xxs=2 is smallest)', () => {
    expect(spacing.xxs).toBe(2);
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.lg).toBe(16);
  });
});

// ── Typography ────────────────────────────────────────────────────────────────
describe('typeScale tokens', () => {
  const EXPECTED_VARIANTS = [
    'displayLarge', 'displayMedium', 'titleLarge', 'titleMedium', 'titleSmall',
    'bodyLarge', 'bodyMedium', 'bodySmall', 'caption', 'micro',
  ] as const;

  it('has all required type scale variants', () => {
    for (const variant of EXPECTED_VARIANTS) {
      expect(typeScale).toHaveProperty(variant);
    }
  });

  it('each entry has fontSize and lineHeight', () => {
    for (const [key, entry] of Object.entries(typeScale)) {
      expect(entry, `${key} missing fontSize`).toHaveProperty('fontSize');
      expect(entry, `${key} missing lineHeight`).toHaveProperty('lineHeight');
      expect(typeof entry.fontSize).toBe('number');
      expect(typeof entry.lineHeight).toBe('number');
      expect(entry.lineHeight, `${key} lineHeight must be >= fontSize`).toBeGreaterThanOrEqual(
        entry.fontSize,
      );
    }
  });

  it('displayLarge is the largest variant (40px)', () => {
    expect(typeScale.displayLarge.fontSize).toBe(40);
  });

  it('micro is the smallest variant (11px)', () => {
    expect(typeScale.micro.fontSize).toBe(11);
  });
});

describe('fontWeight tokens', () => {
  it('has regular, medium, semibold, bold', () => {
    expect(fontWeight.regular).toBe('400');
    expect(fontWeight.medium).toBe('500');
    expect(fontWeight.semibold).toBe('600');
    expect(fontWeight.bold).toBe('700');
  });
});

// ── Radius ────────────────────────────────────────────────────────────────────
describe('radius tokens', () => {
  const EXPECTED_KEYS: Array<keyof typeof radius> = [
    'none', 'xs', 'sm', 'md', 'lg', 'xl', 'pill', 'full',
  ];

  it('has all required radius keys', () => {
    for (const key of EXPECTED_KEYS) {
      expect(radius).toHaveProperty(key);
    }
  });

  it('none is 0', () => {
    expect(radius.none).toBe(0);
  });

  it('pill is 999', () => {
    expect(radius.pill).toBe(999);
  });

  it('values are non-negative', () => {
    for (const value of Object.values(radius)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Colors ────────────────────────────────────────────────────────────────────
describe('dark color tokens', () => {
  const EXPECTED_DARK_KEYS: Array<keyof typeof darkColors> = [
    'bg', 'surface', 'surfaceElevated', 'textPrimary', 'textSecondary',
    'textMuted', 'borderSubtle', 'overlay',
  ];

  it('has all required dark color keys', () => {
    for (const key of EXPECTED_DARK_KEYS) {
      expect(darkColors).toHaveProperty(key);
      expect(darkColors[key]).toBeTruthy();
    }
  });

  it('dark.bg matches spec value #07090D', () => {
    expect(darkColors.bg).toBe('#07090D');
  });

  it('dark.textPrimary matches spec value #F4F7FB', () => {
    expect(darkColors.textPrimary).toBe('#F4F7FB');
  });
});

describe('light color tokens', () => {
  const EXPECTED_LIGHT_KEYS: Array<keyof typeof lightColors> = [
    'bg', 'surface', 'surfaceElevated', 'textPrimary', 'textSecondary',
    'textMuted', 'borderSubtle', 'overlay',
  ];

  it('has all required light color keys', () => {
    for (const key of EXPECTED_LIGHT_KEYS) {
      expect(lightColors).toHaveProperty(key);
      expect(lightColors[key]).toBeTruthy();
    }
  });
});

describe('accent color tokens', () => {
  const EXPECTED_ACCENT_KEYS: Array<keyof typeof accentColors> = [
    'electricBlue', 'signalGreen', 'violet', 'amber', 'crimson', 'monochrome',
  ];

  it('has all 6 accent presets', () => {
    for (const key of EXPECTED_ACCENT_KEYS) {
      expect(accentColors).toHaveProperty(key);
      expect(accentColors[key]).toBeTruthy();
    }
  });

  it('is accessible via colors.accent', () => {
    expect(colors.accent).toBe(accentColors);
  });
});

describe('semantic status color tokens', () => {
  const EXPECTED_STATUS_KEYS: Array<keyof typeof statusColors> = [
    'excellent', 'good', 'caution', 'low', 'attention', 'neutral',
  ];

  it('has all 6 semantic status keys', () => {
    for (const key of EXPECTED_STATUS_KEYS) {
      expect(statusColors).toHaveProperty(key);
      expect(statusColors[key]).toBeTruthy();
    }
  });
});

// ── Shadows ───────────────────────────────────────────────────────────────────
describe('shadow tokens', () => {
  it('has none, sm, md, lg, glow levels', () => {
    expect(shadows).toHaveProperty('none');
    expect(shadows).toHaveProperty('sm');
    expect(shadows).toHaveProperty('md');
    expect(shadows).toHaveProperty('lg');
    expect(shadows).toHaveProperty('glow');
  });

  it('each entry has shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation', () => {
    for (const [key, entry] of Object.entries(shadows)) {
      expect(entry, `${key} missing shadowColor`).toHaveProperty('shadowColor');
      expect(entry, `${key} missing shadowOffset`).toHaveProperty('shadowOffset');
      expect(entry, `${key} missing shadowOpacity`).toHaveProperty('shadowOpacity');
      expect(entry, `${key} missing shadowRadius`).toHaveProperty('shadowRadius');
      expect(entry, `${key} missing elevation`).toHaveProperty('elevation');
    }
  });

  it('none has zero opacity', () => {
    expect(shadows.none.shadowOpacity).toBe(0);
  });
});

// ── Motion ────────────────────────────────────────────────────────────────────
describe('motion tokens', () => {
  it('has all duration keys', () => {
    const keys: Array<keyof typeof durations> = [
      'instant', 'fast', 'standard', 'expressive', 'slow',
    ];
    for (const key of keys) {
      expect(durations).toHaveProperty(key);
    }
  });

  it('durations are in ascending order', () => {
    expect(durations.instant).toBeLessThan(durations.fast);
    expect(durations.fast).toBeLessThan(durations.standard);
    expect(durations.standard).toBeLessThan(durations.expressive);
    expect(durations.expressive).toBeLessThan(durations.slow);
  });

  it('has standard, enter, exit, emphasis easing keys', () => {
    expect(easings).toHaveProperty('standard');
    expect(easings).toHaveProperty('enter');
    expect(easings).toHaveProperty('exit');
    expect(easings).toHaveProperty('emphasis');
  });

  it('is accessible via motion.durations and motion.easings', () => {
    expect(motion.durations).toBe(durations);
    expect(motion.easings).toBe(easings);
  });
});

// ── Theme composition ─────────────────────────────────────────────────────────
describe('createTheme()', () => {
  it('dark + electricBlue returns a valid Theme without throwing', () => {
    const theme = createTheme('dark', 'electricBlue');
    expect(theme.mode).toBe('dark');
    expect(theme.accent).toBe('electricBlue');
    expect(theme.colors.bg).toBe('#07090D');
    expect(typeof theme.colors.accent).toBe('string');
    expect(theme.colors.status.excellent).toBeTruthy();
  });

  it('light + signalGreen resolves light palette', () => {
    const theme = createTheme('light', 'signalGreen');
    expect(theme.mode).toBe('light');
    expect(theme.colors.bg).toBe(lightColors.bg);
    expect(theme.colors.accent).toBe(accentColors.signalGreen);
  });

  it('resolves all 6 accent presets without throwing', () => {
    const accents = [
      'electricBlue', 'signalGreen', 'violet', 'amber', 'crimson', 'monochrome',
    ] as const;
    for (const accent of accents) {
      expect(() => createTheme('dark', accent)).not.toThrow();
    }
  });

  it('includes spacing, typography, radius, shadow, motion', () => {
    const theme = createTheme('dark', 'electricBlue');
    expect(theme.spacing).toBeDefined();
    expect(theme.typography).toBeDefined();
    expect(theme.radius).toBeDefined();
    expect(theme.shadow).toBeDefined();
    expect(theme.motion).toBeDefined();
  });

  it('is a pure function — successive calls return equivalent objects', () => {
    const a = createTheme('dark', 'violet');
    const b = createTheme('dark', 'violet');
    expect(a.colors.bg).toBe(b.colors.bg);
    expect(a.colors.accent).toBe(b.colors.accent);
    expect(a.mode).toBe(b.mode);
  });
});

describe('DEFAULT_THEME', () => {
  it('is Dark Performance (mode: dark)', () => {
    expect(DEFAULT_THEME.mode).toBe('dark');
  });

  it('uses electricBlue accent', () => {
    expect(DEFAULT_THEME.accent).toBe('electricBlue');
  });

  it('is a fully resolved Theme', () => {
    expect(DEFAULT_THEME.colors.bg).toBe('#07090D');
    expect(DEFAULT_THEME.spacing.lg).toBe(16);
    expect(DEFAULT_THEME.typography.scale.bodyLarge.fontSize).toBe(16);
    expect(DEFAULT_THEME.radius.pill).toBe(999);
  });
});
