# ADR-008: Manual-input daily aggregation & freshness model

**Date:** 2026-06-26
**Status:** Accepted

> **User directive (recorded verbatim):** _"the absolute best practice way possible — long term
> whatever is most optimal, reliable, efficient, and effective. make sure you note this somewhere."_
> This ADR is where that decision is captured; the design below is the recommended best-practice target.

## Context

Phase H (CU-069…075) adds the first user **write** paths: manual logging of check-ins,
hydration/caffeine/alcohol, digestion, and manual macros. The Nutrition tab reads a precomputed
`daily_nutrition_summaries` row (calories/macros/`hydration_ml`/`caffeine_mg`/
`latest_caffeine_time_utc`/`alcohol_standard_drinks`), which today is upserted by the **Phase F
scoring worker** from provider `metric_observations`.

Manual logs land in the per-domain `*_entries` tables (`hydration_entries`, `caffeine_entries`,
`alcohol_entries`, `nutrition_entries`). The Phase F worker never reads those tables, so without a
decision a manual log would **silently never reach the summary** and the Nutrition tab would look
empty immediately after the user logged something. The schema is frozen in Phase H
(`000005_domain_tables.sql`), so this must be solved without migrations.

## Decision

1. **Entry tables are the immutable source of truth.** `daily_nutrition_summaries` is a _derived
   projection_, never hand-authored. A summary row can always be rebuilt from the day's entry rows.

2. **One canonical, pure, idempotent aggregation function owns the math.** It lives in a shared pure
   module — `@primis/health-metrics/src/aggregation/dailyManualAggregation.ts` — so the **API now**
   and the **worker later** call the identical function (no duplicated math, no drift). It takes a
   day's entry inputs and returns only the summary fields it owns. It computes **only sums and
   latest-times**; it does **not** compute `nutrition_score` or targets (those remain
   Phase-F/scoring-owned and are passed through / left untouched). The function is pure: **no DB
   access inside it.**

3. **Write-through recompute for instant freshness.** Each manual-log POST, after inserting the
   entry, re-reads that `(user_id, local_date)` day's entries, recomputes the owned summary fields
   via the shared function, and upserts the summary. Summing a day's handful of rows is bounded and
   trivial — this is _not_ the "heavy compute in request path" the TAD forbids (that rule targets
   scoring/ML), and recomputing from all of the day's rows (rather than incrementing) keeps the
   result deterministic and self-healing.

4. **Idempotent + concurrency-safe.** The summary is keyed on `(user_id, local_date)` with an
   `ON CONFLICT` upsert. Because every writer computes the same deterministic value from the same
   source rows, last-writer-wins is correct. The recompute must **union** (preserve) fields owned by
   other writers — the lifestyle write-through must not clobber macro/target/score fields, and the
   macro write-through must not clobber hydration/caffeine/alcohol — so whichever path runs produces
   a complete, non-clobbering row. Reads stay precomputed (serve the stored summary), consistent with
   ADR-006.

5. **Mobile is local-first.** The client optimistically reflects the just-logged entry immediately;
   the server projection is the durable truth on next read.

## Consequences

- **Single source of aggregation truth**, reusable by the worker without a rewrite, deterministic and
  re-runnable, with instant UX and no schema change. Scoring stays strictly out of Phase H.
- **CU-070** introduces the shared function and the lifestyle (hydration/caffeine/alcohol)
  write-through. **CU-072** reuses the same function for macro/calorie fields, preserving the
  lifestyle fields CU-070 owns.
- **Worker reuse follow-up (NOT Phase H):** wiring the same pure function into
  `buildDailyMetricSummaries` / a manual-summary builder so batch reconcile matches the write-through
  is a Phase F/I task. Until then, the API write-through is the only producer of the manual-derived
  summary fields.

## Alternatives considered

- **Worker-only aggregation (status quo).** Rejected: manual logs would not appear until the next
  worker run, breaking the sub-20s logging promise and making the Nutrition tab look empty.
- **Incremental in-place updates** (read summary, add the new entry's delta). Rejected: not
  self-healing — a failed/duplicated write or an edited entry would drift the running total. Full
  recompute from the day's rows is deterministic.
- **Compute on read.** Rejected: violates ADR-006 (reads serve precomputed rows) and pushes the
  union/merge concern into every reader.
