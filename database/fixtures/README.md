# Primis Fixture Policy

This document defines the fixture redaction policy, data sensitivity rules, directory layout, and
no-secrets mandate for all fixture files committed to this repository.

**Read this before adding any fixture file.** Violations of this policy are a security incident.

---

## 1. Data Sensitivity Classification

All fixture data must comply with the sensitivity levels defined in
`docs/source-of-truth/primis_data_model_health_metric_schema.md §5.4`:

| Level | Label                     | Examples                                                                                          | Fixture rule                                                       |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S0    | Public/reference          | FoodData Central public food records                                                              | May be committed verbatim with attribution                         |
| S1    | User preferences/settings | Theme, widget layout, coaching tone                                                               | Use synthetic values only                                          |
| S2    | Personal wellness data    | Steps, sleep duration, calories, workouts, manual check-ins                                       | Synthetic or fully redacted identifiers; realistic value structure |
| S3    | Sensitive health data     | HRV, heart rate, SpO2, respiratory rate, body composition, bowel entries, AI health conversations | Synthetic values only; must not reproduce any real person's data   |
| S4    | Secrets / credentials     | OAuth refresh tokens, API keys, AWS credentials                                                   | **Never committed** — use `.env.example` placeholder strings only  |

---

## 2. What Is Absolutely Forbidden in Any Committed Fixture

The following must **never** appear in any file under `database/fixtures/` (or anywhere else in
the repository):

- Real OAuth access tokens or refresh tokens (Google, Fitbit, Apple, or any provider)
- Real API keys (OpenAI, Anthropic, AWS, Google, Fitbit, or any other)
- Real user IDs, Cognito `sub` values, or internal Primis `user_id` UUIDs linked to real users
- Real email addresses or display names of real users
- Real device identifiers (UDID, advertising ID, push notification token)
- Unredacted provider API payloads — i.e., raw responses from Google Health, Fitbit,
  Apple HealthKit, or any other provider that contain real user identifiers, real timestamps
  linked to a real person, or provider-issued token data
- Raw personal health records from any real person

---

## 3. Redaction Requirements for S2/S3 Fixtures

Fixtures that exercise S2 or S3 health data must have:

1. **Synthetic or anonymized identifiers** — replace all user IDs, email addresses, device IDs,
   and session IDs with obviously fake values (e.g., `"user_id": "test-user-001"`,
   `"email": "fixture@example.invalid"`).
2. **Realistic value structure** — numeric health values (steps, HRV, SpO2 %) may be plausible
   but must not reproduce the exact record of a real identifiable person.
3. **Redacted provider fields** — any provider-specific field that could identify a real account
   (e.g., Google account ID, Fitbit user ID, Apple HealthKit source bundle ID for a real device)
   must be replaced with a clearly fake placeholder (e.g., `"REDACTED_GOOGLE_ACCOUNT_ID"`).
4. **No real timestamps linked to a real person** — timestamps in fixtures must be shifted or
   generalized so they cannot be correlated to a specific real individual's activity.

---

## 4. Directory Layout

```
database/fixtures/
├── README.md                          # this file
└── provider/
    └── <provider_name>/
        ├── redacted/                  # synthetic fixtures hand-crafted for tests
        │   └── <data_type>.json
        └── redacted_real/             # real payloads after M1 validation, manually redacted
            └── <data_type>.json       # MUST be reviewed before commit; see §5
```

**Provider name conventions:** `google_health`, `fitbit`, `apple_healthkit`, `withings`, `oura`.

> **Note:** The `provider/` subdirectories do not exist yet. They will be created in Phase B / M1
> manual validation. Do not create provider subdirectories until real or representative fixtures
> are available and have been reviewed for compliance with this policy.

---

## 5. `redacted_real/` Review Checklist

Fixtures under `redacted_real/` contain data derived from real provider API responses captured
during M1 manual validation. Before committing any file to `redacted_real/`:

- [ ] All user IDs replaced with `REDACTED_USER_ID`
- [ ] All email addresses replaced with `fixture@example.invalid`
- [ ] All device identifiers replaced with `REDACTED_DEVICE_ID`
- [ ] All OAuth tokens removed or replaced with `REDACTED_TOKEN`
- [ ] All API keys removed or replaced with `REDACTED_API_KEY`
- [ ] Timestamps reviewed — no exact timestamps linked to an identifiable real person
- [ ] A second person (or agent session) has reviewed the file before merge

---

## 6. Synthetic `redacted/` Fixtures

Synthetic fixtures under `redacted/` are hand-crafted or procedurally generated and contain no
real user data. They are the preferred fixture type for unit tests and CI. When creating synthetic
fixtures:

- Use `"user_id": "test-user-001"` (or similar clearly fake IDs).
- Use `"email": "fixture@example.invalid"` (`.invalid` TLD is reserved and never resolves).
- Use plausible but not real numeric values (e.g., `"hrv_ms": 42`, `"steps": 8200`).
- Use ISO 8601 timestamps offset from a fixed reference date (e.g., `2024-01-15T00:00:00Z`),
  not today's real date.

---

## 7. Redaction Tooling (CU-013)

Use `scripts/redact-fixture.ts` to strip sensitive fields from a provider API response
before committing it as a fixture. The script reads JSON from stdin and writes the
redacted result to stdout.

```bash
# Redact a raw provider payload before committing:
pnpm tsx scripts/redact-fixture.ts < raw_fixture.json > database/fixtures/provider/google_health/redacted/activity.json

# Inline quick check:
echo '{"access_token":"ya29.abc","steps":8200}' | pnpm tsx scripts/redact-fixture.ts
# → {"access_token":"[REDACTED_TOKEN]","steps":8200}
```

### What the script redacts

The script applies every rule in `SENSITIVE_FIELD_PATTERNS` from
`packages/core-types/src/redaction.ts`. Covered categories:

| Pattern name  | Field name examples                                           | Replacement            |
| ------------- | ------------------------------------------------------------- | ---------------------- |
| `oauth_token` | `access_token`, `refresh_token`, `id_token`, `token`          | `[REDACTED_TOKEN]`     |
| `api_key`     | `api_key`, `apiKey`, `client_secret`, `secret_key`            | `[REDACTED_KEY]`       |
| `email`       | `email`, `userEmail`                                          | `[REDACTED_EMAIL]`     |
| `user_id`     | `user_id`, `sub`, `subject`, `owner_id`                       | `[REDACTED_UUID]`      |
| `name`        | `name`, `display_name`, `first_name`, `last_name`, `username` | `[REDACTED_NAME]`      |
| `device_id`   | `device_id`, `udid`, `push_token`, `apns_token`, `fcm_token`  | `[REDACTED_DEVICE_ID]` |

Numeric health values (steps, HRV, heart rate, sleep duration, SpO2 %) are **not**
redacted — they are not personally identifying on their own and must remain realistic
for parser and scoring tests to be useful.

### Policy reminder

- **Real fixtures (`redacted_real/`)**: run through `redact-fixture.ts` before committing,
  then verify manually using the §5 checklist.
- **Synthetic fixtures (`redacted/`)**: hand-craft with fake IDs and the `.invalid` TLD
  for email placeholders; no real data should be present to begin with.
- When uncertain whether a field is sensitive: treat it as sensitive and redact it.

### Pattern reference

See `packages/core-types/src/redaction.ts` for the canonical `SENSITIVE_FIELD_PATTERNS`
array and the `redactFixture()` pure function that backs this script.

---

## 8. Enforcement

Verify before every commit:

```bash
git grep -r "sk-" .          # no OpenAI-format keys
git grep -r "AKIA" .         # no AWS access key IDs
git grep -r "ya29\." .       # no Google OAuth access tokens
git grep -r "refresh_token" database/fixtures/  # no refresh tokens in fixtures
git status --short | grep "\.env"               # no .env files tracked
```

These checks are also validated in the CI lint step. Any fixture that fails a check must be
removed and replaced with a properly redacted version before the PR can merge.
