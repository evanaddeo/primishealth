# Google Health API Spike Script

**Created:** CU-034 (scaffold), CU-040 (implementation)
**Phase:** E — Provider Validation and Sync Infrastructure

---

## Purpose

This directory contains the one-off spike script used to:

1. Prove the Google Health API data path before Primis depends on any metric.
2. Call each target data type listed in
   `docs/decisions/google-health-api-metric-availability.md` and confirm availability.
3. Save redacted JSON fixtures to `database/fixtures/provider/google_health/redacted/`
   for use in unit and integration tests.
4. Document the exact field paths, response shapes, and data freshness of each metric.
5. Confirm whether proprietary provider scores (`provider_sleep_score`,
   `provider_readiness_score`, `provider_cardio_load`) are exposed as first-class API
   objects (M1-T004).

The spike script is **not part of the production sync pipeline**. It is a developer tool
that runs manually against a test Google Health / Fitbit Air account.

---

## Modes

### Mock Mode (default — safe for CI and automated tests)

Mock mode injects pre-built synthetic fixtures instead of making real network calls. It is
the default mode and requires no credentials.

```bash
pnpm tsx scripts/google-health-spike/index.ts --mode mock
```

Mock mode:

- Uses synthetic fixtures from `scripts/google-health-spike/mockData.ts`.
- Runs the same `GoogleHealthApiClient` + `LocalRawPayloadArchive` pipeline as live mode.
- Produces a metric availability summary from the synthetic data.
- Is safe to run in CI and automated tests.
- **MUST NOT** be used to set any row in the availability matrix to
  `real_payload_validated`. See the `⚠ Preamble` in
  `docs/decisions/google-health-api-metric-availability.md`.

### Live Mode (manual only — never in CI)

Live mode calls the real Google Health API using an OAuth access token from your local
`.env` file. It is intended for Phase Z manual validation only.

```bash
# Inline env var
GOOGLE_HEALTH_TEST_ACCESS_TOKEN=<token> \
  pnpm tsx scripts/google-health-spike/index.ts --mode live

# Or set PRIMIS_SPIKE_MODE in .env, then run:
pnpm tsx scripts/google-health-spike/index.ts --mode live
```

Live mode requirements:

- A configured Google Cloud project with the Google Health API enabled.
- An OAuth consent screen in `Testing` mode with your test Fitbit Air account added as a
  test user.
- A valid access token in `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` (see below).
- A Fitbit Air device that has synced recent data to the Google Health app.

> **Live mode MUST NOT be run in CI or automated tests.** CI must never have access to
> real Google Health OAuth credentials. Live mode credentials must stay in your local
> `.env` file and must never be committed to the repository.

---

## Required Environment Variables

Copy `.env.example` to `.env` and fill in the values below for live mode. Mock mode does
not require any of these.

| Variable                           | Required for | Description                                                                                            |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `GOOGLE_HEALTH_TEST_ACCESS_TOKEN`  | live mode    | OAuth 2.0 access token for the test Fitbit Air account. Obtain via the local OAuth helper (see below). |
| `GOOGLE_HEALTH_CLIENT_ID`          | OAuth setup  | OAuth 2.0 client ID from Google Cloud Console.                                                         |
| `GOOGLE_HEALTH_CLIENT_SECRET`      | OAuth setup  | OAuth 2.0 client secret from Google Cloud Console.                                                     |
| `GOOGLE_HEALTH_TEST_REFRESH_TOKEN` | OAuth setup  | Refresh token for the test account. Used to obtain a fresh access token when the existing one expires. |
| `PRIMIS_SPIKE_MODE`                | optional     | Set to `live` or `mock` as an alternative to the `--mode` CLI arg.                                     |

> **Security reminder:** `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` and
> `GOOGLE_HEALTH_TEST_REFRESH_TOKEN` are S4-sensitivity credentials per
> `primis_data_model_health_metric_schema.md §5.4`. They must never be committed to the
> repository. Verify with `git status --short | grep '\.env'` before every commit.

---

## Live Mode Exit Behaviour

If `--mode live` is specified but `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` is missing or empty,
the script prints a clear error message to stderr and exits with code `1` **before** any
network call is attempted:

```
  ✗  google-health-spike: GOOGLE_HEALTH_TEST_ACCESS_TOKEN is missing

  Live mode requires a valid Google Health OAuth access token.
  Add it to your local .env file (never commit it) and run:

    GOOGLE_HEALTH_TEST_ACCESS_TOKEN=<token> \
      pnpm tsx scripts/google-health-spike/index.ts --mode live

  See scripts/google-health-spike/README.md for setup instructions.
```

---

## Obtaining an Access Token (Live Mode Setup)

1. Set `GOOGLE_HEALTH_CLIENT_ID` and `GOOGLE_HEALTH_CLIENT_SECRET` in your `.env`.
2. Use the Google OAuth 2.0 Playground (`https://developers.google.com/oauthplayground`) or
   a local helper script to complete the authorization flow with the required scopes.
3. Copy the resulting access token into `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` in `.env`.
4. If the token expires, use `GOOGLE_HEALTH_TEST_REFRESH_TOKEN` to obtain a new one via
   the token endpoint: `POST https://oauth2.googleapis.com/token`.

Required OAuth scopes:

- `https://www.googleapis.com/auth/health.activity.read`
- `https://www.googleapis.com/auth/health.sleep.read`
- `https://www.googleapis.com/auth/health.heart_rate.read`
- `https://www.googleapis.com/auth/health.oxygen_saturation.read`
- `https://www.googleapis.com/auth/health.respiratory_rate.read`
- `https://www.googleapis.com/auth/health.body.read`
- `https://www.googleapis.com/auth/health.nutrition.read`

Scope availability is subject to Google Health API OAuth verification review for
production. Test users added to the OAuth consent screen can use restricted scopes without
full review.

---

## Output

### Console

The script prints an availability report to stdout:

- Each data type attempted, with status (✓ success / ○ empty / ✗ error).
- Record count and sample field names from the first data point.
- A mapping back to the canonical Primis metric codes in the availability matrix.
- A provider scores section noting that all three proprietary scores remain
  `NO (unverified)`.

### Report File

A Markdown report is written to `scripts/google-health-spike/output/` (gitignored):

```
scripts/google-health-spike/output/availability-mock-2026-06-14.md
```

### Archive

Raw (redacted) payloads are written to the local archive directory via
`LocalRawPayloadArchive`:

```
database/fixtures/.local-dev-archive/
  provider=google_health/
    user_id=test-user-spike-001/
      data_type=steps/
        year=.../month=.../day=.../<uuid>.json.gz
```

This directory is gitignored. For live mode, after reviewing the output you may manually
promote a redacted payload to the committed fixtures directory.

### Committing Fixtures (Live Mode Only)

After completing Phase Z live validation, save redacted fixtures as follows:

```bash
# Redact a raw spike output before committing:
pnpm tsx scripts/redact-fixture.ts < tmp/sleep_raw.json \
  > database/fixtures/provider/google_health/redacted/sleep_stages_session.json
```

See `database/fixtures/README.md` for the full redaction policy and the §5 checklist that
must be completed before committing any redacted real payload.

---

## Implementation Files

| File          | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `index.ts`    | Main entrypoint — loops over data types, archives payloads, prints report. |
| `config.ts`   | Mode resolution and env var validation.                                    |
| `mockData.ts` | Synthetic fixture responses for every `GOOGLE_HEALTH_DATA_TYPES` entry.    |
| `report.ts`   | Markdown availability report formatter and result metadata extractor.      |

---

## M1 Milestone Tasks This Script Addresses

| Task    | Description                                                    |
| ------- | -------------------------------------------------------------- |
| M1-T002 | Implement API-call spike script (CU-040)                       |
| M1-T003 | Validate historical backfill (run with extended window)        |
| M1-T004 | Validate provider scores (sleep score, readiness, cardio load) |
| M1-T005 | Fill `docs/decisions/google-health-api-metric-availability.md` |

See `docs/source-of-truth/primis_mvp_build_plan_milestones.md §7` for full M1 acceptance
criteria.

---

## References

- `docs/decisions/google-health-api-metric-availability.md` — matrix this script fills
- `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md` — classification
  and validation status enums; target data types and field paths
- `database/fixtures/README.md` — fixture redaction policy
- `scripts/redact-fixture.ts` — redaction tool; run before committing any fixture
- Google Health API data types: <https://developers.google.com/health/data-types>
- Google Health API REST reference: <https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints>
