/**
 * Weekly review job (CU-083).
 *
 * Generates + caches the `weekly` summary for one `(user, local_date)` — a trailing
 * 7-day review — via the AI Context Engine and {@link AiGateway}.
 * {@link generateWeeklyReview} takes injected deps (tests use a mock gateway + fake
 * repo); {@link runWeeklyReviewJob} builds the default DB-backed deps.
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

/** Generate the weekly review with injected dependencies. */
export function generateWeeklyReview(
  deps: AiSummaryJobDeps,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome> {
  return generateAiSummary(deps, 'weekly', params);
}

/** Production convenience: build default deps from a Kysely client, then generate. */
export function runWeeklyReviewJob(
  db: Kysely<Database>,
  params: GenerateSummaryParams,
  options?: SummaryJobDepsOptions,
): Promise<AiSummaryOutcome> {
  return generateWeeklyReview(buildSummaryJobDeps(db, options), params);
}
