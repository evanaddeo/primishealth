/**
 * Recovery summary job (CU-083).
 *
 * Generates + caches the `recovery` summary for one `(user, local_date)` via the AI
 * Context Engine and {@link AiGateway}. {@link generateRecoverySummary} takes
 * injected deps (tests use a mock gateway + fake repo); {@link runRecoverySummaryJob}
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

/** Generate the recovery summary with injected dependencies. */
export function generateRecoverySummary(
  deps: AiSummaryJobDeps,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome> {
  return generateAiSummary(deps, 'recovery', params);
}

/** Production convenience: build default deps from a Kysely client, then generate. */
export function runRecoverySummaryJob(
  db: Kysely<Database>,
  params: GenerateSummaryParams,
  options?: SummaryJobDepsOptions,
): Promise<AiSummaryOutcome> {
  return generateRecoverySummary(buildSummaryJobDeps(db, options), params);
}
