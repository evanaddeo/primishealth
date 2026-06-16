/**
 * Home dashboard summary route for the Primis API (CU-056).
 *
 * Route layout (requires `authMiddleware`, mounted at `/api/v1/dashboard`):
 *   GET /today            — home dashboard summary for the latest local date
 *   GET /today?date=YYYY-MM-DD — same summary for an explicit local date
 *
 * Reads PRECOMPUTED rows only (Scoring Spec §29.1; TAD no-heavy-compute request
 * path): `score_snapshots` (+ the §8.4 quality block stored in `metadata`),
 * `insight_candidates`, `dashboard_widgets`, and `provider_connections`. The
 * scoring engines run in `services/workers` (CU-055); this handler performs NO
 * score math — it only maps stored rows into the `@primis/api-contracts`
 * dashboard DTOs and assigns provider recency for display freshness.
 *
 * Data states handled (Scoring Spec §6.3): available / provisional / stale_data
 * carry a value; not_enough_data / missing_required_data / provider_unavailable /
 * calculation_error carry a null value. A user with no snapshots at all yields a
 * well-formed empty dashboard (no scores, empty insight/widget lists).
 *
 * Safety: never exposes raw provider payloads, secret refs, insight
 * `structured_summary`/AI copy, or token metadata. Only display-safe fields ship.
 *
 * @see packages/api-contracts/src/dashboard.ts — response contract
 * @see docs/decisions/ADR-005-dashboard-endpoint-shape.md — path/shape alignment
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  TodayDashboardResponseDtoSchema,
  InsightSeveritySchema,
  ScoreStateDtoSchema,
  ScoreDriverDtoSchema,
  MissingMetricDtoSchema,
  ScoreQualityMetadataDtoSchema,
  ScoreTypeDtoSchema,
  type TodayDashboardResponseDto,
  type DashboardScoresDto,
  type ScoreSnapshotDto,
  type ScoreDriverDto,
  type MissingMetricDto,
  type ScoreQualityMetadataDto,
  type InsightCardDto,
  type RecommendationCardDto,
  type DashboardWidgetSummaryDto,
  type BedtimeWidgetSummaryDto,
  type ProviderFreshnessDto,
} from '@primis/api-contracts';
import type { ScoreBand, ScoreState, ScoreType } from '@primis/core-types';

import type { AuthVariables } from '../auth/authMiddleware.js';
import { db } from '../db/client.js';
import { getAllScoreSnapshotsForDate } from '../repositories/scoreRepository.js';
import { getInsightsForDate } from '../repositories/insightRepository.js';
import { findConnectionsByUser } from '../repositories/providerRepository.js';
import { getWidgets } from '../repositories/dashboardRepository.js';
import type {
  ScoreSnapshot,
  InsightCandidate,
  ProviderConnection,
  DashboardWidget,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** States whose snapshot carries a usable composite value (Scoring Spec §6.3). */
const SCORABLE_STATES: ReadonlySet<ScoreState> = new Set<ScoreState>([
  'available',
  'provisional',
  'stale_data',
]);

/** Maximum insight cards surfaced on the dashboard. */
const MAX_TOP_INSIGHTS = 5;

/** Maximum recommendation cards surfaced on the dashboard. */
const MAX_RECOMMENDATIONS = 5;

/**
 * Provider is considered stale for the dashboard banner past this many hours
 * since the last successful sync (Scoring Spec §8.2 — recencyScore drops to 25
 * at 24h and 0 beyond 48h).
 */
const STALE_AFTER_HOURS = 24;

/**
 * Maps a persisted `score_snapshots.score_type` (data model §16.1 CHECK value)
 * to its dashboard slot key and the canonical `@primis/core-types` ScoreType.
 *
 * `strain_score` and `bedtime_adherence_score` are intentionally absent: strain
 * is not a dashboard score slot, and bedtime is surfaced via `bedtimeWidget`.
 */
const DB_SCORE_TYPE_TO_SLOT: Readonly<
  Record<string, { readonly slot: keyof DashboardScoresDto; readonly scoreType: ScoreType }>
> = {
  sleep_score: { slot: 'sleep', scoreType: 'sleep' },
  recovery_score: { slot: 'recovery', scoreType: 'recovery' },
  training_readiness_score: { slot: 'trainingReadiness', scoreType: 'training_readiness' },
  activity_score: { slot: 'activity', scoreType: 'activity' },
  nutrition_score: { slot: 'nutrition', scoreType: 'nutrition' },
  wellbeing_score: { slot: 'wellbeing', scoreType: 'wellbeing' },
};

/** Persisted score_type for the bedtime widget. */
const BEDTIME_DB_SCORE_TYPE = 'bedtime_adherence_score';

// ---------------------------------------------------------------------------
// Dependency injection (mirrors the CU-046 sync route factory pattern)
// ---------------------------------------------------------------------------

/** Injectable dependencies for the dashboard route (defaults to real repos). */
export interface DashboardRouteDeps {
  /** Latest local_date (YYYY-MM-DD) with any snapshot for the user; null if none. */
  getLatestSnapshotDate: (userId: string) => Promise<string | null>;
  /** All snapshots (every score_type, newest generated_at first) for a date. */
  getSnapshotsForDate: (userId: string, localDate: string) => Promise<ScoreSnapshot[]>;
  /** Insight candidates for the date (all statuses; the route filters active). */
  getInsightsForDate: (userId: string, localDate: string) => Promise<InsightCandidate[]>;
  /** Active provider connections for the user. */
  listConnections: (userId: string) => Promise<ProviderConnection[]>;
  /** Ordered Home dashboard widgets for the user. */
  getWidgets: (userId: string, dashboardCode?: string) => Promise<DashboardWidget[]>;
  /** Clock used only for provider recency (display freshness, not score math). */
  now: () => Date;
}

/** Default latest-date lookup — a single indexed read on `score_snapshots`. */
async function defaultGetLatestSnapshotDate(userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('score_snapshots')
    .select('local_date')
    .where('user_id', '=', userId)
    .orderBy('local_date', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.local_date ?? null;
}

const DEFAULT_DEPS: DashboardRouteDeps = {
  getLatestSnapshotDate: defaultGetLatestSnapshotDate,
  getSnapshotsForDate: getAllScoreSnapshotsForDate,
  getInsightsForDate,
  listConnections: findConnectionsByUser,
  getWidgets,
  now: () => new Date(),
};

// ---------------------------------------------------------------------------
// Pure mapping helpers (no DB, no scoring math)
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Current UTC calendar date as YYYY-MM-DD (no-data fallback only). */
function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Provider recency step function (Scoring Spec §8.2). */
function providerRecencyScore(hoursSinceLastSync: number): number {
  if (hoursSinceLastSync <= 2) return 100;
  if (hoursSinceLastSync <= 6) return 85;
  if (hoursSinceLastSync <= 12) return 70;
  if (hoursSinceLastSync <= 24) return 50;
  if (hoursSinceLastSync <= 48) return 25;
  return 0;
}

/** Clamp a numeric score string/number into the contract's 0–100 range. */
function toScoreValue(raw: string | number | null): number | null {
  if (raw === null) return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/** Parse a stored JSON array into validated DTOs, dropping malformed entries. */
function parseDriverArray(value: unknown): ScoreDriverDto[] {
  if (!Array.isArray(value)) return [];
  const out: ScoreDriverDto[] = [];
  for (const item of value) {
    const parsed = ScoreDriverDtoSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function parseMissingArray(value: unknown): MissingMetricDto[] {
  if (!Array.isArray(value)) return [];
  const out: MissingMetricDto[] = [];
  for (const item of value) {
    const parsed = MissingMetricDtoSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Read the ScoreState stored in `metadata.state`; defaults to available. */
function readState(metadata: Record<string, unknown>): ScoreState {
  const parsed = ScoreStateDtoSchema.safeParse(metadata['state']);
  return parsed.success ? parsed.data : 'available';
}

/** Read the §8.4 quality block from `metadata.qualityMetadata`, with a safe default. */
function readQualityMetadata(
  metadata: Record<string, unknown>,
  state: ScoreState,
): ScoreQualityMetadataDto {
  const parsed = ScoreQualityMetadataDtoSchema.safeParse(metadata['qualityMetadata']);
  if (parsed.success) return parsed.data;
  return {
    scoreState: state,
    confidence: 'unknown',
    dataQualityScore: 0,
    completenessRatio: 0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'unavailable',
  };
}

/**
 * Maps a stored `score_snapshots` row to a {@link ScoreSnapshotDto}.
 *
 * The dashboard summary intentionally returns an EMPTY `components` array — the
 * full weighted breakdown is served by the score detail endpoint (CU-057). This
 * keeps the dashboard a single bounded read per concern with no N+1 component
 * fetches, matching the "fast local-first" expectation.
 */
function toScoreSnapshotDto(row: ScoreSnapshot, scoreType: ScoreType): ScoreSnapshotDto {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const state = readState(metadata);
  const quality = readQualityMetadata(metadata, state);
  const scorable = SCORABLE_STATES.has(state);
  const value = scorable ? toScoreValue(row.score_value) : null;
  const band = value === null ? null : ((row.score_band as ScoreBand | null) ?? null);

  return {
    scoreType,
    value,
    band,
    state,
    confidence: quality.confidence,
    localDate: row.local_date,
    algorithmVersion: row.algorithm_version,
    components: [],
    missingMetrics: parseMissingArray(row.missing_inputs),
    topDrivers: parseDriverArray(row.primary_drivers),
    qualityMetadata: quality,
  };
}

/** Builds the optional bedtime widget summary from a bedtime snapshot row. */
function toBedtimeWidget(row: ScoreSnapshot): BedtimeWidgetSummaryDto {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const state = readState(metadata);
  const scorable = SCORABLE_STATES.has(state);
  const score = scorable ? toScoreValue(row.score_value) : null;
  return {
    localDate: row.local_date,
    state,
    score,
    band: score === null ? null : ((row.score_band as ScoreBand | null) ?? null),
  };
}

/** Maps an `insight_candidates` row to a display-safe {@link InsightCardDto}. */
function toInsightCard(row: InsightCandidate): InsightCardDto {
  const severity = InsightSeveritySchema.safeParse(row.severity);
  return {
    id: row.id,
    insightType: row.insight_type,
    title: row.title,
    severity: severity.success ? severity.data : 'info',
    localDate: row.local_date ?? null,
    recommendedAction: row.recommended_action ?? null,
    relatedMetricCodes: row.related_metric_codes ?? [],
    generatedAt: row.generated_at.toISOString(),
  };
}

/** Builds one provider freshness entry for display (Scoring Spec §8.2). */
function toProviderFreshness(conn: ProviderConnection, now: Date): ProviderFreshnessDto {
  const lastSync = conn.last_successful_sync_at;
  if (!lastSync) {
    return {
      providerCode: conn.provider_code,
      lastSyncAt: null,
      hoursSinceLastSync: null,
      recencyScore: 0,
      isStale: true,
    };
  }
  const hours = (now.getTime() - lastSync.getTime()) / 3_600_000;
  const hoursSinceLastSync = Math.max(0, Math.round(hours * 100) / 100);
  return {
    providerCode: conn.provider_code,
    lastSyncAt: lastSync.toISOString(),
    hoursSinceLastSync,
    recencyScore: providerRecencyScore(hoursSinceLastSync),
    isStale: hoursSinceLastSync > STALE_AFTER_HOURS,
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Hono dashboard router.
 *
 * @param deps - Injectable dependencies. Defaults to real repository functions.
 */
export function createDashboardRouter(
  deps: DashboardRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── GET /today ─────────────────────────────────────────────────────────────
  router.get('/today', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    // Optional explicit date (existing convention: YYYY-MM-DD query param).
    const requestedDate = c.req.query('date');
    if (requestedDate !== undefined && !DATE_RE.test(requestedDate)) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Query parameter "date" must be in YYYY-MM-DD format.',
          undefined,
          'date',
          requestId,
        ),
        400,
      );
    }

    // Resolve the local date: explicit > latest snapshot > today (UTC) fallback.
    const localDate =
      requestedDate ??
      (await deps.getLatestSnapshotDate(internalUserId)) ??
      utcDateString(deps.now());

    // Fetch all precomputed inputs in parallel (no scoring performed).
    const [snapshots, insightRows, connections, widgetRows] = await Promise.all([
      deps.getSnapshotsForDate(internalUserId, localDate),
      deps.getInsightsForDate(internalUserId, localDate),
      deps.listConnections(internalUserId),
      deps.getWidgets(internalUserId, 'home'),
    ]);

    // ── Scores ────────────────────────────────────────────────────────────────
    // Rows arrive newest-first per score_type; keep the first (latest) per type.
    const scores: Record<string, ScoreSnapshotDto> = {};
    const seen = new Set<string>();
    let bedtimeWidget: BedtimeWidgetSummaryDto | undefined;

    for (const row of snapshots) {
      if (seen.has(row.score_type)) continue;
      seen.add(row.score_type);

      if (row.score_type === BEDTIME_DB_SCORE_TYPE) {
        bedtimeWidget = toBedtimeWidget(row);
        continue;
      }

      const mapping = DB_SCORE_TYPE_TO_SLOT[row.score_type];
      if (!mapping) continue; // e.g. strain_score — not a dashboard slot.
      // Defensive: only assign canonical score types the contract accepts.
      if (!ScoreTypeDtoSchema.safeParse(mapping.scoreType).success) continue;
      scores[mapping.slot] = toScoreSnapshotDto(row, mapping.scoreType);
    }

    // ── Insights + recommendations ──────────────────────────────────────────────
    const activeInsights = insightRows
      .filter((i) => i.status === 'active')
      .map(toInsightCard)
      // Deterministic ordering: newest first, id as a stable tie-break.
      .sort((a, b) => {
        if (a.generatedAt !== b.generatedAt) return a.generatedAt < b.generatedAt ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

    const topInsights = activeInsights.slice(0, MAX_TOP_INSIGHTS);

    const recommendations: RecommendationCardDto[] = activeInsights
      .filter((i) => i.recommendedAction !== null && i.recommendedAction.length > 0)
      .slice(0, MAX_RECOMMENDATIONS)
      .map((i) => ({
        id: i.id,
        title: i.title,
        action: i.recommendedAction as string,
        severity: i.severity,
        generatedAt: i.generatedAt,
      }));

    // ── Provider freshness ──────────────────────────────────────────────────────
    const now = deps.now();
    const providerSyncStatus = connections.map((conn) => toProviderFreshness(conn, now));

    const lastSyncedAt = connections.reduce<string | null>((latest, conn) => {
      const ts = conn.last_successful_sync_at;
      if (!ts) return latest;
      const iso = ts.toISOString();
      return latest === null || iso > latest ? iso : latest;
    }, null);

    // ── Widget order ────────────────────────────────────────────────────────────
    const widgets: DashboardWidgetSummaryDto[] = widgetRows.map((w) => ({
      widgetType: w.widget_type,
      displayOrder: w.display_order,
      isVisible: w.is_visible,
      size: w.size,
    }));

    // ── Assemble + validate ─────────────────────────────────────────────────────
    const responseDto: TodayDashboardResponseDto = {
      localDate,
      lastSyncedAt,
      scores: scores as DashboardScoresDto,
      topInsights,
      recommendations,
      providerSyncStatus,
      widgets,
      ...(bedtimeWidget !== undefined && { bedtimeWidget }),
    };

    // Contract guard: never ship a malformed dashboard. Parse strips nothing but
    // guarantees the shape the mobile client relies on (and surfaces bugs in tests).
    const validated = TodayDashboardResponseDtoSchema.parse(responseDto);

    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

/** Default dashboard router wired to real repositories. */
export const dashboardRouter = createDashboardRouter();
