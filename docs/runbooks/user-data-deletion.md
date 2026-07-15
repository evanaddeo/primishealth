# User Data Deletion Runbook

## Current operating boundary (CU-087)

This commit provides a deletion inventory and a **mock dry-run only** endpoint. It does not create
or persist a deletion request, change user status, revoke auth/provider credentials, enqueue work,
remove relational rows, touch the local archive, call S3, or clear a device cache.

`POST /api/v1/data/delete-all` is registered only when both conditions are true:

- `APP_ENV` is `local` or `dev`.
- `ALLOW_MOCK_AUTH` is `true`.

The route is absent in staging and production. There is no production execution flag, destructive
port, SQL mutation, S3 delete operation, queue consumer, or configuration value that can activate
deletion in CU-087; production activation is Phase Z work requiring explicit architecture review.

The mobile Privacy & Data Controls screen remains informational. It sends no request and schedules
nothing.

## Canonical migration-derived inventory

Migrations `000001` through `000008` create 56 tables. The deletion manifest classifies 52
user-owned targets; four tables are wholly global and retained: `schema_migrations`,
`provider_metric_mappings`, `metric_definitions`, and `food_catalog_sources`.

| Category             | User-owned relational targets                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity/account     | `users`, `auth_identities`                                                                                                                 |
| Preferences/consent  | `user_goals`, `coach_preferences`, `nutrition_philosophy_preferences`, `consent_records`, `data_retention_preferences`                     |
| Provider             | `provider_connections`, `provider_data_availability`, `provider_sync_jobs`, `provider_sync_cursors` through the owned connection           |
| Raw archive metadata | `raw_provider_payloads`                                                                                                                    |
| Metrics              | `metric_observations`, `metric_timeseries_samples`, `daily_metric_summaries`, `rolling_metric_baselines`                                   |
| Sleep/planning       | `sleep_sessions`, `sleep_stage_intervals`, `sleep_daily_features`, `bedtime_planner_requests`, `bedtime_recommendations`                   |
| Activity/vitals/body | `workout_sessions`, `workout_hr_zone_summaries`, `training_load_daily`, `body_composition_measurements`, `vital_daily_features`            |
| Manual/lifestyle     | `manual_checkins`, `hydration_entries`, `caffeine_entries`, `alcohol_entries`, `bowel_entries`                                             |
| Tags                 | `custom_tags`, `tag_events`                                                                                                                |
| Nutrition            | `nutrition_entries`, `nutrition_entry_items`, `daily_nutrition_summaries`                                                                  |
| Private foods        | `food_items` where `owner_user_id` is the user, plus child `food_nutrient_values`                                                          |
| Scores/insights      | `score_snapshots`, `score_component_values`, nullable-user `algorithm_runs`, `insight_candidates`, `correlation_results`, `anomaly_events` |
| AI                   | `ai_conversations`, `ai_messages`, `ai_context_snapshots`, nullable-user `ai_model_invocations`, `ai_summaries`                            |
| UI/cache             | `dashboard_widgets`, `theme_settings`, `mobile_cache_manifests`                                                                            |

Private food rows require explicit handling before a future user-row deletion: the current
`food_items.owner_user_id` foreign key uses `ON DELETE SET NULL`, which would otherwise turn a
private food into an ownerless row. `food_nutrient_values` must be handled with its owned parent.
Nullable-user `algorithm_runs` and `ai_model_invocations` are user-owned only when their `user_id`
equals the authenticated user; null rows are not claimed by this workflow.

`manual_checkins` has no `deleted_at` column in the actual migration despite older documentation.
CU-087 inventories it for future hard deletion and adds no migration.

## Raw archive ownership

The implemented local/archive key convention is:

```text
provider={provider_code}/user_id={internal_user_id}/data_type={provider_data_type}/year={yyyy}/month={mm}/day={dd}/{payload_id}.json.gz
```

The authoritative object inventory is each user-owned `raw_provider_payloads.s3_bucket` and
`raw_provider_payloads.s3_key` row, not a bucket-wide list. Dry-run worker ports may receive those
locators internally from a mock/read-only adapter, validate that each locator matches the requested
user and convention, deduplicate them, and return aggregate object/prefix counts only. Locators,
prefixes, internal IDs, hashes, provider contents, and credentials must never be returned, logged,
snapshotted, or pasted into tickets.

The local archive root is `database/fixtures/.local-dev-archive/` and is gitignored. CU-087 does not
read or remove files there. `S3RawPayloadArchive` remains a write-side Phase Z stub and no object
list/delete abstraction exists.

## Safe local/dev verification

Automated verification requires no database, network, S3, or filesystem archive access:

```bash
pnpm --filter @primis/api-contracts test
pnpm --filter @primis/api test
pnpm --filter @primis/workers test
pnpm --filter @primis/api-contracts typecheck
pnpm --filter @primis/api typecheck
pnpm --filter @primis/workers typecheck
```

To exercise the mock endpoint against a local API, use only placeholder/local environment values,
start the API with mock auth enabled, and send an opaque test key:

```bash
curl --fail-with-body \
  -X POST http://localhost:3000/api/v1/data/delete-all \
  -H 'Authorization: Bearer mock-dev-token' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-deletion-plan-test-0001' \
  --data '{"mode":"dry_run"}'
```

Expected behavior:

- HTTP 200 with `status: "not_scheduled"`, `inventorySource: "mock"`, and
  `productionExecutionEnabled: false`.
- All 14 categories are present. The default adapter reports schema target counts, null relational
  row counts, and zero archive counts because it performs no database/archive access.
- Repeating the same authenticated user and `Idempotency-Key` produces the same opaque dry-run
  reference. The reference is deterministic and non-durable; it is not a stored request or job.
- A missing/invalid key, extra body field, caller-supplied user ID, or mode other than `dry_run`
  returns a validation error without invoking the planner.
- With mock auth disabled or `APP_ENV=staging|prod`, the route is not registered.

Do not use a real user ID, archive locator, token, email, provider payload, health value, or remote
database URL while verifying this skeleton. Do not run `DELETE`, `db:reset`, `docker compose down
-v`, S3 commands, or credential-revocation commands.

## Optional local schema-only audit

If a local Postgres migration audit is desired, first confirm the connection is the disposable
Docker service. Apply migrations normally, then compare table names only; do not query user rows:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

The result should match the 56-table classification above. This check is optional for CU-087 and
must never target a remote database.

## Failure and retry behavior

Planning ports are read-only. The worker completes relational inventory reads, then validates raw
archive locators, then constructs a response; a failure returns no partial plan and emits no audit
event. The API's standard error handler suppresses raw error details, and retrying with the same key
is safe because no state was changed.

CU-088 may inject the allowlisted audit seam after its structured logging policy exists. The seam
accepts only an event name and aggregate category/target/archive counts; it has no user ID, dry-run
reference, locator, row contents, or error object.

## Phase Z production activation prerequisites

Production deletion must not be activated by editing an environment variable. Phase Z requires a
reviewed design/ADR covering, at minimum:

1. Durable deletion-request and minimal non-health audit schemas.
2. Reauthentication/confirmation, account disablement, Cognito identity deletion, session
   revocation, and provider-token revocation ownership.
3. Transaction boundaries, dependency order, retry checkpoints, idempotency, concurrency, failure
   recovery, and operator visibility.
4. Exact metadata-backed S3/local object deletion behavior and evidence that bytes are removed
   before metadata.
5. Private-food handling, nullable-user records, AI records including `ai_summaries`, and all tables
   added after migration `000008`.
6. Device-local cache wipe/sign-out signaling and honest mobile request/status UI.
7. Least-privilege production roles, retention/audit limits, privacy/legal review, and end-to-end
   tests in an isolated non-production environment.

After any future migration, the migration-derived manifest coverage test must fail until the new
table is explicitly classified as wholly global or added with a verified ownership path.
