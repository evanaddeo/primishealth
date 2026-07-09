# ADR-007: `ai_summaries` cache table for asynchronous AI summaries

- **Status:** Accepted
- **Date:** 2026-07-01
- **Phase / CU:** Phase I — AI Context Engine & AI Coach, CU-083
- **Supersedes / relates to:** ADR-003 (Kysely + numbered migrations), Data Model §18 (AI data model)

## Context

The AI Context Engine spec (`primis_ai_context_engine_spec.md`, priority 1) requires that
sleep / recovery / daily / weekly summaries are generated **asynchronously** and served from a
**cache**, so critical mobile screens never block on a live LLM call and can fall back to the
last good summary when live generation fails (§5.3–5.8, §18.2–18.3; AI-UX-AC-005 — "User sees
cached summaries even when live AI generation fails").

The Data Model doc (`primis_data_model_health_metric_schema.md` §18, priority 4 — the schema
authority) defines `ai_conversations`, `ai_messages`, `ai_context_snapshots`, and
`ai_model_invocations`, but **no summary cache table**. `ai_context_snapshots` stores the
_input_ context packet for reproducibility; it is not a place to store rendered _output_
summaries keyed for fast "latest valid" reads.

Per `docs/README.md`, a material conflict between a higher-priority spec and the schema
authority is resolved with an ADR rather than a silent doc edit.

## Decision

Add a dedicated, well-indexed **`ai_summaries`** table (migration `000008_ai_summaries.sql`)
as the durable cache for context-engine-generated summaries. Shape:

| column                                   | purpose                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `id`                                     | uuid PK                                                        |
| `user_id`                                | FK → `users(id)`                                               |
| `summary_type`                           | `sleep\|recovery\|daily\|weekly\|workout\|nutrition` (CHECK)   |
| `local_date`                             | user-local date the summary describes                          |
| `context_packet_version`                 | packet contract version the summary was grounded on            |
| `summary_status`                         | `fresh\|stale\|regenerating\|failed` (CHECK)                   |
| `title`, `short_summary`                 | rendered display copy                                          |
| `structured_json`                        | structured output-contract object (never raw payloads/prompts) |
| `evidence_refs`                          | compact cited-evidence chips                                   |
| `source_score_snapshot_id`               | optional FK → `score_snapshots(id)`                            |
| `model_provider`, `model_name`           | redacted model provenance                                      |
| `generated_at`, `expires_at`             | freshness bookkeeping                                          |
| `created_at`, `updated_at`, `deleted_at` | standard lifecycle (soft-delete)                               |

**Uniqueness:** `unique(user_id, summary_type, local_date, context_packet_version)` — enables an
idempotent upsert on regeneration and a stable "latest valid summary" lookup.

**Ownership:** the worker jobs (`services/workers/src/ai/*`) generate + upsert rows via the AI
Context Engine (builders → packet → prompt composer → `AiGateway`) — never from raw provider
payloads or raw DB dumps. A read API / mobile wiring is out of scope for CU-083 and deferred to
Phase J.

**Fallback semantics:** the "latest valid summary" reader returns the newest servable
(`fresh`/`stale`) row. On live-generation failure the job does **not** overwrite the good cached
row for the same key; instead it downgrades the existing row to `stale` so the UI keeps serving
it (AI-UX-AC-005).

## Consequences

- Adds one AI-metadata migration (`000008`), consistent with the Phase I non-goal "no DB schema
  expansion except AI metadata."
- `structured_json` / `evidence_refs` are covered by the same no-raw-logging / no-raw-payload
  rules as `ai_context_snapshots` (§19.3); enforcement is in application logic, not a DB CHECK.
- Workers own their own Kysely `Database` typing (ADR-003 — no `services/api` import); the table
  is mirrored in `services/workers/src/db/types.ts`. If `services/api` later adds a read
  endpoint it will mirror the same columns.
- The Data Model doc should reference this table in a future consolidated revision; until then
  this ADR is the source of truth for the `ai_summaries` shape.
