/**
 * Component pure-logic tests.
 *
 * These tests run in the 'node' environment (see vitest.config.ts) and have no
 * React Native runtime. They exercise the pure utility functions in
 * src/utils/componentResolvers.ts that power the UI primitive components.
 *
 * Full RNTL component rendering tests are deferred to apps/mobile per OQ-001:
 * the React Native test renderer requires a dedicated environment beyond Vitest/node.
 * // TODO(ADR): document OQ-001 resolution once RNTL test strategy is decided.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveMetricDisplay,
  resolveStatusLabel,
  resolveStatusForeground,
  resolveStatusBackground,
  resolveProgressFill,
} from '../src/utils/componentResolvers.js';
import { statusColors } from '../src/tokens/color.js';

// ── MetricValue ───────────────────────────────────────────────────────────────

describe('resolveMetricDisplay()', () => {
  it('returns em dash for null', () => {
    expect(resolveMetricDisplay(null)).toBe('—');
  });

  it('coerces integers to string', () => {
    expect(resolveMetricDisplay(42)).toBe('42');
    expect(resolveMetricDisplay(0)).toBe('0');
  });

  it('coerces floats to string', () => {
    expect(resolveMetricDisplay(98.6)).toBe('98.6');
  });

  it('passes string values through unchanged', () => {
    expect(resolveMetricDisplay('72 bpm')).toBe('72 bpm');
    expect(resolveMetricDisplay('')).toBe('');
  });
});

// ── StatusBadge labels ────────────────────────────────────────────────────────

describe('resolveStatusLabel() — ScoreBand values', () => {
  it('maps excellent', () => expect(resolveStatusLabel('excellent')).toBe('Excellent'));
  it('maps good', () => expect(resolveStatusLabel('good')).toBe('Good'));
  it('maps moderate', () => expect(resolveStatusLabel('moderate')).toBe('Moderate'));
  it('maps low', () => expect(resolveStatusLabel('low')).toBe('Low'));
  it('maps very_low', () => expect(resolveStatusLabel('very_low')).toBe('Very Low'));
});

describe('resolveStatusLabel() — ScoreState values', () => {
  it('maps available', () => expect(resolveStatusLabel('available')).toBe('Available'));
  it('maps provisional', () => expect(resolveStatusLabel('provisional')).toBe('Provisional'));
  it('maps not_enough_data', () =>
    expect(resolveStatusLabel('not_enough_data')).toBe('Insufficient Data'));
  it('maps missing_required_data', () =>
    expect(resolveStatusLabel('missing_required_data')).toBe('Missing Data'));
  it('maps stale_data', () => expect(resolveStatusLabel('stale_data')).toBe('Data Stale'));
  it('maps provider_unavailable', () =>
    expect(resolveStatusLabel('provider_unavailable')).toBe('Unavailable'));
  it('maps calculation_error', () =>
    expect(resolveStatusLabel('calculation_error')).toBe('Error'));
});

describe('resolveStatusLabel() — fallback', () => {
  it('maps unknown', () => expect(resolveStatusLabel('unknown')).toBe('Unknown'));
});

// ── StatusBadge colors ────────────────────────────────────────────────────────

describe('resolveStatusForeground()', () => {
  it('excellent → status.excellent color', () => {
    expect(resolveStatusForeground('excellent', statusColors)).toBe(statusColors.excellent);
  });

  it('good and available → status.good color', () => {
    expect(resolveStatusForeground('good', statusColors)).toBe(statusColors.good);
    expect(resolveStatusForeground('available', statusColors)).toBe(statusColors.good);
  });

  it('moderate and provisional → status.caution color', () => {
    expect(resolveStatusForeground('moderate', statusColors)).toBe(statusColors.caution);
    expect(resolveStatusForeground('provisional', statusColors)).toBe(statusColors.caution);
  });

  it('low / not_enough_data / stale_data → status.low (orange per UX-COLOR-002)', () => {
    expect(resolveStatusForeground('low', statusColors)).toBe(statusColors.low);
    expect(resolveStatusForeground('not_enough_data', statusColors)).toBe(statusColors.low);
    expect(resolveStatusForeground('stale_data', statusColors)).toBe(statusColors.low);
  });

  it('very_low / missing_required_data / calculation_error → status.attention', () => {
    expect(resolveStatusForeground('very_low', statusColors)).toBe(statusColors.attention);
    expect(resolveStatusForeground('missing_required_data', statusColors)).toBe(
      statusColors.attention,
    );
    expect(resolveStatusForeground('calculation_error', statusColors)).toBe(
      statusColors.attention,
    );
  });

  it('provider_unavailable / unknown → status.neutral', () => {
    expect(resolveStatusForeground('provider_unavailable', statusColors)).toBe(
      statusColors.neutral,
    );
    expect(resolveStatusForeground('unknown', statusColors)).toBe(statusColors.neutral);
  });
});

describe('resolveStatusBackground()', () => {
  it('appends 26 (≈15% alpha) to the foreground color hex', () => {
    const fg = resolveStatusForeground('excellent', statusColors);
    expect(resolveStatusBackground('excellent', statusColors)).toBe(`${fg}26`);
  });

  it('background is correctly derived for all ScoreBand values', () => {
    const bands = ['excellent', 'good', 'moderate', 'low', 'very_low'] as const;
    for (const band of bands) {
      const fg = resolveStatusForeground(band, statusColors);
      expect(resolveStatusBackground(band, statusColors)).toBe(`${fg}26`);
    }
  });
});

// ── ProgressBar ───────────────────────────────────────────────────────────────

describe('resolveProgressFill()', () => {
  it('returns 0.5 for value 50', () => {
    expect(resolveProgressFill(50)).toBe(0.5);
  });

  it('returns 0 for value 0', () => {
    expect(resolveProgressFill(0)).toBe(0);
  });

  it('returns 1 for value 100', () => {
    expect(resolveProgressFill(100)).toBe(1);
  });

  it('clamps values above 100 to 1', () => {
    expect(resolveProgressFill(150)).toBe(1);
    expect(resolveProgressFill(Infinity)).toBe(1);
  });

  it('clamps values below 0 to 0', () => {
    expect(resolveProgressFill(-10)).toBe(0);
    expect(resolveProgressFill(-Infinity)).toBe(0);
  });

  it('handles fractional values correctly', () => {
    expect(resolveProgressFill(25)).toBe(0.25);
    expect(resolveProgressFill(75)).toBe(0.75);
  });
});
