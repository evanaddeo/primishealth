/**
 * Chart primitive tests (CU-020).
 *
 * Covers:
 *   - ChartPoint type contract: y accepts null (UX-CHART-007 / spec requirement).
 *   - SleepStageSegment stage values cover all four sleep stages.
 *   - resolveSegmentFraction() proportional width computation.
 *   - resolveChartStateLabel() returns correct overlay text per state.
 *   - resolveChartEmptyHint() returns guidance for empty/error, null for others.
 *   - resolveRingArcDegrees() clamps and maps 0–100 to 0–360 degrees.
 *   - resolveStageLaneIndex() ordering: awake(0) < rem(1) < light(2) < deep(3).
 *   - resolveStageColor() returns a non-empty string for every stage.
 *   - STAGE_COLORS / STAGE_LABELS cover all four sleep stages.
 *   - ChartState exhaustive check (all four values accepted at runtime).
 *
 * Note on component rendering tests:
 *   Full RNTL component rendering tests (e.g. "LineChart renders without throwing")
 *   are deferred to apps/mobile per OQ-001: the React Native test renderer requires
 *   a dedicated environment beyond Vitest/node. Tests here exercise the pure resolver
 *   functions that contain all non-trivial logic in the chart scaffold.
 */

import { describe, it, expect } from 'vitest';

import {
  STAGE_COLORS,
  STAGE_LABELS,
  STAGE_LANE_INDEX,
  resolveSegmentFraction,
  resolveChartStateLabel,
  resolveChartEmptyHint,
  resolveRingArcDegrees,
  resolveStageLaneIndex,
  resolveStageColor,
} from '../src/charts/chartResolvers.js';
import type { ChartPoint, SleepStage, SleepStageSegment, ChartState } from '../src/charts/types.js';

// ── ChartPoint type contract ───────────────────────────────────────────────────

describe('ChartPoint type contract', () => {
  it('accepts y: null — null must be used for missing data gaps (UX-CHART-007)', () => {
    // If this compiles and runs, the type correctly allows null (not just undefined).
    const point: ChartPoint = { x: 1_700_000_000_000, y: null };
    expect(point.y).toBeNull();
  });

  it('accepts y: number — normal data points work alongside null', () => {
    const point: ChartPoint = { x: '2024-01-15', y: 72.5 };
    expect(point.y).toBe(72.5);
  });

  it('accepts x as a Unix timestamp (number)', () => {
    const point: ChartPoint = { x: 1_700_000_000_000, y: 65 };
    expect(typeof point.x).toBe('number');
  });

  it('accepts x as an ISO date string', () => {
    const point: ChartPoint = { x: '2024-01-15', y: 65 };
    expect(typeof point.x).toBe('string');
  });

  it('accepts an optional label field', () => {
    const point: ChartPoint = { x: 0, y: 100, label: '7-day peak' };
    expect(point.label).toBe('7-day peak');
  });
});

// ── SleepStageSegment type contract ───────────────────────────────────────────

describe('SleepStageSegment type contract', () => {
  const ALL_STAGES: SleepStage[] = ['awake', 'rem', 'light', 'deep'];

  it('covers all four sleep stage values', () => {
    expect(ALL_STAGES).toHaveLength(4);
    expect(ALL_STAGES).toContain('awake');
    expect(ALL_STAGES).toContain('rem');
    expect(ALL_STAGES).toContain('light');
    expect(ALL_STAGES).toContain('deep');
  });

  it('constructs a valid SleepStageSegment for each stage', () => {
    ALL_STAGES.forEach((stage) => {
      const segment: SleepStageSegment = {
        id: `seg-${stage}`,
        stage,
        startMs: 0,
        endMs: 900_000,
      };
      expect(segment.stage).toBe(stage);
    });
  });
});

// ── ChartState type contract ───────────────────────────────────────────────────

describe('ChartState type contract', () => {
  const ALL_STATES: ChartState[] = ['loading', 'empty', 'error', 'data'];

  it('covers all four state values', () => {
    expect(ALL_STATES).toHaveLength(4);
  });

  it('resolveChartStateLabel returns a string for all non-data states', () => {
    const nonDataStates: ChartState[] = ['loading', 'empty', 'error'];
    nonDataStates.forEach((state) => {
      expect(typeof resolveChartStateLabel(state)).toBe('string');
    });
  });

  it('resolveChartStateLabel returns null for data state — no overlay', () => {
    expect(resolveChartStateLabel('data')).toBeNull();
  });
});

// ── STAGE_COLORS / STAGE_LABELS completeness ──────────────────────────────────

describe('STAGE_COLORS', () => {
  const ALL_STAGES: SleepStage[] = ['awake', 'rem', 'light', 'deep'];

  it('has an entry for every sleep stage', () => {
    ALL_STAGES.forEach((stage) => {
      expect(STAGE_COLORS[stage]).toBeDefined();
    });
  });

  it('all stage colors are non-empty strings', () => {
    ALL_STAGES.forEach((stage) => {
      expect(typeof STAGE_COLORS[stage]).toBe('string');
      expect(STAGE_COLORS[stage].length).toBeGreaterThan(0);
    });
  });

  it('all four stage colors are distinct', () => {
    const values = ALL_STAGES.map((s) => STAGE_COLORS[s]);
    const unique = new Set(values);
    expect(unique.size).toBe(ALL_STAGES.length);
  });
});

describe('STAGE_LABELS', () => {
  const ALL_STAGES: SleepStage[] = ['awake', 'rem', 'light', 'deep'];

  it('has a label for every sleep stage', () => {
    ALL_STAGES.forEach((stage) => {
      expect(STAGE_LABELS[stage]).toBeDefined();
    });
  });

  it('all labels are non-empty strings (UX-CHART-005: not color-only)', () => {
    ALL_STAGES.forEach((stage) => {
      expect(typeof STAGE_LABELS[stage]).toBe('string');
      expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
    });
  });
});

// ── resolveSegmentFraction ────────────────────────────────────────────────────

describe('resolveSegmentFraction()', () => {
  it('returns 0.5 when segment is half the total', () => {
    expect(resolveSegmentFraction(900_000, 1_800_000)).toBe(0.5);
  });

  it('returns 1 when segment equals the total', () => {
    expect(resolveSegmentFraction(3_600_000, 3_600_000)).toBe(1);
  });

  it('clamps to 1 when segment exceeds total (defensive)', () => {
    expect(resolveSegmentFraction(5_000, 3_000)).toBe(1);
  });

  it('returns 0 when totalDurationMs is zero (no division by zero)', () => {
    expect(resolveSegmentFraction(1_000, 0)).toBe(0);
  });

  it('returns 0 when segmentDurationMs is zero', () => {
    expect(resolveSegmentFraction(0, 3_600_000)).toBe(0);
  });

  it('returns 0 for negative values (degenerate input)', () => {
    expect(resolveSegmentFraction(-500, 1_800_000)).toBe(0);
    expect(resolveSegmentFraction(500, -1_800_000)).toBe(0);
  });
});

// ── resolveChartStateLabel ────────────────────────────────────────────────────

describe('resolveChartStateLabel()', () => {
  it('returns a non-empty string for loading', () => {
    const label = resolveChartStateLabel('loading');
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for empty (UX-EMPTY-001)', () => {
    const label = resolveChartStateLabel('empty');
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for error', () => {
    const label = resolveChartStateLabel('error');
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  it('returns null for data — no overlay should mount', () => {
    expect(resolveChartStateLabel('data')).toBeNull();
  });
});

// ── resolveChartEmptyHint ─────────────────────────────────────────────────────

describe('resolveChartEmptyHint()', () => {
  it('returns a hint string for empty state (UX-EMPTY-002)', () => {
    const hint = resolveChartEmptyHint('empty');
    expect(typeof hint).toBe('string');
    expect((hint as string).length).toBeGreaterThan(0);
  });

  it('returns a hint string for error state', () => {
    const hint = resolveChartEmptyHint('error');
    expect(typeof hint).toBe('string');
    expect((hint as string).length).toBeGreaterThan(0);
  });

  it('returns null for loading state — no secondary hint during fetch', () => {
    expect(resolveChartEmptyHint('loading')).toBeNull();
  });

  it('returns null for data state', () => {
    expect(resolveChartEmptyHint('data')).toBeNull();
  });
});

// ── resolveRingArcDegrees ─────────────────────────────────────────────────────

describe('resolveRingArcDegrees()', () => {
  it('maps 0 to 0 degrees', () => {
    expect(resolveRingArcDegrees(0)).toBe(0);
  });

  it('maps 100 to 360 degrees (full arc)', () => {
    expect(resolveRingArcDegrees(100)).toBe(360);
  });

  it('maps 50 to 180 degrees (half arc)', () => {
    expect(resolveRingArcDegrees(50)).toBe(180);
  });

  it('maps 75 to 270 degrees', () => {
    expect(resolveRingArcDegrees(75)).toBe(270);
  });

  it('clamps values above 100 to 360', () => {
    expect(resolveRingArcDegrees(120)).toBe(360);
  });

  it('clamps negative values to 0', () => {
    expect(resolveRingArcDegrees(-10)).toBe(0);
  });
});

// ── resolveStageLaneIndex ─────────────────────────────────────────────────────

describe('resolveStageLaneIndex()', () => {
  it('awake is lane 0 (shallowest / top)', () => {
    expect(resolveStageLaneIndex('awake')).toBe(0);
  });

  it('rem is lane 1', () => {
    expect(resolveStageLaneIndex('rem')).toBe(1);
  });

  it('light is lane 2', () => {
    expect(resolveStageLaneIndex('light')).toBe(2);
  });

  it('deep is lane 3 (deepest / bottom)', () => {
    expect(resolveStageLaneIndex('deep')).toBe(3);
  });

  it('STAGE_LANE_INDEX and resolveStageLaneIndex() are consistent', () => {
    const stages: SleepStage[] = ['awake', 'rem', 'light', 'deep'];
    stages.forEach((stage) => {
      expect(resolveStageLaneIndex(stage)).toBe(STAGE_LANE_INDEX[stage]);
    });
  });

  it('stages are ordered shallowest to deepest', () => {
    expect(resolveStageLaneIndex('awake')).toBeLessThan(resolveStageLaneIndex('rem'));
    expect(resolveStageLaneIndex('rem')).toBeLessThan(resolveStageLaneIndex('light'));
    expect(resolveStageLaneIndex('light')).toBeLessThan(resolveStageLaneIndex('deep'));
  });
});

// ── resolveStageColor ─────────────────────────────────────────────────────────

describe('resolveStageColor()', () => {
  const ALL_STAGES: SleepStage[] = ['awake', 'rem', 'light', 'deep'];

  it('returns a non-empty string color for every stage', () => {
    ALL_STAGES.forEach((stage) => {
      const color = resolveStageColor(stage);
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    });
  });

  it('is consistent with STAGE_COLORS map', () => {
    ALL_STAGES.forEach((stage) => {
      expect(resolveStageColor(stage)).toBe(STAGE_COLORS[stage]);
    });
  });
});
