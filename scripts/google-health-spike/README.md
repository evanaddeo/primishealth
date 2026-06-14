# Google Health API Spike Script

**Created:** CU-034 (scaffold)
**Script implementation:** CU-040
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

## Script Implementation

The spike script (`index.ts`) is created in **CU-040**. This README is committed in CU-034 to
establish the directory and document the contract before the script exists.

---

## Modes

### Mock Mode (default — safe for CI and automated tests)

Mock mode injects pre-built synthetic fixtures instead of making real network calls. It is
the default mode and requires no credentials.

```bash
pnpm tsx scripts/google-health-spike/index.ts
```

Mock mode:

- Uses fixtures from `database/fixtures/provider/google_health/redacted/` as synthetic
  provider responses.
- Runs the same normalization and output logic as live mode.
- Produces a metric availability summary from the synthetic data.
- Is safe to run in CI and automated tests.

### Live Mode (manual only — never in CI)

Live mode calls the real Google Health API using OAuth credentials from your local `.env`
file. It is intended for Phase Z manual validation only.

```bash
PRIMIS_SPIKE_MODE=live pnpm tsx scripts/google-health-spike/index.ts
```

Live mode requirements:

- A configured Google Cloud project with the Google Health API enabled.
- An OAuth consent screen in `Testing` mode with your test Fitbit Air account added as a
  test user.
- A valid refresh token obtained via the local OAuth flow (see `GOOGLE_HEALTH_TEST_REFRESH_TOKEN`
  below).
- A Fitbit Air device that has synced recent data to the Google Health app.

> **Live mode MUST NOT be run in CI or automated tests.** CI must never have access to
> real Google Health OAuth credentials. Live mode credentials must stay in your local
> `.env` file and must never be committed to the repository.

---

## Required Environment Variables

Copy `.env.example` to `.env` and fill in the values below for live mode. Mock mode does
not require any of these.

| Variable                           | Required for | Description                                                                                                            |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_HEALTH_CLIENT_ID`          | live mode    | OAuth 2.0 client ID from Google Cloud Console.                                                                         |
| `GOOGLE_HEALTH_CLIENT_SECRET`      | live mode    | OAuth 2.0 client secret from Google Cloud Console.                                                                     |
| `GOOGLE_HEALTH_TEST_REFRESH_TOKEN` | live mode    | Refresh token for the test Fitbit Air account. Obtain via the local OAuth helper (see below). Never commit this value. |
| `PRIMIS_SPIKE_MODE`                | live mode    | Set to `live` to enable real API calls. Omit or set to `mock` for mock mode.                                           |

> **Security reminder:** `GOOGLE_HEALTH_TEST_REFRESH_TOKEN` is an OAuth refresh token (S4
> sensitivity per `primis_data_model_health_metric_schema.md §5.4`). It must never be
> committed to the repository. Verify with `git status --short | grep '\.env'` before
> every commit.

---

## Obtaining a Refresh Token (Live Mode Setup)

The spike script includes a local OAuth helper (implemented in CU-040) that:

1. Opens a local HTTP listener on `http://localhost:9090/callback`.
2. Prints an authorization URL for the required Google Health API scopes.
3. After the user approves in the browser, exchanges the authorization code for tokens.
4. Prints the refresh token so you can paste it into `.env`.

```bash
PRIMIS_SPIKE_MODE=oauth-setup pnpm tsx scripts/google-health-spike/index.ts
```

Required scopes requested during setup:

- `https://www.googleapis.com/auth/health.activity.read`
- `https://www.googleapis.com/auth/health.sleep.read`
- `https://www.googleapis.com/auth/health.heart_rate.read`
- `https://www.googleapis.com/auth/health.oxygen_saturation.read`
- `https://www.googleapis.com/auth/health.respiratory_rate.read`
- `https://www.googleapis.com/auth/health.body.read`
- `https://www.googleapis.com/auth/health.nutrition.read`

Scope availability is subject to Google Health API OAuth verification review for production.
Test users added to the OAuth consent screen can use restricted scopes without full review.

---

## Output

Live mode output (Phase Z):

1. A console summary of available vs unavailable data types — fills
   `docs/decisions/google-health-api-metric-availability.md`.
2. Raw JSON responses written to a local `tmp/` path (gitignored).
3. After manual review, redacted fixtures saved to
   `database/fixtures/provider/google_health/redacted/` using `scripts/redact-fixture.ts`.

```bash
# Redact a raw spike output before committing:
pnpm tsx scripts/redact-fixture.ts < tmp/sleep_raw.json \
  > database/fixtures/provider/google_health/redacted/sleep_stages_session.json
```

See `database/fixtures/README.md` for the full redaction policy and the §5 checklist that
must be completed before committing any redacted real payload.

---

## M1 Milestone Tasks This Script Addresses

| Task    | Description                                                    |
| ------- | -------------------------------------------------------------- |
| M1-T002 | Implement API-call spike script (CU-040)                       |
| M1-T003 | Validate historical backfill (run with `--backfill` flag)      |
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
