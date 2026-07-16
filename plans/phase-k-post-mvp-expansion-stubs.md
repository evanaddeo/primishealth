# Phase K — Post-MVP Expansion Stubs — Implementation Plan

Status: Ready for implementation  
Branch baseline: feature/post-mvp-expansion-foundations at e62ade18ac2331516e21c4990a7d34ed969f5b55  
Planning date: 2026-07-16  
Execution model: one sequential Phase K branch; one reviewed commit unit at a time

Path notation used below:

- [E] existing repository artifact
- [A] artifact added by the named commit unit
- [P] proposed path; confirm its parent and naming convention immediately before creation

## 1. Product-Owner Execution Directive

Product-owner execution directive: Phase K is required.

Phase K is not an optional backlog or stretch phase. Execute CU-094 through CU-098 in the order and within the boundaries in this plan. A commit unit may stop only for a blocking condition explicitly identified here, a newly discovered source-of-truth conflict, or a required architecture decision that cannot safely be inferred.

## 2. Executive Summary

Phase K activates three deliberately narrow post-MVP foundations:

1. A deterministic correlation skeleton that computes cautious association evidence from existing user-owned records and persists stable, auditable results.
2. FoodData Central import, provenance, search, and private user-food foundations built on the food tables that already exist.
3. An iOS-only, feature-flagged HealthKit boundary plus a server-authoritative local-health upload path that reuses the existing normalized ingestion writer.

The phase is intentionally infrastructure-first. It does not ship causal claims, exhaustive statistics, automatic recommendations, a production-scale USDA refresh service, public food publishing, background HealthKit synchronization, Android health integration, or final device validation. Those remain later work or Phase Z validation.

All outputs must preserve current privacy boundaries: authenticated user scope is server-derived; raw provider payloads are not logged; private foods never cross users; HealthKit permission is requested only after an explicit user action; and correlation language remains associative.

## 3. Verified Repository Baseline

### 3.1 Git and implementation state

- Planning branch: feature/post-mvp-expansion-foundations.
- Baseline commit: e62ade18ac2331516e21c4990a7d34ed969f5b55, the Phase J merge commit and the current origin/main baseline at planning time.
- The worktree was clean before planning.
- Phase H, Phase I, and Phase J implementations are present. The Phase J audit is in history.
- CU-094 through CU-098 are not implemented.
- Existing Phase plans and accepted ADRs are present under plans/ and docs/architecture/decisions/.

### 3.2 Existing foundations Phase K must reuse

- [E] services/workers/src/normalization/NormalizedRecord.ts defines the canonical normalized record union for metric observations, time-series samples, sleep sessions/stages, and workout sessions.
- [E] The workers normalized-record writer is the single idempotent ingestion path. It writes sequentially with per-record best effort, updates provider availability, reports affected dates, and accepts the existing scoring port.
- [E] Source-record uniqueness already exists in the database. Every locally uploaded record and sleep stage therefore needs a non-empty sourceRecordId.
- [E] provider_connections supports the canonical provider code healthkit and tokenless connections.
- [E] consent_records supports consent type healthkit.
- [E] provider_sync_jobs can serve as a user-owned upload-batch ledger without adding a new table.
- [E] correlation_results and insight_candidates already exist in migration 000006_outputs_and_dashboard.sql.
- [E] food_catalog_sources, food_items, and food_nutrient_values already exist in migration 000005_domain_tables.sql.
- [E] nutrition entry/item/summary tables and ADR-008's source-of-truth rules are implemented.
- [E] The API uses Hono, Kysely, dependency injection, authenticated user context, shared Zod contracts, and a common response envelope.
- [E] Expo development-client support is already configured. The mobile app uses Expo 56, React Native 0.86, React 19, and Expo Router.
- [E] EXPO_PUBLIC_MOCK_MODE demonstrates the accepted optional public-environment-variable pattern.

### 3.3 Baseline verification completed during planning

The following commands passed against the clean baseline:

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm format:check
    docker compose config --quiet
    pnpm --filter @primis/mobile exec expo config --type public --json >/dev/null

The test run reported 124 files passed and 6 skipped; 2,644 tests passed and 105 skipped. The skipped database suites remain a verification concern: each database-touching commit unit must run its relevant suites with TEST_DATABASE_URL configured.

### 3.4 Repository drift and corrected assumptions

1. Food catalog tables are already present; Phase K activates and hardens them rather than introducing the base schema.
2. correlation_results already exists, but there is no correlation repository or computation service.
3. insight_candidates has partial repository support, while the AI evidence types can represent correlations; no complete correlation evidence builder exists.
4. Nutrition entry tables are authoritative and daily summaries are derived, per ADR-008.
5. API database types include Phase K food and correlation tables. Workers database types lag the applied migrations for correlation inputs and results and must be extended in CU-094.
6. The canonical provider code is healthkit under ADR-001. Any fixture or narrative reference to apple_healthkit is non-authoritative naming drift.
7. The existing HealthProviderConnector is server/OAuth-oriented and is not the mobile HealthKit adapter boundary.
8. The root build script is a placeholder; it is not a meaningful readiness gate.
9. Ubuntu CI cannot validate an iOS native module or real HealthKit behavior. A macOS build and Phase Z physical-device validation are required.

## 4. Source Authority and Decision Inventory

### 4.1 Precedence

When sources disagree, use this order:

1. Explicit product-owner direction in this plan.
2. Accepted ADRs.
3. Primis Implementation & Integration Specification.
4. Technical Architecture Document.
5. Data Model and Event Schemas.
6. Scoring and Correlation Specification.
7. AI Integration Specification.
8. UI/UX Specification.
9. MVP Specification and PRD.
10. Provider parity/availability matrices and repository comments.

Do not silently resolve a material conflict. Record it, assess whether an accepted ADR already resolves it, and stop for an ADR only when the decision would change a public contract, persisted semantics, security boundary, provider identity, or cross-CU ownership.

### 4.2 Required source sections

Implementers must read only the sections relevant to their CU, but the phase architect and final reviewer must cover all of these:

| Source                                     | Required sections                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Implementation & Integration Specification | §§1, 2.1–2.2, 3.1–3.5, Phase K CU-094–CU-098, and Phase Z                                               |
| MVP Specification                          | §§3.2, 3.4, 16/M10, 19/M13, 20/M14, 21/M15, and 31                                                      |
| Technical Architecture Document            | §§3.2, 3.4, 3.6, 4, 7.3, 8.3, 9.2–9.4, 10.1–10.4, 11.5, 12, 14, 15, 20, 21.3–21.4, 22.3, 27, 32, and 34 |
| Data Model and Event Schemas               | §§3.2, 3.4, 5, 7.6, 8.1–8.4, 9.2, 10, 14–17, 21–22, 25.3–25.5, and 27–28                                |
| Scoring and Correlation Specification      | §§21, 22.1–22.7, 25–27, and 30–33                                                                       |
| AI Integration Specification               | §§2.2, 6.1–6.2, 9.10–9.11, 10.5–10.7, 17, 19, 24.4–24.5, and 29.3–29.4                                  |
| UI/UX Specification                        | §§3.6, 6.6, 7.3, 11.7–11.10, 12.5, 13, 16–17, and 20.6                                                  |
| PRD                                        | §§6.3–6.4, 7.3, 7.5, 10.11–10.12, 12.3–12.4, 17, 23.5, 23.7, and 23.8                                   |
| Provider parity/availability material      | Provider classification, overlap, availability, Hume/HealthKit, and source caveats                      |

### 4.3 Accepted architecture decisions

Read the accepted ADR set before changing a governed surface:

- ADR-0001: Vitest workspace structure.
- ADR-001: canonical provider codes.
- ADR-002: AI intent boundaries.
- ADR-003: Kysely, permitted raw SQL, and manually mirrored DB types.
- ADR-004: activity is not persisted as its own domain table.
- ADR-005: dashboard endpoint boundary.
- ADR-006: detail endpoints.
- ADR-007: ai_summaries persistence.
- ADR-008: manual-input aggregation and nutrition source of truth.
- Google Health API metric-availability decision.

The most directly applicable decisions are ADR-001, ADR-003, ADR-006, ADR-007, ADR-008, and the provider-availability decision. Do not modify an accepted ADR in Phase K. Add an ADR only when a trigger identified below is reached.

## 5. Phase Boundaries and Guardrails

### 5.1 In scope

- Deterministic, testable group-difference correlation computation and persistence.
- A fixed v1 factor/outcome allowlist using existing records.
- FDC CSV import scaffolding for Foundation and Branded datasets.
- Search-vector/index support, food provenance, authenticated search, and private user-food CRUD.
- An iOS-only HealthKit capability/authorization adapter behind a default-off flag.
- An authenticated HealthKit upload contract and route that reuse the normalized writer.
- Focused migrations, shared contracts, tests, documentation comments, and CI-safe platform separation needed for those deliverables.

### 5.2 Out of scope

- Causal inference, clinical claims, automatic recommendations, regression, p-values, automated significance testing, or an exhaustive correlation matrix.
- Modifying historical/applied migrations 000001 through 000008.
- Live downloading, scraping, or redistributing USDA datasets.
- Shipping large or real FDC archives in Git.
- Public/community foods, moderation, barcode search, fuzzy/semantic search, or user-food sharing.
- HealthKit write access, clinical data, nutrition ingestion, background observers, anchors, or periodic synchronization.
- Health Connect, Android health APIs, or server-side Apple OAuth.
- Replacing the provider connector framework or normalized ingestion path.
- Final App Store wording approval, production signing, real Hume/HealthKit reconciliation, or physical-device acceptance; those are Phase Z.
- Editing product source documents or accepted ADRs merely to align narrative wording.

### 5.3 Universal guardrails

- Derive user identity, provider identity, and provider connection identity on the server.
- Never accept healthkit, userId, or providerConnectionId as client authority in the upload body.
- Never log raw health records, food source rows, tokens, consent payloads, or database error detail that may contain user data.
- Preserve private ownership in every repository query, mutation, retry, and idempotency lookup.
- Use stable identifiers and deterministic ordering.
- Keep public error codes bounded and messages non-sensitive.
- Do not prompt for HealthKit permission at app startup.
- Do not make iOS-native imports reachable from Android or Node test bundles.
- Do not make Phase K dependent on optional AI generation.
- Do not edit source-of-truth documents within a CU.

## 6. Dependency Graph

    CU-094 Correlation skeleton ───────────────────────────────┐
                                                               │
    CU-095 FDC schema/import ──> CU-096 Food search + CRUD      ├─> Phase-wide readiness
                                                               │
    Existing Phase E ingestion ─┐                              │
                                ├─> CU-098 Local upload ────────┘
    CU-097 HealthKit boundary ───┘

Execute sequentially as CU-094, CU-095, CU-096, CU-097, CU-098 on the current Phase K branch. The graph documents logical dependencies; it does not authorize parallel CU branches or schema forks.

## 7. Cross-CU Artifact Dependency Ledger

| Artifact/contract                            | Owner                  | Consumers                       | Rule                                                   |
| -------------------------------------------- | ---------------------- | ------------------------------- | ------------------------------------------------------ |
| Correlation input/output vocabulary          | CU-094                 | Future insights and AI evidence | Stable, deterministic, non-causal                      |
| correlation_results metadata schema          | CU-094                 | Future evidence builder and UI  | Include algorithm version and cohort details           |
| Food source and search-vector convention     | CU-095                 | CU-096 and future imports       | CU-096 must reuse; no alternate normalization          |
| Synthetic FDC fixtures                       | CU-095                 | CU-096 tests                    | Small, fabricated, public-safe                         |
| Food response and CRUD contracts             | CU-096                 | Mobile/web clients              | Ownership and provenance explicit                      |
| Canonical local-health capability vocabulary | CU-097                 | CU-098 and mobile UI            | Shared core codes, no Apple identifiers in server wire |
| iOS HealthKit adapter/fake                   | CU-097                 | Future synchronization UI       | Platform-safe and flag-gated                           |
| Local-health upload contract                 | CU-098                 | Future mobile sync              | Server-authoritative provider and ownership            |
| Existing normalized writer                   | Phase E                | CU-098                          | Reuse unchanged semantics; never fork                  |
| provider_sync_jobs batch ledger              | Existing schema/CU-098 | Retry/status behavior           | Safe summary only; no raw records                      |

## 8. Architecture Decision Register

| Decision                        | Phase K resolution                                                                                                                                                           | Status / escalation trigger                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Correlation method              | Difference of exposed and comparison-group means in the outcome's native unit; lagged variant changes date alignment only. correlation_value and p_value remain null.        | Assumed for v1. ADR before adding regression, Pearson/Spearman, significance, or causal claims. |
| Correlation factors             | Alcohol presence, caffeine presence, custom-tag presence, and hydration-target-met where a stored target and sufficient hydration logging exist.                             | Derived from scoring spec and current data. New automatic factors require allowlist review.     |
| Outcomes                        | Fixed allowlist drawn from existing score/summary metrics; no dynamic exhaustive pairing.                                                                                    | Locked for the skeleton; enumerate in code and tests.                                           |
| Time semantics                  | Use persisted user-local dates; sleep is attributed by wake date; lag is whole local days. Do not reconstruct dates from UTC.                                                | Locked by existing model semantics.                                                             |
| Missing data                    | Exclude invalid/non-finite outcomes and unavailable required factor inputs. Treat untagged eligible dates as comparison dates and disclose logging-completeness uncertainty. | Assumed. Material imputation requires ADR.                                                      |
| Outliers                        | No trimming or winsorization in v1; exclude only invalid/non-finite values.                                                                                                  | Assumed because no authoritative threshold exists.                                              |
| Sample thresholds               | Fewer than 6: suppress; 6–11: early; 12–24: medium; 25+: higher.                                                                                                             | Locked by scoring specification.                                                                |
| Confidence                      | A data-sufficiency label, not statistical or causal certainty. Persist low/medium/high only as a compatibility mapping, with the display tier retained in metadata.          | Assumed interpretation.                                                                         |
| Effect threshold                | Do not invent a minimum effect filter. Persist the native-unit mean difference and sample caveat.                                                                            | Locked by absence of an approved threshold.                                                     |
| Multiple comparisons            | Evaluate only the fixed allowlist, store the comparison family, expose no p-values, and make no significance claims.                                                         | Assumed. Automated exploration requires ADR.                                                    |
| Correlation idempotency         | Logical key: user, factor, outcome, window, lag, method, and metadata.algorithmVersion; repository performs select then update-or-insert.                                    | Uses existing schema. Concurrent uniqueness or algorithm column needs migration/ADR.            |
| Initial FDC datasets            | Foundation and Branded.                                                                                                                                                      | Non-blocking assumption supported by current USDA downloads.                                    |
| Import format                   | Explicit local CSV input; no downloader.                                                                                                                                     | Non-blocking assumption. JSON support is out of scope.                                          |
| CSV parser                      | Maintained streaming csv-parse package, pinned through the lockfile.                                                                                                         | Implementation-time license/security/compatibility gate; custom CSV parsing is prohibited.      |
| FDC provenance                  | Each item stores dataset and release in metadata; source row stores current release/import summary.                                                                          | Inferred from existing schema.                                                                  |
| Import idempotency              | Upsert by source_code plus external_food_id; replace nutrient rows for each successfully normalized food inside bounded transactions.                                        | Inferred from existing uniqueness.                                                              |
| Missing source rows on refresh  | Do not delete or hide absent foods automatically; report stale candidates.                                                                                                   | Destructive replacement requires an ADR/product rule.                                           |
| Nutrients                       | Map only the approved macro/micronutrient IDs needed by current contracts; retain unmapped counts, not raw rows, in reports.                                                 | Allowlist must be explicit and tested.                                                          |
| Food search                     | Query length 2–100; page default 20, max 50; exact normalized name, prefix, full-text rank, then stable brand/name/id ties.                                                  | Non-blocking assumption; cursor search is deferred.                                             |
| Food visibility                 | all means global plus current user's private foods; mine means current user's rows; global excludes user rows. Hidden rows never appear in search.                           | Locked privacy boundary.                                                                        |
| User-food deletion              | Ownership-scoped soft removal by setting visibility to hidden.                                                                                                               | Assumed because existing schema has no deleted_at. Hard deletion needs product confirmation.    |
| Native HealthKit library        | Prefer @kingstinct/react-native-healthkit with react-native-nitro-modules, exact versions pinned after compatibility validation.                                             | Assumption with mandatory gate. Failure requires stop/ADR; do not silently substitute.          |
| HealthKit feature flag          | EXPO_PUBLIC_HEALTHKIT_ENABLED, optional and default false.                                                                                                                   | Reuses current public-env pattern.                                                              |
| Platform loading                | Only the .ios implementation imports the native library; Android and tests receive unavailable/fake implementations.                                                         | Required for CI and Android safety.                                                             |
| HealthKit read permission state | Do not expose a definitive read-denied state; use unavailable, not_requested, request_in_progress, requested, limited_or_no_data, available, and error.                      | Locked to Apple privacy behavior.                                                               |
| HealthKit read scope            | Weight, body fat, lean mass, HRV RMSSD, resting heart rate, sleep/stages, and workout sessions only.                                                                         | Non-blocking v1 allowlist. Writes and nutrition are excluded.                                   |
| Upload endpoint                 | POST /api/v1/me/providers/healthkit/uploads; enable/reactivate via POST /api/v1/me/providers/healthkit.                                                                      | Proposed public contract; contract tests freeze it in CU-098.                                   |
| Upload batch                    | UUID batchId; maximum 100 normalized records; every record/stage has a non-empty sourceRecordId.                                                                             | Non-blocking operational bound.                                                                 |
| Upload idempotency              | Reuse provider_sync_jobs with the client batch UUID. A collision is replayable only for the same authenticated user and connection.                                          | Existing schema is sufficient. Cross-owner collision is conflict.                               |
| Partial success                 | Per-record best effort through the existing writer; return bounded index/code errors and safe counts/dates.                                                                  | Matches existing writer. No whole-batch rollback.                                               |
| Provider precedence             | Preserve current source policy and availability logic; HealthKit is another canonical source, not an implicit replacement for Hume.                                          | Governed. Any precedence change requires ADR.                                                   |

## 9. Correlation Architecture

### 9.1 Computation boundary

The pure engine belongs in [P] packages/scoring/src/correlation/. It accepts already aligned daily observations and a fixed CorrelationDefinition. It performs no database access, clock access, logging, AI generation, or user-specific authorization.

The v1 result contains:

- factorCode, outcomeMetricCode, windowDays, and lagDays;
- exposed and comparison sample counts and means;
- native-unit difference and optional percentage difference only when the comparison mean is nonzero;
- direction, method, algorithmVersion, exclusion counts, and data-sufficiency tier;
- displayStatus of suppressed or eligible;
- a structured, templated association summary that never uses causal language.

Use algorithmVersion correlation_engine_v1_0. The method is simple_difference for same-day alignment and lagged_difference when lagDays is nonzero.

### 9.2 Cohort construction

- Alcohol, caffeine, and custom tags: exposed dates contain the factor; comparison dates are other eligible outcome dates within the window.
- Hydration: exposed dates meet a stored hydration target; comparison dates have a stored target and recorded hydration below it. Dates without a target or usable hydration total are excluded.
- Lag: pair factor date D with outcome date D plus lagDays.
- Sleep: use the persisted wake-date attribution.
- Each cohort reports eligible dates, excluded dates by bounded reason code, and logging-completeness caveats.

Do not interpret absent entries as clinical absence. The output should say “days with a recorded tag/entry compared with other eligible days,” not “use versus non-use,” where the distinction matters.

### 9.3 Persistence

The workers orchestrator loads source rows, builds daily inputs, calls the pure engine, and persists to correlation_results. Store algorithmVersion, cohort counts/means, units, exclusion counts, comparison family, display confidence tier, and no-causation marker in metadata.

For a suppressed result, either update an existing logical result to a suppressed metadata state or avoid creating a new visible result; the repository contract must make this deterministic. Do not emit an insight candidate below six eligible paired samples. If an insight candidate is created for an eligible result, use structured evidence and the existing candidate persistence boundary without invoking AI.

### 9.4 Safety language

Allowed: “associated with,” “tended to be higher/lower,” “in your logged data,” and sample-size caveats.  
Prohibited: “caused,” “improved,” “worsened,” “proves,” “significant,” medical diagnosis, or treatment advice.

## 10. FoodData Central Architecture

### 10.1 Import contract

The importer is a local operational script with explicit arguments:

    pnpm fdc:import -- --input <csv-path> --dataset foundation|branded --release <label> [--dry-run] [--chunk-size <n>]

It must:

- stream CSV records and remain memory-bounded for multi-gigabyte Branded exports;
- validate dataset and release before touching the database;
- map stable FDC food IDs to external_food_id;
- normalize names, brand/category/data type, serving data, approved nutrients, provenance, and search text;
- upsert foods and replace their mapped nutrients idempotently;
- commit bounded units so interruption is safely recoverable by rerunning;
- aggregate warnings by bounded code without printing source rows;
- support a true dry run with no database writes;
- write a final safe report containing parsed, accepted, skipped, upserted, nutrient, and stale-candidate counts.

No network download occurs in application code or the import command. Operators obtain USDA archives independently and supply a local path.

### 10.2 Schema activation

[A] database/migrations/000009_food_catalog_search.sql should:

- create the GIN index for food_items.search_vector if it is not already present;
- seed/upsert source codes fdc and user_private without overwriting operational provenance;
- contain no destructive rewrite of existing food rows.

Applied migrations 000001–000008 remain immutable. Import and user-food writes must maintain search_vector explicitly and consistently.

### 10.3 Provenance and freshness

FDC rows use source_code fdc. Item metadata records fdcDataset and fdcRelease. food_catalog_sources records the current source version, imported_at, and a safe aggregate import summary. User-created foods use source_code user_private, owner_user_id, visibility private or hidden, and verified_status unverified.

Dataset freshness is operational metadata, not a client truth claim. A new release does not automatically delete rows absent from the supplied file.

### 10.4 Synthetic fixtures

Check in only tiny fabricated CSV fixtures with the minimum representative Foundation and Branded shapes. They must contain no claim that the values are authentic USDA data and no large archive. Fixtures cover quoted commas, missing optional fields, multiple nutrients, duplicate FDC IDs, malformed rows, and rerun behavior.

Primary external references to re-verify at implementation time:

- USDA FDC dataset downloads: https://fdc.nal.usda.gov/download-datasets/
- USDA FDC data dictionary: https://fdc.nal.usda.gov/portal-data/external/dataDictionary
- USDA FDC FAQ and data-use context: https://fdc.nal.usda.gov/faq/

## 11. HealthKit Architecture

### 11.1 Mobile boundary

CU-097 creates a platform-local adapter with three implementations:

- iOS native adapter: the only implementation allowed to import the native package;
- Android/unavailable adapter: deterministic unavailable capability with no native import;
- fake adapter: deterministic tests and development UI states.

The adapter exposes availability, explicit permission request, authorization/capability state, and typed read-method scaffolds. It does not upload, schedule, background-sync, or write health data.

Canonical read capability codes belong in [P] packages/core-types/src/localHealth.ts so CU-098 can reuse the vocabulary without importing mobile or Apple-specific identifiers. Apple HKQuantityTypeIdentifier and HKCategoryTypeIdentifier mappings remain private to the iOS adapter.

### 11.2 Permission and feature behavior

- EXPO_PUBLIC_HEALTHKIT_ENABLED defaults to false.
- No permission request occurs on import, mount, login, or app startup.
- A visible, explicit user action is required.
- The UI must explain that read authorization may appear as no/limited data and must not claim Apple reported a definitive read denial.
- Request only the v1 allowlist.
- Configure the minimum truthful Info.plist read-purpose wording. Do not add write purpose unless the selected library/build requires it and product/legal approves the wording.
- Adding the native module or config plugin requires rebuilding the development client.

### 11.3 Compatibility gate

Before adding the dependency, verify the exact pinned @kingstinct/react-native-healthkit and react-native-nitro-modules versions against Expo 56, React Native 0.86, React 19, the New Architecture, the active Xcode version, the package license, release activity, and known security notices. Inspect generated native configuration and complete a clean iOS build.

Current implementation-time references:

- Apple authorization guidance: https://developer.apple.com/documentation/HealthKit/authorizing-access-to-health-data
- Apple authorization status: https://developer.apple.com/documentation/healthkit/hkauthorizationstatus
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo native customization: https://docs.expo.dev/workflow/customizing/
- Expo New Architecture: https://docs.expo.dev/guides/new-architecture/
- Candidate package: https://www.npmjs.com/package/@kingstinct/react-native-healthkit
- Candidate releases: https://github.com/kingstinct/react-native-healthkit/releases

### 11.4 Local upload boundary

CU-098 accepts only the shared canonical local-health wire types. The request carries batchId and records; it carries no user ID, provider code, or connection ID. The route:

1. authenticates the caller;
2. finds the caller's active, non-deleted healthkit connection;
3. verifies the latest healthkit consent is granted;
4. reserves or replays the provider_sync_jobs batch;
5. maps validated wire records to the existing NormalizedRecord union;
6. invokes the existing normalized writer;
7. stores and returns a bounded safe summary.

The route must not calculate summaries or scores itself. The normalized writer remains responsible for provider availability and affected-date behavior.

## 12. Commit Unit Plans

### CU-094 — Correlation Engine Skeleton

#### 1. Title and goal

Create a pure, deterministic group-difference correlation engine, a worker-side source/persistence boundary, and focused tests. Produce cautious, structured association evidence from existing data without causal claims or an AI dependency.

#### 2. Why this CU exists

The database and AI evidence vocabulary anticipate correlation results, but the repository has no computation or persistence implementation. This CU establishes one auditable v1 algorithm and stable output for future insight surfaces.

#### 3. Preconditions

- Baseline migrations through 000008 are applied.
- Existing scoring, health-metrics, manual-input, nutrition, and worker tests pass.
- The implementer confirms the actual table and repository names before adding imports.
- No unreviewed correlation implementation exists on the branch.

#### 4. Required reading

- This plan: §§3–9, 12/CU-094, 13–18.
- Repository agent instructions in scope.
- Implementation Specification §§1, 2.1–2.2, 3.1–3.5, CU-094, and Phase Z.
- Scoring Specification §§21, 22.1–22.7, 25–27, and 30–33.
- Data Model §§7.6, 8.1–8.4, 9.2, 14–17, 21–22, and 25.3–25.5.
- AI Specification §§2.2, 6.1–6.2, 9.10–9.11, 10.5–10.7, 17, 19, and 24.4–24.5.
- ADR-002, ADR-003, ADR-007, and ADR-008.
- [E] packages/scoring/src/, packages/health-metrics/src/, services/workers/src/normalization/, services/workers/src/db/types.ts, the correlation_results migration, and existing insight-candidate repository code.
- Prior same-phase artifacts: none.

#### 5. Existing implementation to reuse

- Existing daily entry/summary tables and metric registries.
- Existing Kysely/transaction conventions and workers test harness.
- correlation_results and insight_candidates.
- Existing structured AI evidence types only as future-consumer context; do not invoke AI.

#### 6. Files to create

- [P] packages/scoring/src/correlation/correlationTypes.ts
- [P] packages/scoring/src/correlation/groupDifference.ts
- [P] packages/scoring/src/correlation/correlationEngine.ts
- [P] packages/scoring/src/correlation/index.ts
- [P] packages/scoring/test/correlationEngine.test.ts
- [P] services/workers/src/correlations/correlationSourceRepository.ts
- [P] services/workers/src/correlations/correlationRepository.ts
- [P] services/workers/src/correlations/runCorrelations.ts
- [P] services/workers/test/correlations/correlationRepository.test.ts
- [P] services/workers/test/correlations/runCorrelations.test.ts

Use the repository's actual adjacent test and export naming if it differs; do not create a second convention.

#### 7. Files to modify

- [E] packages/scoring/src/index.ts
- [E] services/workers/src/index.ts
- [E] services/workers/src/db/types.ts
- The smallest existing worker test-support files needed to expose typed tables/fakes.

#### 8. Files explicitly not to modify

- database/migrations/000001 through 000008
- AI prompt/model/generation code
- API or mobile routes
- nutrition/manual-input write paths
- accepted ADRs and product source documents

#### 9. Implementation sequence

1. Inventory exact factor source columns, outcome units, date semantics, and current DB typings.
2. Define the fixed v1 factor/outcome registry and pure input/output types.
3. Implement date alignment, cohort construction, sample tiers, mean difference, exclusion accounting, and deterministic summary tokens.
4. Add exhaustive pure unit tests before database orchestration.
5. Extend workers DB types under ADR-003.
6. Implement user-scoped source queries that return only the daily fields the engine needs.
7. Implement logical-key update-or-insert persistence with algorithm metadata.
8. Add the orchestrator and optional eligible-only insight-candidate emission.
9. Run focused and phase-wide gates.

#### 10. In scope

- Alcohol, caffeine, custom tags, and hydration-target-met definitions.
- Fixed approved outcomes and lag windows from the scoring source.
- Sample suppression/tiers, cohort statistics, effect direction, metadata, and safe association copy.
- Sequentially idempotent persistence for correlation_engine_v1_0.

#### 11. Non-goals

- Regression, correlation coefficients, p-values, significance, multiple-testing correction, causality, recommendations, charts, endpoints, background schedules, or generalized research tooling.

#### 12. Contracts and ownership

- packages/scoring owns pure types and computation.
- workers owns user-scoped loading, orchestration, and persistence.
- The logical persisted key includes algorithm version.
- The result contract is deterministic: identical ordered inputs and definition produce identical output.
- Source repositories must require userId at construction or every method boundary and include it in every query.

#### 13. Privacy and security

- Load one authenticated/scheduled user at a time.
- Do not log values, tag text, summaries, or row-level source data.
- Bounded logs may include user-safe job IDs, definition codes, counts, duration, and bounded error codes.
- Free-form custom-tag text must not enter a generated summary; use an existing safe display label only where already authorized, otherwise persist the tag ID/code.

#### 14. Acceptance-criteria traceability

| Criterion                       | Evidence                                                 |
| ------------------------------- | -------------------------------------------------------- |
| Deterministic computation       | Pure tests with reordered equivalent input               |
| Spec sample thresholds          | Boundary tests at 5, 6, 11, 12, 24, and 25               |
| Non-causal output               | Snapshot/string tests and prohibited-language assertions |
| Correct lag/local-date behavior | Same-day, positive-lag, wake-date fixtures               |
| Missing/outlier policy          | Invalid, absent, zero-comparison, and no-target cases    |
| User isolation                  | Repository tests with two users                          |
| Idempotent persistence          | Rerun test updates one logical row                       |
| Future evidence compatibility   | Persisted metadata schema test                           |

#### 15. Test plan

- Pure tests for all sample thresholds, mean/direction, zero denominator, invalid inputs, exclusions, deterministic sorting, and each factor kind.
- Property-style invariants where practical: input order does not change output; swapping cohort means reverses direction/difference; suppressed output cannot generate a candidate.
- Repository integration tests under TEST_DATABASE_URL for isolation, logical rerun, algorithm-version separation, and metadata round-trip.
- Worker tests for no-data, partial factor availability, eligible result, candidate emission, and repository error handling.

#### 16. Exact verification commands

    pnpm --filter @primis/scoring typecheck
    pnpm --filter @primis/scoring test
    pnpm --filter @primis/workers typecheck
    pnpm --filter @primis/workers test
    TEST_DATABASE_URL=postgresql://primis:primis@localhost:5432/primis_test pnpm --filter @primis/workers test
    pnpm lint
    pnpm format:check

#### 17. Actual CI and PR checks

Required GitHub CI checks are lint, typecheck, test, and format on Ubuntu with Node 20 and a frozen pnpm lockfile. Database integration evidence must be attached to the PR because CI may skip it without TEST_DATABASE_URL. The PR description must state that correlation confidence represents sample sufficiency, not statistical certainty.

#### 18. Common pitfalls

- Treating absent logs as proven absence.
- Inventing effect thresholds or outlier rules.
- Writing p-values or correlation_value despite not computing them.
- Using UTC date reconstruction instead of stored local dates.
- Creating duplicate rows on rerun.
- Adding unbounded custom-tag combinations.
- Letting generated prose imply causality.

#### 19. Blocking conditions and ADR triggers

Stop if the source tables cannot express the approved factor/outcome dates, a persisted public contract requires statistical meaning beyond mean difference, concurrent uniqueness is mandatory for launch, or a new schema column/constraint is needed. Regression, automated exploration, imputation, new confidence semantics, or causal language requires an ADR.

#### 20. Downstream artifacts produced

- Stable pure correlation types and engine.
- Worker source/persistence/orchestration contracts.
- correlation_engine_v1_0 metadata convention.
- Tests and fixtures future insight/evidence work can consume.

#### 21. Recommended commit message

    feat(scoring): add deterministic correlation skeleton

### CU-095 — FoodData Central Schema and Import Scaffold

#### 1. Title and goal

Activate the existing food catalog schema for safe search and build a restartable, streaming, provenance-preserving local CSV importer for FDC Foundation and Branded datasets.

#### 2. Why this CU exists

Food tables exist but lack the planned search index and operational importer. CU-096 depends on a single normalization, provenance, fixture, and indexing convention.

#### 3. Preconditions

- CU-094 is merged into the Phase K branch and its gates pass.
- A local PostgreSQL test database can apply migrations 000001–000009.
- The exact current USDA CSV schemas are rechecked against primary documentation.
- The candidate CSV package passes license, maintenance, security, and Node compatibility review.

#### 4. Required reading

- This plan: §§3–8, 10, 12/CU-095, 13–18.
- Implementation Specification CU-095 and Phase Z.
- MVP Specification §§3.4 and 20/M14.
- TAD §§10.1–10.4, 20, 22.3, 27, and 34.
- Data Model §§10, 16–17, 21–22, and 27–28.
- PRD §§6.3–6.4, 10.11–10.12, 17, and 23.7.
- ADR-003 and ADR-008.
- USDA download page, data dictionary, and FAQ linked in §10.4.
- [E] migration 000005 food tables, API DB food types, nutrition repository, root script conventions, seed conventions, and adjacent operational scripts.
- Prior same-phase artifacts: CU-094 only for branch presence; no code dependency.

#### 5. Existing implementation to reuse

- food_catalog_sources, food_items, food_nutrient_values, their unique keys, enums, and metadata.
- Kysely configuration and migration runner.
- Root tsx/TypeScript tooling if compatible.
- Existing nutrient and serving unit vocabulary; do not create a competing macro registry.

#### 6. Files to create

- [A] database/migrations/000009_food_catalog_search.sql
- [P] scripts/fooddata-central/config.ts
- [P] scripts/fooddata-central/types.ts
- [P] scripts/fooddata-central/parseCsv.ts
- [P] scripts/fooddata-central/normalizeFood.ts
- [P] scripts/fooddata-central/import.ts
- [P] scripts/fooddata-central/README.md
- [P] scripts/fooddata-central/test/normalizeFood.test.ts
- [P] scripts/fooddata-central/test/import.test.ts
- [P] database/fixtures/fooddata_central/synthetic/foundation.csv
- [P] database/fixtures/fooddata_central/synthetic/branded.csv
- [P] database/fixtures/fooddata_central/synthetic/README.md

#### 7. Files to modify

- [E] package.json to add fdc:import and the selected parser dependency.
- [E] pnpm-lock.yaml.
- The minimal shared nutrient/type export needed to avoid duplicated canonical nutrient codes.
- Test workspace configuration only if the new script test location is not already discovered; prefer the existing workspace convention.

#### 8. Files explicitly not to modify

- migrations 000001 through 000008
- nutrition entry/summary aggregation
- API search/routes, mobile screens, provider ingestion, or AI code
- source documents and accepted ADRs
- real USDA archives or datasets

#### 9. Implementation sequence

1. Re-verify current Foundation/Branded CSV field names and nutrient identifiers.
2. Add migration 000009 with an idempotent GIN search-vector index and safe source-row seeds.
3. Define import CLI/config validation, approved nutrient map, source metadata, and bounded error codes.
4. Add csv-parse streaming dependency and parser.
5. Normalize each dataset shape into one internal FoodImportRecord.
6. Implement bounded transactional upsert of food plus nutrient replacement and explicit search_vector maintenance.
7. Implement dry-run, safe report, stale-candidate count, interruption-safe rerun, and synthetic fixtures.
8. Test reruns, malformed rows, quoting, missing optionals, duplicate IDs, dry-run, and rollback boundaries.
9. Run migration and importer verification against a disposable local database.

#### 10. In scope

- Foundation and Branded local CSV files.
- Stable FDC IDs, name/brand/category/type, serving fields, approved nutrients, provenance, search vector, source version, and safe reports.
- Rerunnable upsert and dry run.
- A small schema/index migration.

#### 11. Non-goals

- Download automation, JSON input, SR Legacy/FNDDS/full-database import, deletion of absent foods, scheduled refresh, public artifact hosting, barcode indexing, nutrition estimation, or production data import in this PR.

#### 12. Contracts and ownership

- scripts/fooddata-central owns parsing and normalization.
- The database owns uniqueness through source_code plus external_food_id.
- Importer writes only fdc-owned global rows and their nutrients.
- user_private is reserved for CU-096; importer must never mutate those rows.
- search_vector uses one documented simple-text expression across import and user-food writes.

#### 13. Privacy and security

- Dataset inputs are public S0, but file paths and raw malformed rows are not logged.
- Reject unexpected dataset values and unsafe chunk sizes.
- Use parameterized database writes. Raw SQL is limited to Kysely SQL expressions approved by ADR-003.
- Do not follow URLs or perform network requests from CSV content.
- Never commit a real dataset, local database dump, or environment file.

#### 14. Acceptance-criteria traceability

| Criterion                        | Evidence                                                        |
| -------------------------------- | --------------------------------------------------------------- |
| Existing schema activated safely | Migration-up/down policy review and index/source-row assertions |
| Memory-bounded import            | Streaming parser test and no whole-file read                    |
| Both initial datasets            | Foundation and Branded fixture tests                            |
| Provenance preserved             | Item/source metadata round-trip                                 |
| Idempotent rerun                 | Same fixture twice yields same row counts/no duplicates         |
| Dry-run safety                   | Zero writes assertion                                           |
| Bounded failure behavior         | Malformed-row and chunk rollback tests                          |
| No large data committed          | repository size/file-extension checks                           |

#### 15. Test plan

- Parser tests for quoted delimiters/newlines, headers, blank values, encoding errors, and stream failure.
- Normalizer tests for both dataset kinds, canonical units, nutrient allowlist, invalid FDC IDs, and search text.
- Database tests for migration, source seeds, upsert, nutrient replacement, search vector, rerun, dry run, chunk rollback, and no user_private mutation.
- A test-sized fixture only; do not benchmark by checking a production archive into the repository.

#### 16. Exact verification commands

    pnpm install --frozen-lockfile
    pnpm db:migrate
    pnpm test
    pnpm typecheck
    pnpm fdc:import -- --input database/fixtures/fooddata_central/synthetic/foundation.csv --dataset foundation --release synthetic-v1 --dry-run
    pnpm fdc:import -- --input database/fixtures/fooddata_central/synthetic/branded.csv --dataset branded --release synthetic-v1 --dry-run
    pnpm lint
    pnpm format:check
    find database/fixtures/fooddata_central -type f -size +1M -print

The final find command must return no paths.

#### 17. Actual CI and PR checks

Ubuntu CI must pass frozen install, lint, typecheck, test, and format. Attach local PostgreSQL migration/import test output to the PR. Call out the new dependency and migration explicitly. Do not claim a full FDC import was tested unless an operator separately ran it outside Git.

#### 18. Common pitfalls

- Assuming the food tables do not exist.
- Editing 000005 instead of adding 000009.
- Reading a multi-gigabyte CSV into memory.
- Writing a hand-rolled CSV parser.
- Confusing FDC dataset type with source_code.
- Dropping old foods because they are absent from one file.
- Logging source rows on validation failure.
- Updating food without replacing stale nutrient rows atomically.
- Committing a real USDA archive.

#### 19. Blocking conditions and ADR triggers

Stop if the current USDA CSV cannot be mapped without new persisted columns, the GIN/index plan conflicts with deployed PostgreSQL, data licensing/use terms have materially changed, or safe rerun requires a durable checkpoint table. Destructive replacement, additional datasets, or a new source/provenance model requires an ADR or product decision.

#### 20. Downstream artifacts produced

- Migration 000009.
- Canonical FDC normalization/provenance/search-vector convention.
- Streaming importer CLI and safe report.
- Synthetic fixtures CU-096 must reuse.

#### 21. Recommended commit message

    feat(nutrition): add FoodData Central import scaffold

### CU-096 — Food Search and Private User-Food CRUD

#### 1. Title and goal

Add authenticated, ownership-safe food search and private user-food create/read/update/delete contracts and routes, reusing CU-095's source and search-vector conventions.

#### 2. Why this CU exists

Nutrition entry flows need a discoverable catalog and a safe path for foods absent from the global catalog. Existing nutrition repositories intentionally leave catalog behavior to Phase K.

#### 3. Preconditions

- CU-095 is present, migration 000009 applies, and synthetic importer fixtures pass.
- API auth, envelope, validation, error, pagination, and DI conventions are confirmed.
- Current food DB types match the applied schema.

#### 4. Required reading

- This plan: §§3–8, 10, 12/CU-095–CU-096, and 13–18.
- Implementation Specification CU-096.
- MVP Specification §§3.4 and 20/M14.
- TAD §§9.2–9.4, 10.1–10.4, 20, and 27.
- Data Model §§10, 16–17, 21–22, and 27–28.
- UI/UX §§11.7–11.10, 12.5, 16–17, and 20.6.
- PRD §§6.3–6.4, 10.11–10.12, 17, and 23.7.
- ADR-003, ADR-006, and ADR-008.
- [E] shared API contracts, pagination, envelope/errors, auth middleware, nutritionRepository, route composition, and API tests.
- Prior same-phase artifacts: CU-095 migration, source codes, search-vector expression, fixtures, and importer normalization contract.

#### 5. Existing implementation to reuse

- Existing food tables and typed columns.
- Shared Zod/pagination/response contracts.
- API authenticated-user derivation and DI.
- CU-095 source rows, search vector, and synthetic fixture data.

#### 6. Files to create

- [P] packages/api-contracts/src/foods.ts
- [P] packages/api-contracts/test/foods.test.ts
- [P] services/api/src/repositories/foodRepository.ts
- [P] services/api/src/routes/foods.ts
- [P] services/api/test/repositories/foodRepository.test.ts
- [P] services/api/test/routes/foods.test.ts

#### 7. Files to modify

- [E] packages/api-contracts/src/index.ts
- [E] services/api/src/app.ts or the actual route composer
- [E] services/api/src/db/types.ts only if migration 000009 adds a typed surface
- Existing API dependency container/test factory as needed.

#### 8. Files explicitly not to modify

- CU-095 importer normalization or fixtures except a demonstrated defect fixed in its own clearly explained hunk
- migrations 000001–000009
- nutrition aggregation/write paths
- mobile UI, AI, workers, or HealthKit code
- accepted ADRs and source documents

#### 9. Implementation sequence

1. Freeze request/response schemas and public error codes.
2. Implement repository search with explicit scope, ownership predicates, visibility predicates, ranking, and bounded offset pagination.
3. Implement user-food repository mutations with ownership in every WHERE clause and consistent search-vector maintenance.
4. Add authenticated routes and DI wiring.
5. Add contract, repository integration, and route tests including two-user isolation.
6. Verify query plans on representative synthetic rows and confirm the GIN index is usable for full-text cases.

#### 10. In scope

- GET /api/v1/foods with q, scope, source, dataType, page, and pageSize.
- POST /api/v1/foods/user.
- GET /api/v1/foods/user/:id.
- PATCH /api/v1/foods/user/:id.
- DELETE /api/v1/foods/user/:id as an ownership-scoped transition to hidden.
- Global and current-user results in one stable response shape.

#### 11. Non-goals

- Anonymous search, public user foods, sharing/moderation, bulk CRUD, barcode scan, typo tolerance, semantic search, favorites, automatic deduplication, or nutrition-entry creation.

#### 12. Contracts and ownership

- q is trimmed, 2–100 characters.
- page defaults to 1; pageSize defaults to 20 and is at most 50.
- scope is all, global, or mine.
- Search ordering is normalized exact name, normalized prefix, full-text rank, normalized brand, normalized name, then ID.
- all returns global visible FDC rows plus the caller's private rows; it never returns another user's row.
- Response identifies kind, sourceCode, dataType, verifiedStatus, isVerified, visibility, provenance, serving, and macro fields.
- User-created rows always receive server-owned source_code user_private, owner_user_id from auth, verified_status unverified, and visibility private.
- IDs, ownership, verification, source, and search_vector are not client-writable.

#### 13. Privacy and security

- Authentication is required for every route.
- Return not-found for inaccessible user-food IDs to avoid ownership disclosure.
- Escape/parameterize all search input; use raw SQL only for fixed ranking expressions.
- Cap query and page sizes.
- Do not include internal metadata wholesale; map an explicit provenance view.
- Delete is idempotent and never affects global rows.

#### 14. Acceptance-criteria traceability

| Criterion                   | Evidence                                                     |
| --------------------------- | ------------------------------------------------------------ |
| Useful deterministic search | Ranking and tie-break tests                                  |
| Ownership isolation         | Two-user search/read/update/delete tests                     |
| Visibility semantics        | all/global/mine and hidden-row tests                         |
| Provenance exposure         | Contract/route response assertions                           |
| Safe private CRUD           | Server-owned-field and not-found tests                       |
| Pagination bounds           | Contract boundary and stable-page tests                      |
| CU-095 convention reuse     | Search-vector/ranking integration test using CU-095 fixtures |

#### 15. Test plan

- Contract boundary tests for query, enums, page, macros, serving fields, and patch optionality.
- Repository integration tests for exact/prefix/full-text order, ties, filters, hidden rows, global/user mix, duplicate names, and user isolation.
- Route tests for auth, validation envelope, create/read/patch/delete, spoofed fields, inaccessible IDs, and idempotent deletion.
- Explain/query-plan inspection in local PostgreSQL for the full-text branch; document observations rather than snapshotting volatile plans.

#### 16. Exact verification commands

    pnpm --filter @primis/api-contracts typecheck
    pnpm --filter @primis/api-contracts test
    pnpm --filter @primis/api typecheck
    pnpm --filter @primis/api test
    TEST_DATABASE_URL=postgresql://primis:primis@localhost:5432/primis_test pnpm --filter @primis/api test
    pnpm lint
    pnpm format:check

#### 17. Actual CI and PR checks

Ubuntu CI requires frozen install, lint, typecheck, test, and format. Attach authenticated PostgreSQL integration evidence to the PR. The PR description must explicitly state the visibility matrix and soft-delete behavior.

#### 18. Common pitfalls

- Omitting owner_user_id from one query or mutation.
- Letting all mean every user's private rows.
- Returning hidden rows.
- Letting clients set verification, owner, source, or search vector.
- Unstable pagination tie breaks.
- Using application-side filtering after fetching cross-user rows.
- Diverging from CU-095 search normalization.
- Hard-deleting an FDC row.

#### 19. Blocking conditions and ADR triggers

Stop if the approved client requires cursor pagination now, the existing schema cannot represent private/hidden behavior safely, or search performance requires a new ranking/index design beyond 000009. Public user foods, deduplication/merge, fuzzy search, or hard-delete semantics need product/ADR review.

#### 20. Downstream artifacts produced

- Stable food API contracts and routes.
- Ownership-safe catalog repository.
- Search/visibility/ranking semantics for future UI.
- Private user-food lifecycle.

#### 21. Recommended commit message

    feat(api): add food search and private food CRUD

### CU-097 — iOS HealthKit Adapter Foundation

#### 1. Title and goal

Add a default-off, iOS-only HealthKit capability and authorization boundary with shared canonical read codes, a deterministic fake, platform-safe imports, and explicit-user-action permission scaffolding.

#### 2. Why this CU exists

The current provider connector model is server/OAuth-oriented. HealthKit is a local iOS data source requiring native permissions, privacy-aware authorization states, and a development-client build.

#### 3. Preconditions

- CU-096 is merged and phase gates pass.
- The exact native package compatibility gate in §11.3 passes.
- A macOS/Xcode environment and iOS development-client signing path are available.
- The implementer confirms current Expo config-plugin and environment conventions.

#### 4. Required reading

- This plan: §§3–8, 11, 12/CU-097, and 13–18.
- Implementation Specification CU-097 and Phase Z.
- MVP Specification §§3.2 and 21/M15.
- TAD §§3.2, 3.4, 7.3, 8.3, 11.5, 12, 14, 21.3–21.4, 32, and 34.
- Data Model §§3.2, 3.4, 5, 25.3–25.5, and 27.
- UI/UX §§3.6, 6.6, 7.3, 13, and 20.6.
- PRD §§7.3, 7.5, 12.3–12.4, 17, 23.5, and 23.8.
- ADR-001 and provider availability decision.
- Apple and Expo primary references in §11.3; selected package README/releases/peer requirements.
- [E] apps/mobile/app.config.ts, eas.json, environment parser/tests, settings/provider UI, Expo development-client configuration, core metric/provider types.
- Prior same-phase artifacts: CU-094–CU-096 must be present on the branch; no direct code reuse.

#### 5. Existing implementation to reuse

- healthkit provider code and provider-capability vocabulary where semantically valid.
- Existing Expo development-client and config-plugin pipeline.
- Existing environment parsing/default patterns and mobile test fakes.
- Shared metric codes; do not define Apple identifiers as canonical server metrics.

#### 6. Files to create

- [P] packages/core-types/src/localHealth.ts
- [P] packages/core-types/test/localHealth.test.ts
- [P] apps/mobile/src/providers/healthkit/types.ts
- [P] apps/mobile/src/providers/healthkit/HealthKitAdapter.ts
- [P] apps/mobile/src/providers/healthkit/healthkit.ios.ts
- [P] apps/mobile/src/providers/healthkit/healthkit.android.ts
- [P] apps/mobile/src/providers/healthkit/FakeHealthKitAdapter.ts
- [P] apps/mobile/src/providers/healthkit/index.ts
- [P] apps/mobile/src/providers/healthkit/**tests**/HealthKitAdapter.test.ts

Use the repository's established platform-filename and test layout if different.

#### 7. Files to modify

- [E] packages/core-types/src/index.ts
- [E] apps/mobile/package.json
- [E] pnpm-lock.yaml
- [E] apps/mobile/app.config.ts
- [E] apps/mobile/src/config/env.ts and its tests
- [E] .env.example
- The smallest settings/provider connection surface needed to expose an explicit, flag-gated action and capability status.

#### 8. Files explicitly not to modify

- API, workers, database migrations, normalized writer, provider precedence, nutrition, correlation, or AI code
- Android native configuration except what Expo deterministically regenerates from a cross-platform config; no Android health permission/module
- accepted ADRs and source documents

#### 9. Implementation sequence

1. Complete and record the native-library compatibility gate.
2. Add canonical local-health read codes and capability/auth-state types to core-types.
3. Add exact pinned native dependencies and the minimal Expo config plugin/Info.plist read-purpose configuration.
4. Add optional EXPO_PUBLIC_HEALTHKIT_ENABLED with default false.
5. Implement interface, fake, unavailable Android adapter, and iOS adapter in that order.
6. Map only the approved Apple read identifiers in the iOS file.
7. Add an explicit flag-gated user action/status scaffold; prove no startup prompt.
8. Run JS/type/config tests, clean iOS native generation/build, Android resolution check, and development-client rebuild.

#### 10. In scope

- Availability check.
- Explicit permission request for the approved v1 read allowlist.
- Privacy-correct capability/auth states.
- Typed read-method scaffolds and identifier maps.
- Fake adapter and platform separation.
- Minimal settings status/action, if the existing UI has the correct extension point.

#### 11. Non-goals

- Health writes, clinical data, nutrition, background delivery, observer queries, anchors, uploads, server routes, Hume replacement, Android Health Connect, production synchronization, or real-data acceptance.

#### 12. Contracts and ownership

- core-types owns canonical LocalHealthReadType/capability codes.
- Mobile owns Apple identifier mapping and native adapter behavior.
- No server package imports apps/mobile.
- The only .ios module imports @kingstinct/react-native-healthkit.
- Permission methods are never called implicitly.
- All adapter results are typed, bounded, and distinguish unavailable/error from limited_or_no_data.

#### 13. Privacy and security

- Request least privilege and read-only access.
- Use truthful, product-approved purpose wording.
- Do not log sample values, permission payloads, or HealthKit errors containing data.
- Treat no returned data as ambiguous, not proof of denial.
- Keep the flag off by default in every environment.
- No health data leaves the device in this CU.

#### 14. Acceptance-criteria traceability

| Criterion                  | Evidence                                                       |
| -------------------------- | -------------------------------------------------------------- |
| No startup prompt          | Mount/import test with request spy                             |
| Default-off behavior       | Env/config and UI tests                                        |
| Android/CI safety          | Android entry resolution test and Ubuntu-compatible unit suite |
| Minimal read scope         | Identifier-map snapshot/assertions                             |
| Correct read-auth language | State-machine and UI-copy tests                                |
| Deterministic development  | Fake adapter tests                                             |
| Native compatibility       | Clean iOS build/config evidence                                |

#### 15. Test plan

- core-types allowlist uniqueness and mapping tests.
- Fake/unavailable adapter tests for every capability state and stable sample output.
- iOS wrapper tests with the native library mocked, including unavailable device, request success/failure, limited/no data, and error sanitization.
- UI/config tests proving flag false hides/disables action and permission is only requested on explicit press.
- Module-resolution test proving Android does not import the iOS native package.
- Native build smoke test on macOS; real authorization/data behavior moves to Phase Z.

#### 16. Exact verification commands

    pnpm --filter @primis/core-types typecheck
    pnpm --filter @primis/core-types test
    pnpm --filter @primis/mobile typecheck
    pnpm --filter @primis/mobile test
    pnpm --filter @primis/mobile exec expo config --type public --json >/dev/null
    pnpm --filter @primis/mobile ios
    pnpm lint
    pnpm format:check

On a configured Android host, also run:

    pnpm --filter @primis/mobile android

The iOS command requires a configured macOS/Xcode host and is mandatory PR evidence even though Ubuntu CI cannot run it.

#### 17. Actual CI and PR checks

Ubuntu CI must pass frozen install, lint, typecheck, test, and format without loading the native iOS implementation. The PR additionally requires Expo public-config output, a clean macOS iOS build, exact dependency/version/license notes, generated Info.plist inspection, and confirmation that a new development client was built.

#### 18. Common pitfalls

- Importing the native package from a generic index evaluated on Android/Node.
- Prompting on startup.
- Calling HKAuthorizationStatus a read-permission result.
- Requesting broad types “for later.”
- Adding write-purpose text or entitlements without write scope.
- Testing only Expo Go.
- Silently swapping libraries after a compatibility failure.
- Treating simulator behavior as physical-device validation.

#### 19. Blocking conditions and ADR triggers

Stop if the candidate package fails Expo/RN/New Architecture/Xcode compatibility, requires write permissions, cannot isolate Android imports, has unacceptable license/security status, or cannot build in a development client. A library substitution, broader read scope, background delivery, or provider-precedence change requires explicit architecture/product approval.

#### 20. Downstream artifacts produced

- Canonical local-health read capability vocabulary.
- iOS native adapter boundary and Apple mapping.
- Android-safe unavailable implementation.
- Deterministic fake and feature flag.
- Native compatibility evidence needed by CU-098 and Phase Z.

#### 21. Recommended commit message

    feat(mobile): add feature-gated HealthKit adapter

### CU-098 — Authenticated Local Health Upload

#### 1. Title and goal

Add a server-authoritative HealthKit connection/consent enable path and a bounded, retry-safe local-health upload endpoint that maps validated records to the existing normalized ingestion writer.

#### 2. Why this CU exists

CU-097 can acquire local data but deliberately does not transmit it. A safe server boundary must authenticate ownership, enforce consent, prevent provider spoofing, preserve idempotency, and avoid a second ingestion pipeline.

#### 3. Preconditions

- CU-097 shared codes and adapter contract are present.
- Phase E normalized writer behavior and exports are verified.
- healthkit provider seed/code, consent_records, provider_connections, and provider_sync_jobs are present.
- Database integration tests can run with TEST_DATABASE_URL.
- The exact API route-composition and auth/consent repositories are confirmed.

#### 4. Required reading

- This plan: §§3–8, 11, 12/CU-097–CU-098, and 13–18.
- Implementation Specification CU-098 and Phase Z.
- MVP Specification §§3.2 and 21/M15.
- TAD §§3.2, 3.4, 7.3, 8.3, 11.5, 12, 14, 21.3–21.4, 27, and 32.
- Data Model §§3.2, 3.4, 5, 7.6, 8.1–8.4, 9.2, 25.3–25.5, and 27.
- Scoring Specification §§21 and 30–33 for downstream recomputation boundaries.
- PRD §§7.3, 7.5, 12.3–12.4, 17, 23.5, and 23.8.
- ADR-001, ADR-003, ADR-008, and provider availability decision.
- [E] NormalizedRecord, normalized writer, provider/consent/connection repositories and routes, auth middleware, API envelopes, provider_sync_jobs schema, metric registry, and provider availability logic.
- Prior same-phase artifacts: CU-097 canonical local-health types and allowlist. Verify all earlier CU artifacts are present even when not directly imported.

#### 5. Existing implementation to reuse

- Existing authentication and user context.
- healthkit provider code and tokenless provider connections.
- Consent append/history conventions and existing provider list/disconnect behavior.
- provider_sync_jobs as the batch ledger.
- NormalizedRecord and writeNormalizedRecords as the sole ingestion path.
- Existing source-ID uniqueness, scoring port, affected-date reporting, and availability update.

#### 6. Files to create

- [P] packages/api-contracts/src/localHealthUpload.ts
- [P] packages/api-contracts/test/localHealthUpload.test.ts
- [P] services/api/src/services/localHealthUploadService.ts
- [P] services/api/src/routes/healthkit.ts
- [P] services/api/test/services/localHealthUploadService.test.ts
- [P] services/api/test/routes/healthkit.test.ts

Add a dedicated repository only if existing provider/sync-job repositories cannot preserve ownership and transaction boundaries cleanly:

- [P] services/api/src/repositories/localHealthUploadRepository.ts
- [P] services/api/test/repositories/localHealthUploadRepository.test.ts

#### 7. Files to modify

- [E] packages/api-contracts/src/index.ts
- [E] services/api/src/app.ts or actual route composer
- Existing API dependency container/test factory.
- [E] services/workers/src/index.ts only to export the already-canonical writer/types if not public.
- Existing provider/consent repository with narrowly scoped methods where that is the established ownership boundary.

#### 8. Files explicitly not to modify

- migrations 000001 through 000009
- NormalizedRecord shapes or writer semantics unless an actual incompatibility is escalated
- mobile native adapter, Apple identifier mappings, correlation, food, AI, dashboard, or nutrition aggregation code
- provider precedence or canonical provider codes
- accepted ADRs and product source documents

#### 9. Implementation sequence

1. Freeze shared upload wire schemas, limits, response summary, and bounded error codes.
2. Define exhaustive mapping from CU-097 canonical read codes/wire variants to existing normalized record variants and metric registry codes.
3. Add enable/reactivate service and route with latest-consent append plus tokenless connection creation/reactivation in a transaction.
4. Add user-scoped active-connection and current-consent checks.
5. Implement batch reservation/replay against provider_sync_jobs using batchId as id.
6. Map records and invoke writeNormalizedRecords sequentially without wrapping the whole batch in one transaction.
7. Persist a safe completed/partial/failed summary in job metadata and return it.
8. Add contract, ownership, consent, idempotency, partial-success, and no-raw-log tests.
9. Run database integration and phase-wide gates.

#### 10. In scope

- POST /api/v1/me/providers/healthkit to grant the submitted consent version and create/reactivate a tokenless connection.
- POST /api/v1/me/providers/healthkit/uploads.
- Batch size 1–100.
- Canonical metric observations, time-series samples, sleep/stages, and workout sessions supported by both the CU-097 allowlist and NormalizedRecord.
- Replay-safe response with batchId, status, acceptedCount, rejectedCount, affectedDates, and errors containing index plus bounded code.

#### 11. Non-goals

- Apple identifiers in the wire contract, arbitrary provider upload, background sync, anchor persistence, scheduled pulls, new ingestion tables, whole-batch atomicity, scoring in the route, raw payload storage, Android upload, or automatic recommendations.

#### 12. Contracts and ownership

- Request: batchId UUID and records array only, plus record-specific canonical data and sourceRecordId.
- No request field may grant authority over user, provider, connection, consent, verification, or source priority.
- Provider is always canonical healthkit.
- Every top-level record and nested sleep stage requires a non-empty stable sourceRecordId.
- Latest consent must be granted; connection must be active, non-deleted, healthkit, and owned by the caller.
- Duplicate batchId for the same user/connection returns the stored safe summary when complete/partial/failed; a still-running batch returns a bounded in-progress conflict/retry response.
- Duplicate batchId owned by anyone else returns conflict without revealing ownership.
- Each record commits through the existing writer. Validation/mapping errors are indexed and do not block valid sibling records.
- Cap returned errors and affected dates; counts still represent the entire batch.

#### 13. Privacy and security

- Authentication is mandatory.
- User/provider/connection authority is injected server-side.
- Validate exact objects and reject unknown/spoofed fields.
- Enforce body and batch bounds at the HTTP/contract layer.
- Never log request bodies, values, source IDs, HealthKit errors, or raw writer errors.
- Store only counts, bounded error codes, affected dates, algorithm/contract version, and completion status in job metadata.
- Error responses do not reveal whether another user owns a colliding batch/connection.
- Consent/connection enable is transactional and records the accepted consent version.

#### 14. Acceptance-criteria traceability

| Criterion                        | Evidence                                             |
| -------------------------------- | ---------------------------------------------------- |
| Server-authoritative scope       | Spoof/unknown-field and two-user tests               |
| Consent and connection required  | Missing/revoked/deleted/wrong-provider tests         |
| Existing ingestion reused        | Service mock/spy and DB integration assertions       |
| Idempotent retry                 | Same-owner replay and cross-owner collision tests    |
| Partial success                  | Mixed valid/invalid/duplicate record tests           |
| Stable source identity           | Missing/empty/nested-stage source ID tests           |
| No sensitive persistence/logging | Job metadata and logger-spy assertions               |
| Bounded operation                | 0, 1, 100, 101 and response-cap tests                |
| No route scoring                 | Dependency assertion and affected-date behavior test |

#### 15. Test plan

- Contract tests for every record variant, exact-object rejection, batch limits, units, dates, source IDs, and unknown metric codes.
- Route tests for unauthenticated, enable/reactivate, consent version, missing/revoked consent, connection state, and envelopes.
- Service/repository integration tests for ownership, job reservation, in-progress replay, completed replay, cross-user collision, partial writes, safe metadata, and writer failures.
- End-to-end API/database test proving normalized domain rows and provider availability are written once on retry.
- Logger-spy tests proving raw values/source IDs/messages are absent.
- Existing workers normalization tests remain green.

#### 16. Exact verification commands

    pnpm --filter @primis/core-types typecheck
    pnpm --filter @primis/api-contracts typecheck
    pnpm --filter @primis/api-contracts test
    pnpm --filter @primis/workers typecheck
    pnpm --filter @primis/workers test
    pnpm --filter @primis/api typecheck
    pnpm --filter @primis/api test
    TEST_DATABASE_URL=postgresql://primis:primis@localhost:5432/primis_test pnpm --filter @primis/api test
    pnpm lint
    pnpm format:check

#### 17. Actual CI and PR checks

Ubuntu CI must pass frozen install, lint, typecheck, test, and format. The PR additionally requires local PostgreSQL integration output and an explicit statement that the endpoint reuses writeNormalizedRecords, derives authority server-side, stores no raw HealthKit values in provider_sync_jobs, and does not change provider precedence.

#### 18. Common pitfalls

- Accepting userId/providerCode/connectionId in the body.
- Treating a batch UUID collision as a valid replay without checking owner and connection.
- Allowing upload after consent revocation or connection deletion.
- Creating a second writer or computing summaries in the route.
- Requiring source IDs only on parents but not stages.
- Wrapping the entire partial batch in one transaction.
- Persisting raw validation/writer messages in metadata.
- Returning unbounded errors or dates.
- Conflating duplicate source-record skips with rejected validation.

#### 19. Blocking conditions and ADR triggers

Stop if provider_sync_jobs cannot encode safe ownership/replay semantics, the existing normalized writer cannot accept an approved CU-097 type, the current consent model cannot establish latest granted consent, or a new migration appears necessary. A new batch table, alternate writer, arbitrary provider upload, provider-precedence change, background sync, or raw-payload retention requires an ADR and privacy review.

#### 20. Downstream artifacts produced

- Shared local-health upload wire contract.
- Transactional HealthKit consent/connection enable path.
- Authenticated, bounded upload route and safe batch-replay semantics.
- Proven mapping into the existing normalized ingestion pipeline.
- Phase Z integration-test entry point.

#### 21. Recommended commit message

    feat(api): add authenticated HealthKit upload path

## 13. Phase-Wide Verification and PR Readiness

### 13.1 Required automated gates

After every CU, run its focused commands. Before Phase K is declared complete, run:

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm format:check
    docker compose config --quiet
    pnpm db:migrate
    pnpm db:seed
    pnpm --filter @primis/mobile exec expo config --type public --json >/dev/null

Run database-backed suites with a disposable database:

    TEST_DATABASE_URL=postgresql://primis:primis@localhost:5432/primis_test pnpm --filter @primis/api test
    TEST_DATABASE_URL=postgresql://primis:primis@localhost:5432/primis_test pnpm --filter @primis/workers test

Do not use the root pnpm build script as evidence; it is currently a placeholder.

### 13.2 Native and platform gates

On a configured macOS/Xcode host after CU-097:

    pnpm --filter @primis/mobile ios

On a configured Android host:

    pnpm --filter @primis/mobile android

Confirm that:

- the iOS development client was rebuilt after the native dependency/config change;
- generated entitlements and Info.plist contain only the approved HealthKit scope and wording;
- Android and Node tests do not resolve the iOS native implementation;
- the feature flag remains false by default;
- no permission prompt occurs at startup.

Physical iPhone, real HealthKit records, permission edge cases, and Hume reconciliation are Phase Z gates, not simulator acceptance.

### 13.3 Data and secret hygiene

    find database/fixtures/fooddata_central -type f -size +1M -print
    git status --short
    git diff --check

The fixture size command must return no paths. Review git diff --stat and git diff before every commit. Run the repository's approved secret scanner if available. At minimum, inspect new files for credentials, tokens, real health records, real user foods, database dumps, and USDA archives.

### 13.4 PR structure

- One intentionally scoped commit per CU using the recommended commit message or an equivalent Conventional Commit.
- Each PR description maps acceptance criteria to tests and names any deferred Phase Z validation.
- Migration, dependency, public-contract, permission, privacy, and feature-flag changes are called out explicitly.
- No CU is merged with skipped focused tests unless the skip is an acknowledged external Phase Z gate.
- Final Phase K review confirms that later CUs reused prior artifacts rather than recreating contracts.

### 13.5 Actual CI checks

The current GitHub workflow runs on Ubuntu with Node 20 and performs a frozen pnpm install followed by lint, typecheck, test, and format checks. Phase K must keep those checks green. Local database and iOS-native evidence supplements CI; it does not replace it.

## 14. Known Risks and Deferred Decisions

| Risk or decision                                                               | Current mitigation                                                                    | Deferred owner/gate                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Correlation results may be overinterpreted                                     | Fixed allowlist, sample suppression, native-unit effect, explicit non-causal language | Product/science review before broader exposure |
| Missing logs can resemble comparison days                                      | Persist completeness caveat and exclusion counts                                      | Future logging-completeness model              |
| Concurrent correlation reruns can race without a unique logical key            | Sequential worker execution and update-or-insert                                      | ADR/migration if concurrency is required       |
| FDC Branded CSV is very large and schema releases evolve                       | Streaming parser, explicit release, synthetic tests, implementation-time schema check | Operational import runbook/Phase Z             |
| Dataset replacement semantics are undefined                                    | Upsert present rows; report but do not delete absent rows                             | Product/ADR before destructive refresh         |
| Search quality/performance at production catalog size is unproven              | GIN index, deterministic ranking, bounded pagination                                  | Phase Z production-like benchmark              |
| User-food duplicate/merge behavior is undefined                                | Preserve distinct IDs; do not auto-merge                                              | Later product decision                         |
| Native package compatibility may change                                        | Exact-version compatibility gate and clean build                                      | CU-097 blocking gate                           |
| Apple read authorization is intentionally ambiguous                            | Privacy-correct adapter states and copy                                               | Phase Z physical-device UX                     |
| Simulator cannot validate HealthKit meaningfully                               | Fake adapter for deterministic tests                                                  | Phase Z physical iPhone                        |
| Upload retries can collide or remain in progress                               | User/connection-scoped ledger checks and bounded retry response                       | ADR if lease/recovery fields are required      |
| Provider precedence/reconciliation with Hume is not finalized for live overlap | Reuse current availability rules; do not change precedence                            | Phase Z reconciliation review                  |

## 15. Open Questions / Assumptions

### 15.1 Blocking questions resolved by this plan

- Phase K is required.
- Food base tables and correlation_results are existing artifacts, not new-table work.
- The canonical provider code is healthkit.
- Correlation v1 uses deterministic exposed-versus-comparison mean difference rather than a correlation coefficient.
- Sample confidence labels describe data sufficiency only.
- Initial FDC datasets are Foundation and Branded CSV supplied locally.
- Search is authenticated and returns global plus current-user private results according to explicit scope.
- HealthKit is iOS-only, read-only, explicit-action, and default-off.
- The server upload reuses writeNormalizedRecords and never trusts client authority fields.
- provider_sync_jobs is the first-choice upload batch ledger; no new table is planned.

### 15.2 Remaining non-blocking assumptions

- Hydration uses stored target-met versus below-target days; days without a stored target are excluded.
- No minimum correlation effect threshold or outlier trimming is introduced.
- Food pagination is page/pageSize with defaults 1/20 and maximum 50.
- User-food deletion changes visibility to hidden.
- The FDC importer uses csv-parse and explicitly maintains search_vector.
- @kingstinct/react-native-healthkit plus react-native-nitro-modules remains the preferred native stack after exact-version validation.
- The HealthKit upload batch maximum is 100 records.
- Safe upload responses cap error details and affected dates at implementation-defined, tested constants.

If implementation evidence invalidates one of these assumptions without changing a public contract or architecture boundary, document the correction in the CU PR. If it changes persisted meaning, privacy, security, public API, provider identity, or cross-CU ownership, stop for an ADR/product decision.

### 15.3 External facts requiring implementation-time or Phase Z verification

- Current USDA Foundation/Branded release names, CSV columns, nutrient identifiers, download sizes, and terms.
- Current native-library release, peer dependencies, license, security posture, Expo config-plugin behavior, and New Architecture/Xcode compatibility.
- Generated iOS entitlements, Info.plist wording, development-client build, and device availability.
- Apple permission behavior for grant, partial history, no data, and changed settings on a physical iPhone.
- Production-scale FDC import throughput, PostgreSQL search plans, database growth, and safe rerun time.
- Real HealthKit-to-Primis unit/date mapping and Hume overlap/reconciliation.

## 16. Definition of Done for Phase K

Phase K is done only when:

- CU-094 through CU-098 are merged sequentially with their acceptance evidence.
- The correlation engine is deterministic, cautious, user-scoped, persisted idempotently, and produces no causal or statistical-significance claims.
- The FDC importer is streaming, dry-runnable, rerunnable, provenance-aware, and tested with only synthetic fixtures.
- Food search and private CRUD enforce ownership and visibility in database queries.
- The HealthKit adapter is read-only, default-off, explicit-action, iOS-isolated, fakeable, and proven to build in a development client.
- The local-health upload derives authority server-side, requires current consent and an active connection, uses stable source IDs, reuses the normalized writer, and has safe retry/partial-success behavior.
- Ubuntu CI passes frozen install, lint, typecheck, tests, and formatting.
- Required local PostgreSQL and macOS native checks are recorded.
- No secrets, raw health records, real user foods, FDC archives, or database dumps enter Git.
- No source-of-truth document, accepted ADR, historical migration, provider precedence rule, or unrelated feature is changed.
- All remaining live-device, production-data, and reconciliation work is handed to Phase Z.

## 17. Reusable CU Handoff Prompt Template

Before implementing, verify that every prior Phase K artifact required by this commit unit is present in the current branch. Do not recreate, bypass, or fork a schema, contract, provider type, importer convention, or ingestion path created by an earlier commit unit.

Use this handoff for each CU:

    Implement Phase K [CU-NNN — title] only.

    Read:
    - plans/phase-k-post-mvp-expansion-stubs.md, especially §§[sections]
    - all repository AGENTS.md instructions in scope
    - the exact source sections and accepted ADRs listed in the CU
    - every prior same-phase artifact listed in the dependency ledger

    Before editing:
    1. Confirm the branch contains all prior required Phase K artifacts.
    2. Inspect the existing implementation paths named by the CU.
    3. Report any source conflict, repository drift, or ADR trigger.
    4. Confirm the CU's files-to-create, files-to-modify, and do-not-modify boundaries.

    Implement:
    - follow the CU sequence and contracts exactly;
    - preserve server-derived ownership and privacy boundaries;
    - reuse canonical types, schemas, repositories, and ingestion paths;
    - add the acceptance-criteria tests;
    - make no unrelated cleanup.

    Verify:
    - run every focused command listed by the CU;
    - run lint, typecheck, tests, and format;
    - run database/native/manual gates applicable to the CU;
    - inspect git diff, git diff --check, and git status.

    Handoff:
    - summarize changed files and behavior;
    - map acceptance criteria to passing evidence;
    - list external checks or Phase Z items;
    - identify any non-blocking assumption corrected during implementation;
    - recommend the CU commit message;
    - do not start the next CU.

## 18. Phase Z Handoff

Phase Z must validate the parts Phase K cannot prove in Ubuntu CI or synthetic fixtures:

1. Run a production-like Foundation and Branded CSV import outside Git; record peak memory, throughput, database growth, rerun behavior, stale-candidate counts, and safe failure recovery.
2. Benchmark food search on production-like volume, inspect query plans, verify stable pagination, and review result quality for exact, prefix, brand, and full-text cases.
3. Build and install the signed iOS development/release client on a supported physical iPhone.
4. Validate HealthKit availability, explicit permission flow, no/limited history, settings changes, read-type mapping, units, local dates, sleep wake-date attribution, and workout identity.
5. Validate upload interruption/retry, partial success, duplicate source IDs, consent revocation, disconnected provider, and cross-user isolation against a deployed API.
6. Compare overlapping HealthKit and Hume data without changing provider precedence; document duplicates, gaps, time-zone differences, and reconciliation recommendations.
7. Review all user-facing association and HealthKit permission language with product/privacy stakeholders.
8. Confirm observability contains only safe aggregate codes/counts and that retention/deletion behavior follows the current privacy model.
9. Decide whether production evidence requires an ADR for correlation uniqueness/statistics, FDC replacement/checkpointing, native-library changes, upload leases, or provider precedence.

Phase Z may correct verified external assumptions through the appropriate implementation or ADR path. It must not retroactively reinterpret Phase K correlation results as causal, publish private foods, broaden HealthKit permissions, or introduce an alternate ingestion path.
