# Phase J — Private Beta Quality Hardening — Implementation Plan

Path notation: `[E]` verified existing, `[A]` verified absent, `[P]` proposed.

## 1. Executive Summary

Phase J prepares Primis for a controlled private beta by making privacy controls visible, establishing non-destructive deletion and observability scaffolds, hardening mobile state handling, and producing accessibility, performance, and TestFlight validation procedures.

The quality thesis is “trustworthy under incomplete data and failure”: cached data remains usable, uncertainty is explicit, crashes recover safely, operational signals contain no user or health data, and release preparation remains credential-free.

Non-goals:

- Production deletion, deployment, TestFlight submission, or real credentials.
- AWS, provider-sync, scoring, AI prompt/safety, or recommendation changes.
- Final legal/privacy language.
- A telemetry vendor SDK or DSN.
- Broad schema expansion, navigation redesign, or Phase K correlation work.

## 2. Verified Repository Baseline

### Repository state

- Current branch: `feature/beta-quality-hardening`; expected branch was `feature/private-beta-quality-hardening`.
- HEAD at planning time: `137bcda`, also `main` and `origin/main`.
- Working tree was clean before and after reconnaissance.
- Phase H is merged at `c65c8ca`; CU-069 through CU-075 are present.
- Phase I is merged at `137bcda`; CU-076 through CU-085 are present.
- CU-086 through CU-093 were unimplemented when this plan was prepared.
- `[E] plans/phase-h-manual-inputs-nutrition-v1.md`
- `[E] plans/phase-i-ai-context-engine-ai-coach.md`
- `[A] docs/runbooks/user-data-deletion.md`
- `[A] docs/runbooks/accessibility-checklist.md`
- `[A] docs/runbooks/mobile-performance-checklist.md`
- `[A] docs/runbooks/testflight-release.md`

Baseline checks passed during planning:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: 2,534 passed, 105 skipped integration tests.
- `pnpm format:check`
- `pnpm --filter @primis/mobile test`: 437 passed.
- `docker compose config --quiet`
- Expo config command availability and `apps/mobile/eas.json` JSON parsing.

### Existing assets

- `[E] services/api/src/middleware/requestId.ts` propagates and echoes `x-request-id`.
- `[E] apps/mobile/app/_layout.tsx` contains the first-run gate and provider order.
- `[E] apps/mobile/app/settings/connections.tsx` and the provider-connection feature provide the current settings surface.
- `[E] packages/core-types/src/redaction.ts` provides fixture-focused redaction.
- `[E] database/migrations/000008_ai_summaries.sql` and ADR-007 provide AI summary storage.
- `[E] ADR-008` defines manual-input aggregation and freshness.
- `[E] apps/mobile/eas.json` has development, preview, and production profiles with placeholder submission data.
- `[E] apps/mobile/app.config.ts` contains placeholder bundle/application IDs and EAS project ID.
- `[E] apps/mobile/src/hooks/useReducedMotion.ts` and design-system motion resolvers support reduced motion.
- `[E] common screen-specific stale, missing, score-state, error, and empty behavior exists, but no shared cross-screen state components.
- `[A] privacy/data-controls UI, deletion workflow, general runtime logger, crash boundary, mobile telemetry adapter, and performance instrumentation.

### Repo drift and corrected assumptions

- The branch name differs from the requested workflow; implementation stays on the current branch unless deliberately changed outside this plan.
- `manual_checkins` is documented as supporting soft deletion, but migration `000005_domain_tables.sql` has no `deleted_at` column. Phase J will inventory it for future hard deletion and will not add a migration.
- `APP_ENV` accepts `local|dev|staging|prod`, while the mock-auth allowlist checks `local|development`. CU-087 will narrowly align the allowlist to `local|dev` with production-negative tests.
- The TAD’s illustrative raw archive convention differs from the implementation. The actual archive key is `provider={code}/user_id={id}/data_type={type}/year=.../month=.../day=.../{payloadId}.json.gz`; Phase J will inventory this implemented convention.
- `S3RawPayloadArchive` remains a stub and there is no object-list/delete abstraction. CU-087 cannot perform archive deletion.
- `ai_summaries` is typed in workers but not in the API database interface.
- Existing AI telemetry contains `userIdHash`. The Phase J guardrail is stricter and prohibits both raw and hashed user identifiers in general logs/telemetry.
- The quick-add hook describes cache updates as optimistic, but updates currently occur in `onSuccess`; CU-092 will measure cache-commit latency without silently changing mutation semantics.
- The source schema describes future provider-device and parity tables, but migrations `000001`–`000008` do not create them. They are not included as current tables.

## 3. Source Authority and Decisions

### Authority order

Use the order in `[E] docs/README.md`:

1. Full implementation specification.
2. MVP milestone plan.
3. Technical Architecture Document.
4. Data model/schema.
5. Scoring specification.
6. AI Context Engine specification.
7. UI/UX design-system specification.
8. PRD.
9. Google Health parity matrix.
10. Accepted ADRs and actual implementation evidence.

### Controlling sections

- Implementation specification: §1 “Source-of-Truth Documents”; §3 “Commit Unit Contract”; §3.5 “Definition of Done”; Phase J CU-086–CU-093; Phase K; Phase Z; Gate G5 “Private Beta Gate”.
- MVP plan: §18 “M12 — Private Beta Hardening”; §25.4–25.5 mobile/AI definitions of done; §26 “Testing Strategy”; §27 “Performance Budgets”; §28 “Security, Privacy, and Compliance Build Gates”; §31 “Release Plan”.
- TAD: §4 “Architectural Principles”; §8 “Environment Strategy”; §11.3–11.4 raw storage/retention; §12.3 “Endpoint groups — Data controls”; §18.3–18.6 mobile behavior; §22.1–22.6 security, logging, AI privacy, deletion; §23 launch readiness; §24 observability; §26.3 mobile build pipeline; §28 performance; §30 freshness; §31 error handling.
- Data model: §5.4 sensitivity classification; §5.5 deletion/retention; §7–19 current table domains; §27 privacy requirements by table group; §28 testing.
- Scoring: §6.3 score-state enum; §6.4 confidence; §8 data quality/completeness; §21.6 missing-data insights; §24 AI boundary; §30 performance-only language.
- AI specification: §9 “Context Packet Design”; §18 latency/cache; §19 “Persistence and Logging”; §22.3 mobile summary API; §22.5 fallback behavior; §23 security/privacy.
- UI/UX: §3.6 “Trustworthy”; §5.2–5.3 settings/navigation; §9.5 Dynamic Type; §11.2, §11.8–11.10 components/charts/empty states; §12.5 loading; §13 data visualization; §17 accessibility; §18.5–18.6 performance; §21 QA.
- PRD: §10.1 account management; §10.13 AI; §10.15 settings/data controls; §13.3 retention; §14.2 mobile performance; §18 privacy/security; private-beta requirements.
- Parity matrix: §1 classifications and §2 validation-status enum.

### Accepted ADRs affecting Phase J

- ADR-0001: Vitest workspace filename.
- ADR-001: provider-code naming.
- ADR-002: AI intent count.
- ADR-003: Kysely/raw SQL migration pattern; local-Postgres integration remains relevant.
- ADR-004: activity score is not persisted.
- ADR-005/006: dashboard and detail endpoint shapes.
- ADR-007: `ai_summaries`; latest read/mobile wiring deferred to Phase J.
- ADR-008: manual-input aggregation and freshness.

### Conflict resolutions

- Hashed/truncated user IDs are permitted by older TAD language but prohibited by the explicit Phase J guardrail. The stricter prohibition wins.
- The TAD recommends Sentry, but CU-089 and the phase guardrails require a vendor-neutral scaffold without an SDK or DSN.
- The milestone describes functional deletion and an installed TestFlight build. The higher-priority Phase J CUs limit this phase to a skeleton and release runbook; execution remains Phase Z.
- TAD deletion mentions a durable deletion-request record. No table exists and a migration requires a blocking decision. The Phase J endpoint therefore creates no persistent request and clearly reports `not_scheduled`.
- The actual `/api/v1` prefix wins over older `/v1` examples.
- Actual raw archive keys win for inventory. A future production executor may require an ADR if the storage convention changes.

### ADR triggers

Stop and request direction if implementation would require:

- A deletion-request table or any migration.
- A production-capable delete method, queue consumer, S3 deletion API, or retention policy.
- A telemetry SDK/vendor, DSN, remote endpoint, or secret.
- A different public deletion or AI-summary response contract.
- Final legal copy or real release identifiers.
- Logging any user-linked identifier or health-derived value.

## 4. Phase Boundaries and Guardrails

- Only CU-086 through CU-093 are implemented, sequentially.
- No production data mutation, deletion scheduling, or destructive runbook command.
- The deletion endpoint supports dry-run requests only and is unavailable outside local/dev mock-auth environments.
- No new database migration or AWS/storage implementation.
- No request body, response body, context packet, prompt, note, provider payload, token, secret reference, email, device ID, raw/hashed user ID, or health value enters logs, telemetry, breadcrumbs, snapshots, or examples.
- No generic object/error serialization.
- The first-run gate and root provider order remain stable.
- Existing EAS placeholders remain literal placeholders.
- No deployment, EAS build, submission, Apple provisioning, or live provider validation.
- No scoring, sync, AI prompt, safety-policy, or recommendation behavior changes.
- Accessibility and performance work is narrowly scoped to existing components and core surfaces.
- Phase K appears only as deferred awareness.

## 5. Dependency Graph

```text
CU-086 privacy UI shell
  └─> CU-087 dry-run deletion contract and inventory
       └─> CU-088 shared runtime log policy and service adapters
            └─> CU-089 vendor-neutral telemetry + crash boundary
                 └─> CU-090 common data-state language + AI-summary fallback
                      └─> CU-091 accessibility audit of all shared states
                           └─> CU-092 data-safe, dev-only profiling
                                └─> CU-093 consolidated TestFlight runbook
```

The order is safe because:

- CU-086 remains informational and never calls a missing or destructive API.
- CU-087 exposes an injected audit seam and emits no logs until CU-088 supplies the approved logger.
- CU-088 establishes one sensitivity policy for backend, AI, telemetry, and later performance events.
- CU-089 creates a crash fallback that CU-090 can restyle using common state primitives.
- CU-091 validates every state component introduced by CU-090.
- CU-092 reuses the telemetry event allowlist and preserves CU-091 accessibility behavior.
- CU-093 consumes the privacy, deletion, crash, state, accessibility, and performance runbooks/checklists as release gates.

## 6. Cross-CU Artifact Dependency Ledger

| Artifact                                                                                              | Status | Created by | Required downstream readers | Reason                                                        |
| ----------------------------------------------------------------------------------------------------- | ------ | ---------: | --------------------------- | ------------------------------------------------------------- |
| `apps/mobile/app/settings/{index,privacy}.tsx`, `SettingsScreen`, `PrivacyScreen`, and `privacyModel` | `[E]`  |     CU-086 | CU-090, CU-091, CU-093      | State, accessibility, and release audits include privacy UI   |
| `DELETION_DISCLOSURE` and its compile-time non-operational flags                                      | `[E]`  |     CU-086 | CU-087, CU-090              | Backend contract must not make the UI’s placeholder deceptive |
| `DeletionDryRunRequest/Response` schemas and category enum                                            | `[P]`  |     CU-087 | CU-088, CU-093              | Stable non-destructive contract and release verification      |
| `USER_DATA_DELETION_MANIFEST`                                                                         | `[P]`  |     CU-087 | CU-088, Phase Z             | Canonical inventory for later real execution design           |
| `buildDeletionDryRun` and injected inventory/archive ports                                            | `[P]`  |     CU-087 | CU-088, Phase Z             | Allows logging adoption without deletion-logic rewrites       |
| User-data deletion runbook                                                                            | `[P]`  |     CU-087 | CU-093, Phase Z             | Completeness and production-disable checks                    |
| Runtime event allowlist, sanitizer, safe error classifier, logger                                     | `[P]`  |     CU-088 | CU-089, CU-092, CU-093      | One sensitivity policy across services                        |
| API/worker/AI logger adapters                                                                         | `[P]`  |     CU-088 | CU-089, CU-092              | Correlation and safe operational events                       |
| `ErrorBoundary`, crash fallback model, telemetry adapter                                              | `[P]`  |     CU-089 | CU-090, CU-091, CU-093      | Common recovery behavior and release smoke test               |
| `DataStatePanel`, `DataStatusBanner`, state-copy resolver                                             | `[P]`  |     CU-090 | CU-091, CU-092, CU-093      | Consistent loading/error/uncertainty language                 |
| Latest AI-summary contract/repository/route/mobile hook                                               | `[P]`  |     CU-090 | CU-091, CU-093              | Cached-summary fallback and accessibility validation          |
| Accessibility matrix and runbook                                                                      | `[P]`  |     CU-091 | CU-092, CU-093              | Profiling must preserve behavior; release QA consumes it      |
| `IconButton` and hardened `BottomSheet` interfaces                                                    | `[P]`  |     CU-091 | CU-092, CU-093              | Standard touch/focus semantics                                |
| Performance event names, spans, profiler wrapper                                                      | `[P]`  |     CU-092 | CU-093                      | Release checklist records device baselines                    |
| Mobile performance runbook                                                                            | `[P]`  |     CU-092 | CU-093, Phase Z             | Repeatable measurements and thresholds                        |
| TestFlight release runbook                                                                            | `[P]`  |     CU-093 | Phase Z                     | Credentialed build and submission handoff                     |

No ADR is planned. Each listed ADR trigger requires stopping before creating one.

## 7. Privacy and Data-Deletion Inventory

### Current user-owned relational data

| Category             | Tables                                                                                                                                     | Handling in future executor                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Identity/account     | `users`, `auth_identities`                                                                                                                 | Delete identities before final user tombstone/delete                                                |
| Preferences/consent  | `user_goals`, `coach_preferences`, `nutrition_philosophy_preferences`, `consent_records`, `data_retention_preferences`                     | Hard delete                                                                                         |
| Provider             | `provider_connections`, `provider_data_availability`, `provider_sync_jobs`, `provider_sync_cursors` through connection                     | Revoke outside Phase J; delete cursors/jobs/availability before connections                         |
| Raw archive metadata | `raw_provider_payloads`                                                                                                                    | Delete object bytes first in a future executor, then metadata                                       |
| Metrics              | `metric_observations`, `metric_timeseries_samples`, `daily_metric_summaries`, `rolling_metric_baselines`                                   | Existing cascades assist, but inventory explicitly verifies them                                    |
| Sleep/planning       | `sleep_sessions`, `sleep_stage_intervals`, `sleep_daily_features`, `bedtime_planner_requests`, `bedtime_recommendations`                   | Child-before-parent or cascade                                                                      |
| Activity/vitals/body | `workout_sessions`, `workout_hr_zone_summaries`, `training_load_daily`, `body_composition_measurements`, `vital_daily_features`            | Child-before-parent or cascade                                                                      |
| Manual/lifestyle     | `manual_checkins`, `hydration_entries`, `caffeine_entries`, `alcohol_entries`, `bowel_entries`                                             | Hard delete; no `manual_checkins.deleted_at` currently exists                                       |
| Tags                 | `custom_tags`, `tag_events`                                                                                                                | Events before tags                                                                                  |
| Nutrition            | `nutrition_entries`, `nutrition_entry_items`, `daily_nutrition_summaries`                                                                  | Items before entries                                                                                |
| Private foods        | `food_items` where `owner_user_id=user`, related `food_nutrient_values`                                                                    | Delete private foods explicitly before deleting user to avoid `ON DELETE SET NULL` globalizing them |
| Scores/insights      | `score_snapshots`, `score_component_values`, nullable-user `algorithm_runs`, `insight_candidates`, `correlation_results`, `anomaly_events` | `ai_summaries` first when it references a score snapshot                                            |
| AI                   | `ai_conversations`, `ai_messages`, `ai_context_snapshots`, nullable-user `ai_model_invocations`, `ai_summaries`                            | Context/messages before conversations; summaries before source scores                               |
| UI/cache             | `dashboard_widgets`, `theme_settings`, `mobile_cache_manifests`                                                                            | Hard delete; device-local caches require a later authenticated wipe signal                          |

Not user-owned:

- `schema_migrations`, `metric_definitions`, `provider_metric_mappings`, `food_catalog_sources`.
- Global `food_items` where `owner_user_id IS NULL` and their nutrient rows.

### Raw archive inventory

- Local root: `[E] database/fixtures/.local-dev-archive/`, gitignored.
- Implemented key shape: `provider={code}/user_id={id}/data_type={type}/year={yyyy}/month={mm}/day={dd}/{payloadId}.json.gz`.
- Authoritative inventory source: user-owned `raw_provider_payloads.storage_bucket/storage_key`, not bucket-wide listing.
- `RawArchiveLocator` is treated as sensitive internal data. It may be used by the worker dry-run port but must never be logged, returned by the API, or included in snapshots.
- Public dry-run output contains category status/counts only, never keys, prefixes, IDs, provider payload contents, or tokens.

### Production safety gates

- Endpoint: `POST /api/v1/data/delete-all`.
- Required body: `{ "mode": "dry_run" }`.
- Required `Idempotency-Key` header with bounded safe syntax.
- Enabled only when `APP_ENV` is `local|dev` and mock auth is enabled.
- Staging/prod registration returns the standard not-found response.
- Response says `status: "not_scheduled"` and `productionExecutionEnabled: false`.
- Idempotency is a deterministic opaque dry-run reference only; it is not durable and must not be described as a stored deletion request.
- No `execute`, `delete`, `purge`, queue, status mutation, S3 delete, or SQL mutation method is introduced.
- The worker inventory manifest documents dependency order but exposes only read/count ports.

## 8. Runtime Logging and Telemetry Data Policy

### Safe fields

Only event-specific allowlisted fields:

- Stable event name, service, environment, severity, timestamp.
- Validated request/correlation ID.
- HTTP method, route template, status code.
- Safe error classification/code, never raw message or stack.
- Duration and explicitly named operational counts.
- Job/task/status codes.
- AI provider/model identifier, token counts, latency, and terminal status.
- Dev-only screen/performance event code and duration.
- Deletion category and aggregate count, without identifiers or archive locators.

### Forbidden fields

- Raw or hashed user IDs, email, device or connection IDs.
- Authorization headers, tokens, credentials, secret values or names.
- Request/response bodies and URLs containing query values.
- Health metrics or values, notes, tags, nutrition/digestion data.
- Prompts, messages, responses, context packets, evidence statements, or AI summaries.
- Provider payloads, archive keys/prefixes, metadata JSON.
- Error messages, stack traces, causes, or arbitrary object serialization.
- Breadcrumb text derived from user actions or screen content.

### Runtime versus fixture redaction

- `[E] packages/core-types/src/redaction.ts` remains unchanged because fixture redaction intentionally preserves numeric values.
- `[P] packages/config/src/logging.ts` implements a stricter runtime sanitizer and event registry.
- Runtime safety is achieved through both compile-time event-specific metadata types and runtime allowlisting. Recursive redaction alone is insufficient because numeric health values cannot be recognized generically.
- Nested objects/arrays are permitted only for explicitly declared operational sub-shapes; everything else is dropped.
- Bounds: maximum depth, keys, array length, and string length; malformed, cyclic, symbol, bigint, function, or unexpected values are discarded.

### Correlation and errors

- Reuse `x-request-id`.
- Reject overlong or invalid incoming request IDs and generate a UUID instead.
- Mobile `ApiClientError` retains a safe backend request ID.
- Safe error classification maps known error classes/codes; unknown errors become `UnknownError`.
- No logger accepts an `Error` or arbitrary context directly after classification.
- Mobile telemetry defaults to no-op and exposes no breadcrumb API.

## 9. Mobile Quality Audit Matrix

| Surface `[E]`        | State work in CU-090                                                         | Accessibility focus in CU-091                                | Performance point in CU-092            |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Home                 | Initial/cached refresh, empty, stale, score uncertainty, API error           | Header/settings controls, widget labels/order, announcements | Cached warm render                     |
| Sleep                | Stage availability, history, missing metrics, stale/provisional, AI fallback | Chart/timeline summaries, sheet focus                        | Tab and chart render                   |
| Recovery             | Missing required/optional vitals, stale/provisional, AI fallback             | Score/evidence order and non-color meaning                   | Tab and chart render                   |
| Activity             | Empty/rest day vs unavailable, load history, calculation error, AI fallback  | Chart/workout summaries                                      | Tab and chart render                   |
| Nutrition            | Empty/manual-only, stale refresh, API error                                  | Quick-add forms, scaling, keyboard traversal                 | Cache commit after manual log          |
| Vitals               | Provider unavailable/unverified, missing metrics, stale/error                | Trend summaries and units                                    | Chart render                           |
| Body Composition     | Replace binary availability with common provider/history/error states        | Trend summary, non-diagnostic copy                           | Chart render                           |
| AI Coach             | Streaming, empty conversation, retry/error, cached summary boundary          | Composer traversal, streaming announcements                  | First streamed/mock token              |
| Connections          | Initial/refresh, disconnected, unavailable/unverified, action error          | Buttons, status announcements, confirmation sheets           | Refresh request lifecycle              |
| Settings/Privacy     | Connected-source load/error and explicit placeholders                        | Navigation order and disclosure headings                     | No dedicated instrumentation           |
| Bedtime planner      | Empty/error/result states                                                    | Picker/segments/sheet traversal                              | Screen render only if profiler enabled |
| Check-in/Quick Add   | Validation/submission/error states                                           | Forms, keyboard, focus, disabled controls                    | Cache commit after write               |
| Crash fallback `[P]` | Restyled with common error language                                          | Initial focus and retry/go-home semantics                    | No profiling while crashed             |

State semantics must remain distinct:

- Blocking: initial loading, genuine empty, disconnected, unavailable, unverified, insufficient history, missing required, calculation failure, API error.
- Non-blocking: refreshing cached data, stale, provisional, missing optional metric, cached AI fallback.
- “No activity” is not “provider unavailable.”
- “Unverified provider capability” is not “permission denied.”
- Missing values never render as zero.

## 10. Commit Unit Plans

### CU-086 — Add privacy and data controls UI shell

1. **Goal:** Add a reachable, informational Privacy & Data Controls screen.
2. **Why:** Private-beta users need visible explanations of connected sources, retention, deletion status, and AI processing before those controls are production-ready.
3. **Preconditions:** CU-060 connections and CU-084/085 AI surfaces are present; no backend privacy contract exists.
4. **Required reading:** Phase J plan; `.ai-agent-instructions.md`; `CONTRIBUTING.md`; TAD §4.6, §11.4, §22; UI/UX §3.6, §5.2–5.3, §11.10; PRD §10.15 and §18; AI §23; no prior Phase J artifacts.
5. **Existing implementation:** `[E] settings/_layout.tsx`, connections screen/hook, Home header, auth/settings stores, `BottomSheet`, `Button`, `Card`, `Text`, reduced-motion hook.
6. **Files created:** `[P] apps/mobile/app/settings/index.tsx`; `[P] apps/mobile/app/settings/privacy.tsx`; `[P] apps/mobile/src/features/settings/SettingsScreen.tsx`; `[P] apps/mobile/src/features/privacy/{PrivacyScreen,privacyModel,index}.ts(x)`; `[P] apps/mobile/test/privacy/privacyModel.test.ts`.
7. **Files modified:** `[E] apps/mobile/app/settings/_layout.tsx`; `[E] apps/mobile/src/features/home/components/HomeHeader.tsx`; `[E] apps/mobile/src/features/home/HomeScreen.tsx`.
8. **Do not modify:** API routes/contracts, database, EAS/app config, AI prompt/safety files, connection token/repository logic.
9. **Sequence:** Add Settings index; add one Home-header Settings affordance; add thin routes; build pure privacy view model; render connected sources through `useConnections`; add disclosure/deletion informational sheets; add tests.
10. **In-scope behavior:** Group links for Connections and Privacy; show public provider status only; retention labeled “private-beta placeholder, not editable”; deletion explanation explicitly states no request is sent or scheduled; AI disclosure labeled draft and non-legal.
11. **Non-goals:** No destructive button, mutation, account closure, retention editor, token details, final legal text, or backend wiring.
12. **Acceptance trace:** Directly satisfies CU-086’s four required visible areas and current/future distinction.
13. **Privacy/security:** Never render provider tokens, connection IDs, user/email data, context packets, prompts, evidence, or raw health values.
14. **Tests:** Model copy/status mapping, no-functional-deletion assertions, provider public-state mapping, typed route build.
15. **Verification:** `pnpm --filter @primis/mobile test`; `pnpm --filter @primis/mobile typecheck`; `pnpm --filter @primis/mobile lint`; `pnpm format:check`.
16. **CI/PR:** Mobile tests/typecheck plus root lint/format.
17. **Pitfalls:** Making placeholder controls look actionable; duplicating connection state; disrupting Home editing; implying legal approval.
18. **Blocking/ADR triggers:** Final legal language, editable retention, or a real delete action requires direction. No ADR expected.
19. **Downstream artifacts:** `apps/mobile/app/settings/{index,privacy}.tsx`; `apps/mobile/src/features/settings/SettingsScreen.tsx`; `apps/mobile/src/features/privacy/{PrivacyScreen,privacyModel,index}.ts(x)`; and the `DELETION_DISCLOSURE` copy structure with `canSubmitRequest: false` and `canScheduleDeletion: false` for CU-087/CU-090 reuse.
20. **Commit:** `mobile: add privacy and data controls UI (CU-086)`.

### CU-087 — Add backend deletion workflow skeleton

1. **Goal:** Define a complete, dry-run-only deletion inventory and a local/dev mock endpoint that cannot schedule or execute deletion.
2. **Why:** Future deletion needs an audited ownership map and safety boundary before any destructive implementation.
3. **Preconditions:** CU-086 is present and remains unwired; migrations `000001`–`000008` are authoritative.
4. **Required reading:** Phase J plan; agent/contribution instructions; ADR-003, ADR-007, ADR-008; implementation CU-087; TAD §11.3–11.4, §12.3 Data controls, §22.6; data model §5.5 and §7–19; CU-086 privacy artifacts.
5. **Existing implementation:** `[E] users status enum, auth middleware, API envelopes, worker storage abstraction, raw metadata table, local archive, all current migrations`; `[A] deletion route/worker/runbook`.
6. **Files created:** `[P] packages/api-contracts/src/privacy.ts`; `[P] packages/api-contracts/test/privacy.test.ts`; `[P] services/api/src/routes/privacy.ts`; `[P] services/api/test/routes/privacy.test.ts`; `[P] services/workers/src/privacy/deletionInventory.ts`; `[P] services/workers/test/privacy/deletionInventory.test.ts`; `[P] docs/runbooks/user-data-deletion.md`.
7. **Files modified:** `[E] packages/api-contracts/src/index.ts`; `[E] services/api/src/app.ts`; `[E] services/api/src/auth/authMiddleware.ts` and its test; `[E] services/workers/src/index.ts`.
8. **Do not modify:** Migrations, repositories’ delete methods, user status, queues, archive implementations, AWS/IaC, mobile privacy screen.
9. **Sequence:** Define category schemas; align mock-auth `dev` naming; add environment-negative tests; create table manifest and dependency phases; define read-only inventory/archive ports; implement redacted dry-run builder; add guarded route factory; write runbook and coverage test against the migration-derived table list.
10. **In-scope behavior:** `POST /api/v1/data/delete-all`, dry-run literal only, bounded idempotency header, opaque deterministic reference, `not_scheduled`, category inventory, production disabled.
11. **Non-goals:** No persisted request, user-status mutation, token revocation, SQL deletion, S3 listing/deletion, cache wipe signal, queue, retry worker, or mobile call.
12. **Acceptance trace:** Endpoint can request a dry run in local/dev mock mode; worker manifest enumerates every current user-owned table and archive convention; runbook verifies completeness; prod execution is absent.
13. **Privacy/security:** No IDs/keys/prefixes returned or logged; route accepts no arbitrary payload; manifest output is aggregate-only; staging/prod behaves as not found.
14. **Tests:** Contract validation; environment matrix; idempotency stability; invalid-key handling; no side-effect port methods; complete table/category coverage; private-food hazard; `ai_summaries`; production-negative route.
15. **Verification:** `pnpm --filter @primis/api-contracts test`; `pnpm --filter @primis/api test`; `pnpm --filter @primis/workers test`; filtered typechecks; `docker compose config --quiet`. Optional local Postgres inventory queries follow the runbook.
16. **CI/PR:** API-contract, API, and worker projects plus root checks.
17. **Pitfalls:** Treating the opaque reference as durable; relying only on cascades; omitting nullable-user rows/private foods/AI summaries; exposing archive locators; introducing a deletion verb.
18. **Blocking/ADR triggers:** Any migration, durable request, real executor, archive delete abstraction, or production enablement stops the CU.
19. **Downstream artifacts:** Deletion schemas/category enum, manifest, dry-run ports, runbook, corrected environment gate.
20. **Commit:** `privacy: add user data deletion workflow skeleton (CU-087)`.

### CU-088 — Add structured logging and redaction helpers

1. **Goal:** Establish event-allowlisted structured logging with strict runtime and telemetry sanitization.
2. **Why:** Current service consoles can expose user IDs and raw error messages; fixture redaction is not safe for runtime logs.
3. **Preconditions:** CU-087 exposes a logging seam and contains no direct logging.
4. **Required reading:** Phase J plan; agent/contribution instructions; TAD §22.3 and §24; AI §19.3 and §23; data sensitivity §5.4; CU-087 manifest/runbook.
5. **Existing implementation:** `[E] request-ID middleware`, fixture redactor, AI telemetry interface, direct consoles in API handler, worker local runner, and database scripts.
6. **Files created:** `[P] packages/config/src/logging.ts` and logging tests; `[P] services/api/src/observability/logger.ts`; `[P] services/api/src/middleware/requestLogging.ts`; `[P] services/workers/src/observability/logger.ts`; `[P] services/ai/src/observability/logger.ts`.
7. **Files modified:** `[E] packages/config/src/index.ts`; `[E] requestId.ts`, errorHandler.ts, app.ts, handler.ts`; `[E] workers localRunner.ts and CU-087 inventory`; `[E] AI types.ts, AiGateway.ts, related tests`; `[E] scripts/db-migrate.ts`, `scripts/db-seed.ts`; source comments containing console examples.
8. **Do not modify:** Fixture-redactor semantics, prompts/context builders, provider payload transport, response bodies, migrations, telemetry dependencies.
9. **Sequence:** Define typed event registry; implement bounded sanitizer/classifier; validate request IDs; create service adapters; integrate request/error/job/AI events; remove user hash and unsafe console output; adopt CU-087 seam; add adversarial tests and repository scan.
10. **In-scope behavior:** JSON lines, stable event names, request IDs, safe durations/counts/status, no arbitrary metadata, injected sink for tests.
11. **Non-goals:** Vendor transport, CloudWatch configuration, dashboards/alerts, request-body logging, health-value marking API, or broad observability platform.
12. **Acceptance trace:** Tokens/emails/provider payloads/prompts/notes/health values/user IDs are impossible in approved event shapes; requests correlate safely; tests cover nested/malformed data.
13. **Privacy/security:** Unknown keys dropped; forbidden-key matching is case/format insensitive; cycles and unsafe primitives handled; raw errors never reach sinks.
14. **Tests:** Arrays, nested objects, over-depth/length, cycles, malformed values, every known sensitive-key spelling, numeric-health attempted injection, request-ID injection, AI telemetry without user hash, deletion aggregate event.
15. **Verification:** `pnpm --filter @primis/config test`; API/worker/AI tests and typechecks; `pnpm lint`; `rg -n "console\\.(log|warn|error)" services scripts`; sensitive-field scan from §11.
16. **CI/PR:** All backend/service packages plus root lint/typecheck/test/format.
17. **Pitfalls:** Treating redaction as permission to accept arbitrary objects; logging URL query strings; passing `Error`; preserving user hash; breaking CLI diagnostics.
18. **Blocking/ADR triggers:** Remote log vendor, user-linked identifiers, raw error messages, or new telemetry destination.
19. **Downstream artifacts:** Runtime logger/sanitizer, event registry, service adapters, safe error/request-ID policy.
20. **Commit:** `observability: add structured logging and redaction helpers (CU-088)`.

### CU-089 — Add mobile error tracking and crash boundary scaffold

1. **Goal:** Catch routed-screen render crashes and produce safe, vendor-neutral error classifications.
2. **Why:** Private-beta crashes need recovery and correlation without collecting health content.
3. **Preconditions:** CU-088 runtime sensitivity and event registry are present.
4. **Required reading:** Phase J plan; agent/contribution instructions; TAD §18, §24.4, §31.3; UI/UX §3.6 and §21; CU-088 logging artifacts.
5. **Existing implementation:** `[E] root first-run gate/provider tree`, query client, theme provider, API error envelope; `[A] error boundary/telemetry SDK`.
6. **Files created:** `[P] apps/mobile/src/observability/telemetry.ts`; `[P] apps/mobile/src/observability/ErrorBoundary.tsx`; `[P] apps/mobile/src/observability/errorBoundaryModel.ts`; `[P] apps/mobile/test/observability/{telemetry,errorBoundaryModel}.test.ts`.
7. **Files modified:** `[E] apps/mobile/app/_layout.tsx`; `[E] apps/mobile/src/api/errors.ts`; `[E] apps/mobile/test/api/client.test.ts`.
8. **Do not modify:** Provider order, first-run gate logic, QueryClient configuration, EAS/app config, dependencies, DSN/env schema.
9. **Sequence:** Define safe crash event DTO; build no-op adapter; classify without forwarding `Error`; add theme-aware fallback; place boundary inside `QueryClientProvider` around `Stack`; preserve request ID in API errors; add tests.
10. **In-scope behavior:** Retry remounts the routed tree; secondary action returns Home; fallback explains a recoverable app error; optional safe request ID can be shown/copied.
11. **Non-goals:** Native fatal-crash capture, Sentry, network transmission, breadcrumbs, automatic screenshots, outer-provider recovery, or analytics.
12. **Acceptance trace:** Render errors are caught, no-op is default, no DSN is required, sensitive context cannot be attached, and recovery controls work.
13. **Privacy/security:** Telemetry accepts classification/event/screen code/request ID only; no raw `Error`, props, state, route params, messages, or query cache.
14. **Tests:** No-op makes no network call; unknown errors classify generically; boundary retry resets; provider ordering snapshot/assertion; API request-ID parsing.
15. **Verification:** `pnpm --filter @primis/mobile test`; mobile typecheck/lint; root format check; manual dev-client forced-render-error test.
16. **CI/PR:** Mobile automated checks; device recovery remains manual.
17. **Pitfalls:** Placing the boundary outside theme/query providers; catching errors in the boundary itself; exposing a generic context bag; breaking Expo Router remounts.
18. **Blocking/ADR triggers:** Any SDK, DSN, remote endpoint, native crash integration, or breadcrumb capability.
19. **Downstream artifacts:** Crash boundary/fallback, safe telemetry interface, request-ID-aware mobile errors.
20. **Commit:** `mobile: add error boundary and telemetry scaffold (CU-089)`.

### CU-090 — Add loading, empty, stale, and missing-data state audit

1. **Goal:** Normalize presentation of data lifecycle and uncertainty while preserving domain distinctions.
2. **Why:** Current screens have useful but inconsistent state handling, and AI summary read wiring remains deferred from ADR-007.
3. **Preconditions:** CU-089 fallback exists; ADR-007 storage and Phase I summary jobs are present.
4. **Required reading:** Phase J plan; agent/contribution instructions; ADR-004–008; scoring §6.3–6.4 and §8; TAD §18.4–18.5, §30–31; AI §22.3/22.5; UI/UX §11.10, §12.5, §21; CU-089 artifacts.
5. **Existing implementation:** `[E] per-screen models/banners`, cached Home, six connection states, AI summary cards with deferred-read placeholders, `ai_summaries` worker repository.
6. **Files created:** `[P] apps/mobile/src/components/{DataStatePanel,DataStatusBanner}.tsx`; `[P] apps/mobile/src/components/dataStateModel.ts`; `[P] corresponding mobile tests`; `[P] packages/api-contracts/src/aiSummaries.ts` and test; `[P] services/api/src/repositories/aiSummaryRepository.ts`; `[P] services/api/src/routes/aiSummaries.ts` and tests; `[P] apps/mobile/src/api/hooks/useAiSummary.ts`.
7. **Files modified:** `[E] API-contract index, API DB types/app`; `[E] mobile endpoints/mocks`; `[E] Home, Sleep, Recovery, Activity, Nutrition, Vitals, Body Composition, Coach, Connections, Privacy, Bedtime, Check-in/Quick Add screens/models`; `[E] Sleep/Recovery/Activity AI-summary cards`; `[E] CU-089 fallback`.
8. **Do not modify:** Scoring calculations, sync behavior, provider availability derivation, AI generation/prompt logic, navigation layout, database migration.
9. **Sequence:** Define discriminated common states/copy; implement common blocking/non-blocking components; add summary read contract/repository/route; add mock-first mobile hook; wire summary cards; migrate each audited screen incrementally; restyle crash fallback; complete matrix tests.
10. **In-scope behavior:** `GET /api/v1/ai/summaries/latest?type=...` returns `{state:"available", summary}` or `{state:"empty", summary:null}`; only fresh/stale, undeleted, user-owned summaries are servable. Mobile compares summary date to displayed date and marks cached/stale fallback honestly.
11. **Non-goals:** New summary generation, activity-summary invention, state-machine library, global redesign, fabricated provider capabilities, or scoring changes.
12. **Acceptance trace:** All required loading/refresh/empty/provider/stale/provisional/history/missing/calculation/API/cached-AI states are represented and audited across every core surface.
13. **Privacy/security:** AI summaries/evidence are display data and never telemetry; repository scopes by authenticated internal user; no state component serializes data/errors.
14. **Tests:** State-copy exhaustive switch; semantic separation cases; screen-model mappings; latest-summary ownership/status/deleted filtering; empty 200 response; mock/cache/network fallback.
15. **Verification:** API-contract, API, and mobile tests/typechecks; `pnpm lint`; `pnpm format:check`; optional local-Postgres ownership query; manual mock-state matrix on simulator/device.
16. **CI/PR:** API-contract/API/mobile projects and root CI.
17. **Pitfalls:** Collapsing rest day into empty, stale into error, or missing optional into blocking; rendering cached data under a full-screen spinner; serving failed/regenerating summaries.
18. **Blocking/ADR triggers:** Different summary wire shape, new summary type, migration, or change to score/provider semantics.
19. **Downstream artifacts:** Shared state components/model, latest-summary API/mobile hook, completed audit matrix, common crash-state language.
20. **Commit:** `mobile: add missing data and stale state patterns (CU-090)`.

### CU-091 — Add accessibility pass for core components

1. **Goal:** Harden shared controls and all audited core surfaces for VoiceOver, Dynamic Type, focus, touch, contrast, and reduced motion.
2. **Why:** Existing primitives have good foundations, but many screens use custom Pressables and modal/chart behavior needs device verification.
3. **Preconditions:** CU-090 shared state components and matrix are complete.
4. **Required reading:** Phase J plan; agent/contribution instructions; UI/UX §9.5, §11, §13, §17, §21; TAD §18; CU-089/090 artifacts.
5. **Existing implementation:** `[E] 44-point Button/Chip/Stepper/Segments`, scaling Text, reduced-motion hook, chart labels; BottomSheet lacks the documented visible close/focus behavior; no `IconButton`.
6. **Files created:** `[P] packages/design-system/src/components/IconButton.tsx`; `[P] design-system accessibility tests`; `[P] docs/runbooks/accessibility-checklist.md`.
7. **Files modified:** `[E] design-system component exports, BottomSheet, Button/TextField/SegmentedControl and chart components as findings require`; `[E] every core screen/component in the §9 matrix`; `[E] CU-089 fallback and CU-090 states`.
8. **Do not modify:** Visual brand, domain logic, navigation topology, score/health data, dependencies, platform accessibility settings.
9. **Sequence:** Build objective matrix; create IconButton; harden modal focus/close semantics; audit touch targets and roles; audit Dynamic Type/truncation/forms/charts; add loading/error announcements; verify reduced motion; perform iOS manual pass; record unresolved device findings.
10. **In-scope behavior:** Minimum 44×44 interactive regions; meaningful roles/labels/hints/states; modal heading focus and visible close control; return-focus support; labeled chart summaries; non-color state meaning; form traversal and keyboard avoidance.
11. **Non-goals:** Certification, WCAG conformance claim, Android TalkBack certification, visual redesign, or automated contrast tooling dependency.
12. **Acceptance trace:** Runbook covers every required audit dimension and every core surface; static checks plus real VoiceOver/Dynamic Type validation are required.
13. **Privacy/security:** Accessibility labels summarize visible data only and do not reveal hidden identifiers, tokens, notes, prompts, or more precise health content than the screen.
14. **Tests:** Primitive props and disabled/selected state; BottomSheet modal/focus contract; state announcements; chart accessible summary presence; no one-line truncation of critical text at large type.
15. **Verification:** Design-system and mobile tests/typechecks/lint; manual iOS VoiceOver; largest Dynamic Type; Reduce Motion; light/dark increased-contrast review; keyboard/form traversal.
16. **CI/PR:** Design-system/mobile automation; manual device checklist attached to PR.
17. **Pitfalls:** Treating labels as a substitute for focus order; duplicate chart announcements; forced `numberOfLines=1`; inaccessible debug overlays; claiming certification.
18. **Blocking/ADR triggers:** New accessibility dependency, navigation rearchitecture, or acceptance criteria impossible on available hardware.
19. **Downstream artifacts:** IconButton, hardened BottomSheet, accessibility matrix/runbook, documented manual results.
20. **Commit:** `accessibility: audit core mobile components (CU-091)`.

### CU-092 — Add mobile performance checklist and profiling hooks

1. **Goal:** Add stable, dev-only, data-safe measurement points and a repeatable device checklist.
2. **Why:** Private-beta performance targets exist, but the app has no instrumentation or measured baseline.
3. **Preconditions:** CU-088 event policy, CU-091 accessibility behavior, and reduced-motion support are complete.
4. **Required reading:** Phase J plan; agent/contribution instructions; TAD §4.2, §18.3–18.6, §28; UI/UX §18.5–18.6; MVP §27.1; CU-088, CU-090, CU-091 artifacts.
5. **Existing implementation:** `[E] local-first Home/cache`, React Query cache, charts, AI stream, sync refresh, quick-add cache commits; `[A] profiler hooks`.
6. **Files created:** `[P] apps/mobile/src/performance/performanceMarks.ts`; `[P] apps/mobile/src/performance/useRenderTrace.ts`; `[P] apps/mobile/src/performance/DevRenderProfiler.tsx`; `[P] performance tests`; `[P] docs/runbooks/mobile-performance-checklist.md`.
7. **Files modified:** `[E] CU-088 runtime event registry`; `[E] root layout/Home route or screen`; `[E] chart wrappers`; `[E] useCoachChat.ts`; `[E] useConnections.ts`; `[E] useQuickAdd.ts`.
8. **Do not modify:** Production EAS profiles, dependencies, animation behavior, accessibility labels/order, API payloads, provider sync/scoring logic.
9. **Sequence:** Add stable event names and injectable clock/sink; implement production no-op; instrument cold root commit, warm Home, tab/chart commits, first AI token, sync refresh, and quick-add cache commit; add unit tests; record device procedure and baseline table.
10. **In-scope behavior:** Events contain event code, duration, outcome, render count, and environment only. Measurements emit only in development and through the CU-088 sanitizer.
11. **Non-goals:** Analytics, continuous production monitoring, performance overlay UI, dependency-heavy profiling, invented SLA, or converting cache writes to true pre-ack optimistic mutations.
12. **Acceptance trace:** All requested points are measurable; production no-op is tested; instrumentation introduces no console spam or sensitive labels.
13. **Privacy/security:** No route parameters, provider/user IDs, prompts, notes, metric values, mutation bodies, archive data, or chart series.
14. **Tests:** Injected clock; nested span handling; duplicate-end safety; production no-op; event allowlist; first-token-only measurement; no raw inputs in serialized events.
15. **Verification:** Mobile tests/typecheck/lint; production-mode unit test; manual dev-client measurements on a consistent device; root secret/log scan.
16. **CI/PR:** Mobile automation; recorded device baselines are PR evidence, not CI gates.
17. **Pitfalls:** Measuring JS setup instead of perceived paint; double-counting AI chunks; profiling every render; introducing screen-reader announcements; labeling recommendations as contractual.
18. **Blocking/ADR triggers:** New profiling SDK, production telemetry, additional native module, or hard budget not supported by source docs.
19. **Downstream artifacts:** Performance event registry extensions, profiler utilities, baseline/checklist runbook.
20. **Commit:** `performance: add mobile performance checklist and hooks (CU-092)`.

### CU-093 — Add EAS/TestFlight readiness checklist

1. **Goal:** Produce a credential-free, auditable runbook for Phase Z’s first internal iOS release.
2. **Why:** EAS structure exists, but private-beta account, privacy, smoke-test, rollback, and submission prerequisites are undocumented.
3. **Preconditions:** CU-086–CU-092 and their runbooks/checklists are complete.
4. **Required reading:** Phase J plan; agent/contribution instructions; implementation CU-093 and Phase Z MAN-006–MAN-009; TAD §8, §23.2, §26.3; MVP §18, §31; all prior Phase J runbooks.
5. **Existing implementation:** `[E] apps/mobile/eas.json`, app config, public env schema, Expo 56/Dev Client, MMKV/SQLite/Reanimated/native modules; placeholders remain.
6. **Files created:** `[P] docs/runbooks/testflight-release.md`.
7. **Files modified:** None expected. `[E] apps/mobile/eas.json` and `[E] apps/mobile/app.config.ts` are audited, not rewritten.
8. **Do not modify:** EAS/app config placeholders, environment values, bundle IDs, credentials, certificates, channels, version, dependencies, native projects.
9. **Sequence:** Record configuration audit; list Phase Z prerequisites; document safe validation/build/submit commands; define privacy/health/AI declarations; compose smoke checklist from prior CUs; add rebuild/rollback notes and sign-off table.
10. **In-scope behavior:** Runbook covers Apple/Expo accounts, identifiers, credentials, profiles/channels/versioning, internal testers, disclosure placeholders, build/submit flow, and rollback.
11. **Non-goals:** Login to EAS/Apple, real identifier selection, credential generation, build, submission, tester invitation, OTA publish, deployment, or store metadata completion.
12. **Acceptance trace:** Every CU-093 checklist item is represented, and all credentialed work is labeled Phase Z manual.
13. **Privacy/security:** Examples use placeholders only; no secrets in commands/history; Expo public variables are explicitly non-secret; release smoke test includes logging/crash/privacy scans.
14. **Tests:** Markdown/format check; static JSON parse; Expo public-config inspection; grep ensures placeholders remain and no credentials were introduced.
15. **Verification:** `node -e "JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8'))"`; `pnpm --dir apps/mobile exec expo config --type public --json`; `pnpm format:check`; secret scan. EAS CLI validation/build/submit commands are Phase Z only because `eas-cli` is not installed.
16. **CI/PR:** Documentation formatting and normal root CI; no release job exists.
17. **Pitfalls:** Treating preview as production, exposing secrets through `EXPO_PUBLIC_*`, replacing placeholders early, overlooking native-module rebuild requirements, or claiming TestFlight readiness without device QA.
18. **Blocking/ADR triggers:** Real identifiers/credentials, profile/channel changes, installed EAS dependency, OTA policy changes, or actual submission.
19. **Downstream artifacts:** Final TestFlight runbook and Phase Z sign-off checklist.
20. **Commit:** `release: add EAS and TestFlight readiness checklist (CU-093)`.

## 11. Phase-Wide Verification and PR Readiness

### Per-PR CI parity

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
docker compose config --quiet
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8'))"
pnpm --dir apps/mobile exec expo config --type public --json
git status --short
```

### Local Postgres checks

Required only for optional ownership/inventory and latest-summary integration validation:

```bash
docker compose up -d db
pnpm db:migrate
pnpm db:seed
```

Run the non-destructive SQL inventory from the deletion runbook. Do not run `db:reset`, `docker compose down -v`, or any DELETE statements as Phase J verification.

Existing integration tests remain skipped unless their documented local-Postgres environment is configured.

### Simulator/device checks

- Settings → Privacy is reachable without disturbing first-run routing.
- Every data-state scenario in §9 renders with honest copy.
- Forced render crash shows fallback; retry and Home recovery work.
- VoiceOver order, modal focus, Dynamic Type, keyboard traversal, contrast, and Reduce Motion follow the accessibility runbook.
- Performance baselines are recorded on a named simulator/device/build mode.
- No debug instrumentation or accessibility noise appears in production-mode tests.

### Secret and sensitive-data scan

```bash
rg -n "console\\.(log|warn|error)" services apps packages scripts
rg -ni "(authorization|bearer|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|raw[_-]?prompt|context[_-]?packet|provider[_-]?payload|userIdHash)" \
  services apps packages scripts docs/runbooks
rg -n "PLACEHOLDER_(EAS_PROJECT_ID|BUNDLE_ID|ANDROID_PACKAGE|APPLE_ID|ASC_APP_ID|APPLE_TEAM_ID)" \
  apps/mobile/app.config.ts apps/mobile/eas.json
git diff --check
```

Every match must be classified. Contract/type names and explicit “do not log” tests may remain; runtime emissions, examples containing sensitive values, and real credentials may not.

### Commands deferred to Phase Z

- `eas login`
- `eas project:init` or equivalent project association.
- `eas credentials`
- `eas build --platform ios --profile preview|production`
- `eas submit --platform ios --profile production`
- App Store Connect/TestFlight tester and privacy configuration.
- Real device login, Google Health, crash vendor, production deletion, and release validation.

## 12. Known Risks and Deferred Decisions

- No durable deletion request exists. The dry-run reference is intentionally non-persistent.
- A real deletion executor will require decisions on request persistence, audit retention, Cognito deletion, token revocation, S3 object operations, retry/rollback, and mobile cache invalidation.
- The current raw archive convention includes an internal user ID in the path. Phase J inventories but does not redesign it.
- `manual_checkins` soft-delete documentation and schema disagree; Phase J does not resolve this with a migration.
- Mobile error handling cannot capture native fatal crashes without a future SDK/native integration.
- Static/unit accessibility checks cannot certify real VoiceOver behavior.
- Performance targets are guidance, not release SLAs. Record both device/build context and measured baseline.
- Provider availability remains partly unverified until live Phase Z validation.
- Private-beta milestone items such as alarms, cost dashboards, backups, rate limits, and actual installs are outside the eight authorized CUs.

## 13. Open Questions / Assumptions

No blocking question remains because the safest choices are supported by higher-priority source documents and the explicit guardrails.

Non-blocking assumptions:

- Implementation remains on `feature/beta-quality-hardening`.
- The CU-087 endpoint is public only in the API-contract sense; environment gating makes it inaccessible in staging/prod.
- Mobile-backend deletion wiring is deferred until a production-approved workflow exists.
- No deletion-request migration is introduced.
- AI summary reads use the current six summary types; existing cards map Sleep→`sleep`, Recovery→`recovery`, and Activity→`workout`.
- `ai_summaries` empty reads use a typed 200 response rather than converting absence into an application error.
- CU-093 does not edit EAS/app config unless implementation discovers structural invalidity; placeholder replacement is Phase Z.
- iOS VoiceOver/manual device validation is the primary Phase J accessibility target; Android validation is recorded for later expansion.

## 14. Definition of Done for Phase J

Phase J is complete when:

- CU-086 through CU-093 each exist as one reviewable commit in order.
- Privacy controls are visible and explicitly non-functional where backend behavior is not approved.
- The deletion inventory covers every current user-owned table, private food, `ai_summaries`, archive metadata, and local-device cache concern.
- Production deletion remains structurally impossible.
- Runtime logs and telemetry use event allowlists and contain no user identifiers, health data, prompts, notes, tokens, payloads, or raw errors.
- Request IDs correlate API and safe mobile errors.
- The root provider order and first-run gate are preserved.
- All core screens have audited, distinct loading/refresh/empty/unavailable/unverified/stale/provisional/missing/error/AI-fallback states.
- Shared state components and crash fallback pass accessibility review.
- VoiceOver, Dynamic Type, keyboard, contrast, modal focus, and Reduce Motion checks are recorded.
- Performance measurements are dev-only, sanitized, and recorded without becoming unsupported SLAs.
- EAS profiles and placeholders are audited, and the TestFlight runbook clearly separates Phase J from Phase Z.
- Root CI-equivalent commands pass, sensitive-data scans are reviewed, and the working tree contains no unrelated changes.

## 15. Reusable CU Handoff Prompt Template

```text
Implement <CU-ID> from:
- plans/phase-j-private-beta-quality-hardening.md
- docs/README.md
- .ai-agent-instructions.md
- CONTRIBUTING.md
- the exact source-of-truth sections listed in that CU
- every relevant accepted ADR
- every prior same-phase artifact listed in the Phase J dependency ledger

Before implementing, verify that every prior CU required by this unit is present
in the current branch. Do not recreate or bypass an artifact created by an
earlier CU.

Repository checks:
- git branch --show-current
- git status --short
- git log --oneline --decorate -20
- inspect every existing/proposed file listed by the CU

Scope:
- Implement only the CU’s in-scope behavior and listed acceptance criteria.
- Preserve all Phase J guardrails and explicit non-goals.
- Stop before any listed blocking-question or ADR trigger.
- Do not add migrations, dependencies, credentials, production deletion,
  deployments, source-of-truth edits, or unrelated refactors unless the CU
  explicitly authorizes them.

Verification:
- Run the exact per-CU commands in the plan.
- Run privacy/security scans relevant to changed files.
- Report commands unavailable locally instead of claiming they passed.
- Confirm no sensitive data appears in logs, telemetry, snapshots, fixtures,
  runbook examples, or error output.

Final response:
1. Outcome and behavior delivered.
2. Files created/modified.
3. Tests and verification results.
4. Privacy/security review.
5. Remaining risks or deferred work.
6. Commit hash and recommended commit message:
   <area>: <short imperative summary> (<CU-ID>)
```

## 16. Phase K and Phase Z Preview

Phase K begins correlation and expansion work. No Phase K schema, algorithms, UI, or worker implementation belongs in Phase J.

Phase Z owns:

- Real AWS, Cognito, Google Health, AI, Apple, Expo, and EAS credentials.
- Live provider validation and parity-document updates.
- Production deletion architecture and explicit enablement.
- Telemetry vendor selection and native crash capture, if approved.
- Real identifiers, certificates, provisioning, EAS build, submission, and testers.
- Private-beta readiness execution using the four Phase J runbooks.
