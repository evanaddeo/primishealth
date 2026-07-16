/** Ownership-scoped latest servable AI-summary reader (CU-090, ADR-007). */

import { db } from '../db/client.js';
import type { AiSummary, Database } from '../db/types.js';
import type { Kysely } from 'kysely';

export const SERVABLE_SUMMARY_STATUSES = ['fresh', 'stale'] as const;

export async function getLatestAiSummaryForUser(
  userId: string,
  summaryType: string,
): Promise<AiSummary | undefined> {
  return getLatestAiSummaryFromDb(db, userId, summaryType);
}

/** Exported DB seam keeps ownership/status/deletion filtering directly testable. */
export async function getLatestAiSummaryFromDb(
  database: Kysely<Database>,
  userId: string,
  summaryType: string,
): Promise<AiSummary | undefined> {
  return database
    .selectFrom('ai_summaries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('summary_type', '=', summaryType)
    .where('deleted_at', 'is', null)
    .where('summary_status', 'in', [...SERVABLE_SUMMARY_STATUSES])
    .orderBy('local_date', 'desc')
    .orderBy('generated_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}
