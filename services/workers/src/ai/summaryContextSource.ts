/**
 * DB-backed AI Context Engine wiring for the summary jobs (CU-083).
 *
 * Implements the read-only builder *ports* (`ProfileDataPort` / `ScoreDataPort` /
 * `BaselineDataPort`) on top of the workers Kysely `Database`, then assembles them
 * into a {@link BaseContextPacketAssembler}. This is the production
 * {@link ContextPacketSource} the summary jobs feed with structured, deterministic
 * data — score snapshots, component breakdowns, and rolling baselines — NEVER raw
 * provider payloads (spec §10, §19.3). Unit tests inject an in-memory context
 * source instead, so none of this touches a real database.
 *
 * Scope note: this CU wires the profile + score + baseline builders, which cover
 * sleep / recovery / daily / weekly summaries from persisted `score_snapshots`
 * (each carries the score's drivers + component contributions). Richer domain
 * builders (the V1.1 SleepContextBuilder, training/nutrition) can be layered on
 * later by extending {@link createSummaryContextSource}; the port pattern makes
 * that additive.
 *
 * @see services/ai/src/context/builders/* — the builders these ports feed
 * @see services/workers/src/scoring/runDailyScoring.ts — the sibling read pattern
 */

import type { Kysely } from 'kysely';

import type { ScoreState } from '@primis/core-types';
import type { ScoreDriverDto, MissingMetricDto } from '@primis/api-contracts';
import {
  AiGateway,
  BaseContextPacketAssembler,
  BaselineContextBuilder,
  ScoreContextBuilder,
  resolveEnvironment,
  type AiChatEnvironment,
  type BaselineDataPort,
  type BaselineQueryOptions,
  type BaselineReadModel,
  type ContextBuilder,
  type ContextPacketSource,
  type ProfileDataPort,
  type ProfileReadModel,
  type ScoreComponentReadModel,
  type ScoreDataPort,
  type ScoreQueryOptions,
  type ScoreSnapshotReadModel,
} from '@primis/ai';

import type { Database } from '../db/types.js';
import { createAiSummaryRepository } from './aiSummaryRepository.js';
import type { AiSummaryJobDeps } from './summaryJob.js';

// ---------------------------------------------------------------------------
// Small numeric coercion (pg returns numeric/decimal columns as strings)
// ---------------------------------------------------------------------------

function numeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// ProfileDataPort — reads `users` (timezone + coarse-age DOB only; §10.2)
// ---------------------------------------------------------------------------

/** Minimal profile port: timezone + DOB (for age band). Goals/prefs are additive. */
export function createProfileDataPort(db: Kysely<Database>): ProfileDataPort {
  return {
    async getProfile(userId: string): Promise<ProfileReadModel | undefined> {
      const user = await db
        .selectFrom('users')
        .select(['primary_timezone', 'date_of_birth'])
        .where('id', '=', userId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!user) return undefined;
      return {
        timezone: user.primary_timezone,
        dateOfBirth: user.date_of_birth,
        goals: [],
        aiProcessingEnabled: true,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ScoreDataPort — latest `score_snapshots` (+ components) per score type
// ---------------------------------------------------------------------------

/** Reads persisted score snapshots (never recomputes) into the builder read model. */
export function createScoreDataPort(db: Kysely<Database>): ScoreDataPort {
  return {
    async getLatestScores(
      userId: string,
      options: ScoreQueryOptions,
    ): Promise<ScoreSnapshotReadModel[]> {
      let query = db.selectFrom('score_snapshots').selectAll().where('user_id', '=', userId);
      if (options.asOfLocalDate) query = query.where('local_date', '<=', options.asOfLocalDate);
      if (options.scoreTypes && options.scoreTypes.length > 0) {
        query = query.where('score_type', 'in', options.scoreTypes);
      }
      const rows = await query
        .orderBy('local_date', 'desc')
        .orderBy('generated_at', 'desc')
        .execute();

      // Keep only the newest snapshot per score type.
      const latestByType = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!latestByType.has(row.score_type)) latestByType.set(row.score_type, row);
      }

      const snapshotIds = [...latestByType.values()].map((r) => r.id);
      const components = snapshotIds.length
        ? await db
            .selectFrom('score_component_values')
            .selectAll()
            .where('score_snapshot_id', 'in', snapshotIds)
            .execute()
        : [];
      const componentsBySnapshot = new Map<string, typeof components>();
      for (const c of components) {
        const list = componentsBySnapshot.get(c.score_snapshot_id) ?? [];
        list.push(c);
        componentsBySnapshot.set(c.score_snapshot_id, list);
      }

      return [...latestByType.values()].map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const state =
          typeof metadata.state === 'string' ? (metadata.state as ScoreState) : undefined;
        const drivers = (row.primary_drivers ?? []) as ScoreDriverDto[];
        const missing = (row.missing_inputs ?? []) as MissingMetricDto[];
        const comps = componentsBySnapshot.get(row.id) ?? [];

        const model: ScoreSnapshotReadModel = {
          scoreType: row.score_type,
          localDate: row.local_date,
          scoreValue: numeric(row.score_value),
          band: row.score_band,
          confidenceScore: numeric(row.confidence_score),
          algorithmVersion: row.algorithm_version,
          generatedAt: row.generated_at.toISOString(),
          dataCoveragePct: numeric(row.data_coverage_pct),
          topDrivers: drivers.map((d) => ({
            key: d.key,
            label: d.displayLabel,
            direction: d.direction,
            magnitude: d.magnitude,
          })),
          missingInputs: missing.map((m) => ({
            metricCode: m.metricCode,
            reason: m.reason,
            isRequired: m.isRequired,
          })),
          components: comps.map(
            (c): ScoreComponentReadModel => ({
              code: c.component_code,
              label: c.component_label,
              normalizedValue: numeric(c.normalized_value),
              weight: numeric(c.weight),
              contribution: numeric(c.weighted_contribution),
              direction: c.direction as 'positive' | 'negative' | 'neutral' | null,
              unit: c.unit,
              explanation: c.explanation,
            }),
          ),
        };
        if (state) model.state = state;
        return model;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// BaselineDataPort — latest `rolling_metric_baselines` per (metric, window)
// ---------------------------------------------------------------------------

/** Reads persisted rolling baselines into the builder read model. */
export function createBaselineDataPort(db: Kysely<Database>): BaselineDataPort {
  return {
    async getBaselines(
      userId: string,
      options: BaselineQueryOptions = {},
    ): Promise<BaselineReadModel[]> {
      let query = db
        .selectFrom('rolling_metric_baselines')
        .selectAll()
        .where('user_id', '=', userId);
      if (options.asOfLocalDate)
        query = query.where('as_of_local_date', '<=', options.asOfLocalDate);
      if (options.windowDays && options.windowDays.length > 0) {
        query = query.where('window_days', 'in', options.windowDays);
      }
      if (options.metricCodes && options.metricCodes.length > 0) {
        query = query.where('metric_code', 'in', options.metricCodes);
      }
      const rows = await query
        .orderBy('as_of_local_date', 'desc')
        .orderBy('generated_at', 'desc')
        .execute();

      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = `${row.metric_code}|${row.window_days}`;
        if (!latest.has(key)) latest.set(key, row);
      }

      return [...latest.values()].map((row) => ({
        metricCode: row.metric_code,
        windowDays: row.window_days,
        method: row.baseline_method,
        asOfLocalDate: row.as_of_local_date,
        baselineValue: row.baseline_value,
        stddevValue: row.stddev_value,
        minValue: row.min_value,
        maxValue: row.max_value,
        sampleDays: row.sample_days,
        coveragePct: numeric(row.coverage_pct),
        confidenceScore: numeric(row.confidence_score),
        generatedAt: row.generated_at.toISOString(),
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Assembler + default job deps
// ---------------------------------------------------------------------------

export interface SummaryContextSourceOptions {
  now?: () => Date;
  idFactory?: () => string;
}

/**
 * Builds the profile + score + baseline {@link ContextPacketSource} the summary
 * jobs use. All builders read persisted, structured tables only.
 */
export function createSummaryContextSource(
  db: Kysely<Database>,
  options: SummaryContextSourceOptions = {},
): ContextPacketSource {
  const clock = options.now ? { now: options.now } : {};
  const builders: ContextBuilder<unknown>[] = [
    new ScoreContextBuilder(createScoreDataPort(db), clock),
    new BaselineContextBuilder(createBaselineDataPort(db), clock),
  ];
  return new BaseContextPacketAssembler({
    profilePort: createProfileDataPort(db),
    builders,
    ...(options.now ? { now: options.now } : {}),
    ...(options.idFactory ? { idFactory: options.idFactory } : {}),
  });
}

/** Options for building default (production) summary job dependencies. */
export interface SummaryJobDepsOptions {
  environment?: AiChatEnvironment;
  now?: () => Date;
}

/**
 * Assembles the default {@link AiSummaryJobDeps}: the env-resolved gateway (mock
 * unless live keys are configured), the DB-backed context source, and the Kysely
 * summary repository. Tests build their own deps with a mock gateway + fake repo.
 */
export function buildSummaryJobDeps(
  db: Kysely<Database>,
  options: SummaryJobDepsOptions = {},
): AiSummaryJobDeps {
  const environment = options.environment ?? resolveEnvironment(process.env);
  const contextSourceOptions: SummaryContextSourceOptions = options.now ? { now: options.now } : {};
  return {
    gateway: AiGateway.fromEnv(),
    contextSource: createSummaryContextSource(db, contextSourceOptions),
    repository: createAiSummaryRepository(db),
    environment,
    ...(options.now ? { now: options.now } : {}),
  };
}
