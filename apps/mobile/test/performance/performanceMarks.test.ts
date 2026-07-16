import { describe, expect, it, vi } from 'vitest';

import {
  PERFORMANCE_EVENT_CODES,
  PERFORMANCE_OUTCOMES,
  createPerformanceMarks,
  type SafePerformanceMeasurement,
} from '../../src/performance/performanceMarks';

function clockFrom(values: readonly number[]) {
  let index = 0;
  return vi.fn(() => values[index++] ?? values.at(-1) ?? 0);
}

describe('mobile performance marks', () => {
  it('keeps stable event codes and outcomes', () => {
    expect(PERFORMANCE_EVENT_CODES).toEqual({
      APP_COLD_ROOT_INITIALIZATION: 'app.cold_root_initialization',
      CHART_REPRESENTATIVE_RENDER: 'chart.representative_render',
      COACH_FIRST_TOKEN: 'coach.first_token',
      HOME_CACHED_WARM_RENDER: 'home.cached_warm_render',
      HOME_REFRESH_COMPLETION: 'home.refresh_completion',
      NAVIGATION_TAB_TRANSITION: 'navigation.tab_transition',
      NUTRITION_MANUAL_LOG_CACHE_COMMIT: 'nutrition.manual_log_cache_commit',
      SYNC_PROVIDER_REFRESH: 'sync.provider_refresh',
    });
    expect(PERFORMANCE_OUTCOMES).toEqual(['cancelled', 'completed', 'failed', 'not_visible']);
  });

  it('calculates duration with an injected clock when dev-enabled', () => {
    const events: SafePerformanceMeasurement[] = [];
    const marks = createPerformanceMarks({
      enabled: true,
      environment: 'dev',
      now: clockFrom([100, 137.5]),
      sink: (event) => events.push(event),
    });

    const result = marks
      .start(PERFORMANCE_EVENT_CODES.HOME_REFRESH_COMPLETION)
      .finish('completed', 2);

    expect(result).toEqual({
      eventCode: 'home.refresh_completion',
      durationMs: 37.5,
      outcome: 'completed',
      renderCount: 2,
      environment: 'dev',
    });
    expect(events).toEqual([result]);
  });

  it('is a clock-free and sink-free no-op when disabled for production', () => {
    const now = vi.fn(() => 1);
    const sink = vi.fn();
    const marks = createPerformanceMarks({ enabled: false, environment: 'prod', now, sink });

    const span = marks.start(PERFORMANCE_EVENT_CODES.APP_COLD_ROOT_INITIALIZATION);
    expect(span.finish()).toBeUndefined();
    expect(marks.end(PERFORMANCE_EVENT_CODES.APP_COLD_ROOT_INITIALIZATION)).toBeUndefined();
    expect(marks.record(PERFORMANCE_EVENT_CODES.CHART_REPRESENTATIVE_RENDER, 12)).toBeUndefined();
    marks.cancelAll();

    expect(now).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });

  it('supports nested and repeated marks while missing starts are safe', () => {
    const sink = vi.fn();
    const marks = createPerformanceMarks({
      enabled: true,
      environment: 'test',
      now: clockFrom([0, 5, 9, 12, 20, 24]),
      sink,
    });
    const code = PERFORMANCE_EVENT_CODES.NAVIGATION_TAB_TRANSITION;

    const outer = marks.start(code);
    marks.start(code);
    expect(marks.end(code)?.durationMs).toBe(4);
    expect(outer.finish()?.durationMs).toBe(12);
    expect(marks.end(code)).toBeUndefined();
    expect(marks.start(code).finish()?.durationMs).toBe(4);
    expect(sink).toHaveBeenCalledTimes(3);
  });

  it('emits first-token-style spans once and accepts no caller metadata', () => {
    const events: SafePerformanceMeasurement[] = [];
    const marks = createPerformanceMarks({
      enabled: true,
      environment: 'dev',
      now: clockFrom([10, 15]),
      sink: (event) => events.push(event),
    });
    const unsafeStart = marks.start as unknown as (
      code: string,
      metadata: unknown,
    ) => ReturnType<typeof marks.start>;

    const span = unsafeStart(PERFORMANCE_EVENT_CODES.COACH_FIRST_TOKEN, {
      prompt: 'private prompt',
      userId: 'private-user',
    });
    span.finish('completed');
    expect(span.finish('completed')).toBeUndefined();

    expect(events).toEqual([
      {
        eventCode: 'coach.first_token',
        durationMs: 5,
        outcome: 'completed',
        renderCount: 0,
        environment: 'dev',
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('cancels active spans during cleanup', () => {
    const events: SafePerformanceMeasurement[] = [];
    const marks = createPerformanceMarks({
      enabled: true,
      environment: 'dev',
      now: clockFrom([3, 8]),
      sink: (event) => events.push(event),
    });
    marks.start(PERFORMANCE_EVENT_CODES.CHART_REPRESENTATIVE_RENDER);
    marks.cancelAll();

    expect(events).toEqual([
      {
        eventCode: 'chart.representative_render',
        durationMs: 5,
        outcome: 'cancelled',
        renderCount: 0,
        environment: 'dev',
      },
    ]);
  });
});
