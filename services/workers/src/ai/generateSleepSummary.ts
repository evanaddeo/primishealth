/**
 * Sleep summary job (CU-083).
 *
 * Generates + caches the `sleep` summary for one `(user, local_date)` via the AI
 * Context Engine and {@link AiGateway}. {@link generateSleepSummary} takes injected
 * deps (used by tests with a mock gateway + fake repo); {@link runSleepSummaryJob}
 * builds the default DB-backed deps for production use.
 */

import type { Kysely } from 'kysely';

import type { Database } from '../db/types.js';
import {
  generateAiSummary,
  type AiSummaryJobDeps,
  type AiSummaryOutcome,
  type GenerateSummaryParams,
} from './summaryJob.js';
import { buildSummaryJobDeps, type SummaryJobDepsOptions } from './summaryContextSource.js';

/** Generate the sleep summary with injected dependencies. */
export function generateSleepSummary(
  deps: AiSummaryJobDeps,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome> {
  return generateAiSummary(deps, 'sleep', params);
}

/** Production convenience: build default deps from a Kysely client, then generate. */
export function runSleepSummaryJob(
  db: Kysely<Database>,
  params: GenerateSummaryParams,
  options?: SummaryJobDepsOptions,
): Promise<AiSummaryOutcome> {
  return generateSleepSummary(buildSummaryJobDeps(db, options), params);
}
