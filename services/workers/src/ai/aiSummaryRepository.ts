/**
 * Idempotent persistence for the AI summary cache (CU-083, ADR-007).
 *
 * Reads/writes `ai_summaries` through the workers Kysely client. Workers must NOT
 * import from `services/api` (ADR-003), so this write path is defined against the
 * workers `Database` types. Mirrors the `scoreSnapshotWriter` idempotency model:
 * an upsert on the natural key `(user_id, summary_type, local_date,
 * context_packet_version)` replaces mutable columns while `created_at` is preserved.
 *
 * The summary jobs depend on {@link AiSummaryRepositoryPort} rather than these
 * functions directly, so the generation engine is unit-testable with an in-memory
 * fake and never needs a real database.
 *
 * PRIVACY (§19.3): `structured_json` / `evidence_refs` carry structured summaries +
 * cited evidence facts only — never raw payloads or prompts. Do NOT log them.
 *
 * @see database/migrations/000008_ai_summaries.sql
 * @see docs/decisions/ADR-007-ai-summaries-cache-table.md
 */

import type { Kysely } from 'kysely';

import type { Database, AiSummary, NewAiSummary } from '../db/types.js';

// ---------------------------------------------------------------------------
// Vocabulary (mirrors the DB CHECK constraints)
// ---------------------------------------------------------------------------

/** Kinds of summary the jobs generate. */
export type AiSummaryType = 'sleep' | 'recovery' | 'daily' | 'weekly' | 'workout' | 'nutrition';

/** Cache lifecycle status. */
export type AiSummaryStatus = 'fresh' | 'stale' | 'regenerating' | 'failed';

/** Statuses whose rows are safe to serve to a screen (have real content). */
export const SERVABLE_SUMMARY_STATUSES: readonly AiSummaryStatus[] = ['fresh', 'stale'];

// ---------------------------------------------------------------------------
// Repository port (what the generation engine depends on)
// ---------------------------------------------------------------------------

/** Fields written on each (re)generation of a cached summary. */
export interface UpsertAiSummaryInput {
  userId: string;
  summaryType: AiSummaryType;
  localDate: string;
  contextPacketVersion: string;
  status: AiSummaryStatus;
  title: string | null;
  shortSummary: string | null;
  structuredJson: Record<string, unknown>;
  evidenceRefs: unknown[];
  modelProvider: string | null;
  modelName: string | null;
  sourceScoreSnapshotId?: string | null;
  /** Computation clock; recorded as `generated_at` + `updated_at`. */
  generatedAt: Date;
  expiresAt?: Date | null;
}

/** Query for the latest servable cached summary. */
export interface GetLatestAiSummaryQuery {
  userId: string;
  summaryType: AiSummaryType;
  /** Restrict to a specific local date; omit for the newest of any date. */
  localDate?: string;
}

/**
 * The persistence surface the summary jobs use. Backed by Kysely in production
 * ({@link createAiSummaryRepository}); an in-memory fake in tests.
 */
export interface AiSummaryRepositoryPort {
  upsert(input: UpsertAiSummaryInput): Promise<AiSummary>;
  getLatest(query: GetLatestAiSummaryQuery): Promise<AiSummary | undefined>;
  markStatus(id: string, status: AiSummaryStatus): Promise<void>;
}

// ---------------------------------------------------------------------------
// Kysely implementation
// ---------------------------------------------------------------------------

/**
 * Idempotently upserts a cached summary on its natural key. On conflict every
 * mutable column is replaced (including a `deleted_at` reset so a previously
 * soft-deleted row is revived); `created_at` is deliberately NOT updated.
 */
export async function upsertAiSummary(
  db: Kysely<Database>,
  input: UpsertAiSummaryInput,
): Promise<AiSummary> {
  const row: NewAiSummary = {
    user_id: input.userId,
    summary_type: input.summaryType,
    local_date: input.localDate,
    context_packet_version: input.contextPacketVersion,
    summary_status: input.status,
    title: input.title,
    short_summary: input.shortSummary,
    structured_json: input.structuredJson,
    evidence_refs: input.evidenceRefs,
    source_score_snapshot_id: input.sourceScoreSnapshotId ?? null,
    model_provider: input.modelProvider,
    model_name: input.modelName,
    generated_at: input.generatedAt,
    expires_at: input.expiresAt ?? null,
    updated_at: input.generatedAt,
    deleted_at: null,
  };

  return db
    .insertInto('ai_summaries')
    .values(row)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'summary_type', 'local_date', 'context_packet_version'])
        .doUpdateSet((eb) => ({
          summary_status: eb.ref('excluded.summary_status'),
          title: eb.ref('excluded.title'),
          short_summary: eb.ref('excluded.short_summary'),
          structured_json: eb.ref('excluded.structured_json'),
          evidence_refs: eb.ref('excluded.evidence_refs'),
          source_score_snapshot_id: eb.ref('excluded.source_score_snapshot_id'),
          model_provider: eb.ref('excluded.model_provider'),
          model_name: eb.ref('excluded.model_name'),
          generated_at: eb.ref('excluded.generated_at'),
          expires_at: eb.ref('excluded.expires_at'),
          updated_at: eb.ref('excluded.updated_at'),
          deleted_at: eb.ref('excluded.deleted_at'),
        })),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Returns the newest **servable** (`fresh`/`stale`) cached summary for a user +
 * type, so a screen can render the last good summary even when live generation
 * failed (AI-UX-AC-005). Soft-deleted and `failed`/`regenerating` rows are skipped.
 */
export async function getLatestAiSummary(
  db: Kysely<Database>,
  query: GetLatestAiSummaryQuery,
): Promise<AiSummary | undefined> {
  let builder = db
    .selectFrom('ai_summaries')
    .selectAll()
    .where('user_id', '=', query.userId)
    .where('summary_type', '=', query.summaryType)
    .where('deleted_at', 'is', null)
    .where('summary_status', 'in', SERVABLE_SUMMARY_STATUSES as unknown as string[]);

  if (query.localDate !== undefined) {
    builder = builder.where('local_date', '=', query.localDate);
  }

  return builder
    .orderBy('local_date', 'desc')
    .orderBy('generated_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

/** Transitions a cached summary to a new lifecycle status (e.g. `fresh` → `stale`). */
export async function markAiSummaryStatus(
  db: Kysely<Database>,
  id: string,
  status: AiSummaryStatus,
  now: Date = new Date(),
): Promise<void> {
  await db
    .updateTable('ai_summaries')
    .set({ summary_status: status, updated_at: now })
    .where('id', '=', id)
    .execute();
}

/** Binds the repository functions to a Kysely client as an {@link AiSummaryRepositoryPort}. */
export function createAiSummaryRepository(db: Kysely<Database>): AiSummaryRepositoryPort {
  return {
    upsert: (input) => upsertAiSummary(db, input),
    getLatest: (query) => getLatestAiSummary(db, query),
    markStatus: (id, status) => markAiSummaryStatus(db, id, status),
  };
}
