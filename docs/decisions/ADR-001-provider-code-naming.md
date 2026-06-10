# ADR-001: Canonical Provider Code Naming

**Date:** 2026-06-09
**Status:** Accepted
**CU:** CU-008

---

## Context

`primis_data_model_health_metric_schema.md §8.1` defines provider codes as:
`healthkit`, `health_connect`.

`primis_full_implementation_spec_commit_plan.md` CU-008 acceptance criteria names them:
`apple_healthkit`, `android_health_connect`.

These string values will be stored in `provider_connections.provider_code` database rows,
`metric_observations.source_provider` columns, and API response bodies. Changing them after
data exists requires a migration.

Additionally, `plans/phase-b-shared-contracts-health-model-foundations.md` Phase B plan
documents explicitly document the discrepancy at §9 B-Q-001 and resolve it in favour of the
Data Model values.

## Decision

Use the **Data Model §8.1 values** as the canonical stored/typed values:

- `healthkit` (not `apple_healthkit`)
- `health_connect` (not `android_health_connect`)

The descriptive names `apple_healthkit` / `android_health_connect` appear in architecture
and planning docs as human-readable labels only. They are not stored values.

The complete canonical provider code list is:

```text
google_health
healthkit
health_connect
hume_via_healthkit
hume_direct_unverified
fooddata_central
manual
primis_internal
```

## Consequences

- All future commits referencing a provider code MUST use these exact strings.
- The implementation spec CU-008 acceptance criteria (`apple_healthkit`, `android_health_connect`)
  is superseded by this ADR for the actual TypeScript enum values.
- Future agents reading CU-008 acceptance criteria should consult this ADR first.
- The `ProviderCode` type in `@primis/core-types` is derived directly from these 8 values.
- Database migrations, API response serializers, and provider sync jobs must use these strings.
