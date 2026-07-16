/**
 * Dev-only, data-safe mobile performance marks (CU-092).
 *
 * Callers can supply only stable product-owned event codes, outcomes, and render
 * counts. The default sink passes that bounded DTO through the CU-088 runtime
 * sanitizer before writing a single local development log line. Production
 * builds never start a clock, retain a mark, emit an event, or require a network.
 */

import {
  createStructuredLogger,
  loadPublicEnv,
  resolveLogEnvironment,
  type LogEnvironment,
  type StructuredLogEntry,
} from '@primis/config';

export const PERFORMANCE_EVENT_CODES = {
  APP_COLD_ROOT_INITIALIZATION: 'app.cold_root_initialization',
  CHART_REPRESENTATIVE_RENDER: 'chart.representative_render',
  COACH_FIRST_TOKEN: 'coach.first_token',
  HOME_CACHED_WARM_RENDER: 'home.cached_warm_render',
  HOME_REFRESH_COMPLETION: 'home.refresh_completion',
  NAVIGATION_TAB_TRANSITION: 'navigation.tab_transition',
  NUTRITION_MANUAL_LOG_CACHE_COMMIT: 'nutrition.manual_log_cache_commit',
  SYNC_PROVIDER_REFRESH: 'sync.provider_refresh',
} as const;

export type PerformanceEventCode =
  (typeof PERFORMANCE_EVENT_CODES)[keyof typeof PERFORMANCE_EVENT_CODES];

export const PERFORMANCE_OUTCOMES = ['cancelled', 'completed', 'failed', 'not_visible'] as const;
export type PerformanceOutcome = (typeof PERFORMANCE_OUTCOMES)[number];

export interface SafePerformanceMeasurement {
  readonly eventCode: PerformanceEventCode;
  readonly durationMs: number;
  readonly outcome: PerformanceOutcome;
  readonly renderCount: number;
  readonly environment: LogEnvironment;
}

export type PerformanceClock = () => number;
export type PerformanceMeasurementSink = (measurement: SafePerformanceMeasurement) => void;

export interface PerformanceSpan {
  /** Idempotent: a second finish is ignored and emits nothing. */
  finish(
    outcome?: PerformanceOutcome,
    renderCount?: number,
  ): SafePerformanceMeasurement | undefined;
}

export interface PerformanceMarks {
  /** Starts an independent span. Nested spans with the same code are supported. */
  start(eventCode: PerformanceEventCode): PerformanceSpan;
  /** Finishes the newest active span for a code; missing starts are a safe no-op. */
  end(
    eventCode: PerformanceEventCode,
    outcome?: PerformanceOutcome,
    renderCount?: number,
  ): SafePerformanceMeasurement | undefined;
  /** Records a duration supplied by React Profiler without retaining a span. */
  record(
    eventCode: PerformanceEventCode,
    durationMs: number,
    outcome?: PerformanceOutcome,
    renderCount?: number,
  ): SafePerformanceMeasurement | undefined;
  /** Finishes all active spans as cancelled, used by dev profiling cleanup. */
  cancelAll(): void;
}

export interface CreatePerformanceMarksOptions {
  readonly enabled: boolean;
  readonly environment?: LogEnvironment;
  readonly now?: PerformanceClock;
  readonly sink?: PerformanceMeasurementSink;
}

interface ActiveSpan {
  readonly eventCode: PerformanceEventCode;
  readonly startedAt: number;
  finished: boolean;
}

const publicEnv = loadPublicEnv();
const defaultEnvironment = resolveLogEnvironment(publicEnv.APP_ENV);

export function isDevPerformanceEnabled(): boolean {
  return typeof __DEV__ === 'boolean' ? __DEV__ : publicEnv.NODE_ENV === 'development';
}

function defaultClock(): number {
  try {
    return globalThis.performance?.now() ?? Date.now();
  } catch {
    return Date.now();
  }
}

function safeElapsed(startedAt: number, finishedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return 0;
  return Math.max(0, finishedAt - startedAt);
}

function safeRenderCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

const devLogger = createStructuredLogger({
  service: 'primis-mobile',
  environment: defaultEnvironment,
  allowedEvents: ['mobile.performance.measurement'] as const,
  sink: (entry: StructuredLogEntry): void => {
    if (!isDevPerformanceEnabled()) return;
    // Bounded CU-088-sanitized output; never includes screen data or caller metadata.
    // eslint-disable-next-line no-console -- intentional low-volume dev-only profiling output
    console.info(`[primis-performance] ${JSON.stringify(entry)}`);
  },
});

const defaultSink: PerformanceMeasurementSink = (measurement) => {
  devLogger.emit('mobile.performance.measurement', measurement);
};

const NOOP_SPAN: PerformanceSpan = {
  finish: () => undefined,
};

export function createPerformanceMarks(options: CreatePerformanceMarksOptions): PerformanceMarks {
  const environment = options.environment ?? defaultEnvironment;
  const now = options.now ?? defaultClock;
  const sink = options.sink ?? defaultSink;
  const activeByCode = new Map<PerformanceEventCode, ActiveSpan[]>();

  function emitMeasurement(
    eventCode: PerformanceEventCode,
    durationMs: number,
    outcome: PerformanceOutcome,
    renderCount: number,
  ): SafePerformanceMeasurement | undefined {
    if (!options.enabled) return undefined;
    const measurement: SafePerformanceMeasurement = {
      eventCode,
      durationMs: safeElapsed(0, durationMs),
      outcome,
      renderCount: safeRenderCount(renderCount),
      environment,
    };
    try {
      sink(measurement);
    } catch {
      // Profiling must never affect the measured interaction.
    }
    return measurement;
  }

  function removeAndFinish(
    active: ActiveSpan,
    outcome: PerformanceOutcome,
    renderCount: number,
  ): SafePerformanceMeasurement | undefined {
    if (!options.enabled || active.finished) return undefined;
    active.finished = true;

    const stack = activeByCode.get(active.eventCode);
    if (stack !== undefined) {
      const index = stack.lastIndexOf(active);
      if (index >= 0) stack.splice(index, 1);
      if (stack.length === 0) activeByCode.delete(active.eventCode);
    }

    return emitMeasurement(
      active.eventCode,
      safeElapsed(active.startedAt, now()),
      outcome,
      renderCount,
    );
  }

  return {
    start(eventCode) {
      if (!options.enabled) return NOOP_SPAN;
      const active: ActiveSpan = { eventCode, startedAt: now(), finished: false };
      const stack = activeByCode.get(eventCode) ?? [];
      stack.push(active);
      activeByCode.set(eventCode, stack);
      return {
        finish: (outcome = 'completed', renderCount = 0) =>
          removeAndFinish(active, outcome, renderCount),
      };
    },
    end(eventCode, outcome = 'completed', renderCount = 0) {
      const active = activeByCode.get(eventCode)?.at(-1);
      return active === undefined ? undefined : removeAndFinish(active, outcome, renderCount);
    },
    record(eventCode, durationMs, outcome = 'completed', renderCount = 0) {
      return emitMeasurement(eventCode, durationMs, outcome, renderCount);
    },
    cancelAll() {
      for (const stack of [...activeByCode.values()]) {
        for (const active of [...stack]) removeAndFinish(active, 'cancelled', 0);
      }
    },
  };
}

export const performanceMarks = createPerformanceMarks({
  enabled: isDevPerformanceEnabled(),
  environment: defaultEnvironment,
});
