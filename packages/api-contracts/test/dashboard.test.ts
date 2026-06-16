/**
 * Tests for CU-056 home dashboard summary DTOs.
 *
 * Coverage:
 * - TodayDashboardResponseDtoSchema validates the representative fixture.
 * - Score slots reuse ScoreSnapshotDto (the §29.1 ScoreSummary) and are optional.
 * - InsightCard / RecommendationCard / DashboardWidgetSummary schemas validate.
 * - BedtimeWidgetSummary is optional and validates when present.
 * - Invalid localDate, bad severity, and out-of-range score fail validation.
 * - DASHBOARD_SCORE_SLOTS lists the six §29.1 score keys.
 */

import { describe, expect, it } from 'vitest';

import {
  TodayDashboardResponseDtoSchema,
  InsightCardDtoSchema,
  RecommendationCardDtoSchema,
  DashboardWidgetSummaryDtoSchema,
  BedtimeWidgetSummaryDtoSchema,
  DashboardScoresDtoSchema,
  DASHBOARD_SCORE_SLOTS,
  TODAY_DASHBOARD_FIXTURE,
} from '../src/dashboard.js';

describe('TodayDashboardResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    const result = TodayDashboardResponseDtoSchema.safeParse(TODAY_DASHBOARD_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('accepts an empty dashboard (no-data new user)', () => {
    const result = TodayDashboardResponseDtoSchema.safeParse({
      localDate: '2026-06-15',
      lastSyncedAt: null,
      scores: {},
      topInsights: [],
      recommendations: [],
      providerSyncStatus: [],
      widgets: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed localDate', () => {
    const result = TodayDashboardResponseDtoSchema.safeParse({
      ...TODAY_DASHBOARD_FIXTURE,
      localDate: '06/15/2026',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional bedtimeWidget', () => {
    const result = TodayDashboardResponseDtoSchema.safeParse({
      ...TODAY_DASHBOARD_FIXTURE,
      bedtimeWidget: {
        localDate: '2026-06-15',
        state: 'available',
        score: 88,
        band: 'excellent',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('DashboardScoresDtoSchema', () => {
  it('treats every score slot as optional', () => {
    expect(DashboardScoresDtoSchema.safeParse({}).success).toBe(true);
  });

  it('exposes the six §29.1 score slots', () => {
    expect([...DASHBOARD_SCORE_SLOTS]).toEqual([
      'sleep',
      'recovery',
      'trainingReadiness',
      'activity',
      'nutrition',
      'wellbeing',
    ]);
  });
});

describe('InsightCardDtoSchema', () => {
  it('validates a card and rejects an unknown severity', () => {
    const valid = {
      id: 'i1',
      insightType: 'recovery_driver',
      title: 'HRV up',
      severity: 'positive',
      localDate: '2026-06-15',
      recommendedAction: null,
      relatedMetricCodes: ['hrv_rmssd'],
      generatedAt: '2026-06-15T07:35:00Z',
    };
    expect(InsightCardDtoSchema.safeParse(valid).success).toBe(true);
    expect(InsightCardDtoSchema.safeParse({ ...valid, severity: 'medical' }).success).toBe(false);
  });
});

describe('RecommendationCardDtoSchema', () => {
  it('requires a non-empty action', () => {
    const base = {
      id: 'r1',
      title: 'Train moderately',
      severity: 'info' as const,
      generatedAt: '2026-06-15T07:35:00Z',
    };
    expect(RecommendationCardDtoSchema.safeParse({ ...base, action: 'Go for it' }).success).toBe(
      true,
    );
    expect(RecommendationCardDtoSchema.safeParse({ ...base, action: '' }).success).toBe(false);
  });
});

describe('DashboardWidgetSummaryDtoSchema', () => {
  it('validates an ordered widget descriptor', () => {
    expect(
      DashboardWidgetSummaryDtoSchema.safeParse({
        widgetType: 'recovery_score',
        displayOrder: 0,
        isVisible: true,
        size: 'large',
      }).success,
    ).toBe(true);
  });
});

describe('BedtimeWidgetSummaryDtoSchema', () => {
  it('accepts a null score with a null band', () => {
    expect(
      BedtimeWidgetSummaryDtoSchema.safeParse({
        localDate: '2026-06-15',
        state: 'not_enough_data',
        score: null,
        band: null,
      }).success,
    ).toBe(true);
  });

  it('rejects an out-of-range score', () => {
    expect(
      BedtimeWidgetSummaryDtoSchema.safeParse({
        localDate: '2026-06-15',
        state: 'available',
        score: 140,
        band: 'excellent',
      }).success,
    ).toBe(false);
  });
});
