# TestFlight Release Runbook

## Purpose and operating boundary

This is the credential-free CU-093 handoff for Primis's first internal iOS beta. It audits the
current Expo/EAS configuration, defines release gates, and gives Phase Z operators a repeatable
build and submission sequence. It does **not** prove that a TestFlight build exists or that Primis
is ready for App Store production.

CU-093 must not log into Expo or Apple, create or rotate credentials, replace identifiers, run an
EAS build or submission, publish an OTA update, deploy a backend, invite testers, or perform live
provider validation. Every checkbox labelled **Phase Z manual** requires an authorized operator.

Official operational references:

- [EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [EAS iOS credentials](https://docs.expo.dev/app-signing/app-credentials/)
- [EAS iOS submission](https://docs.expo.dev/submit/ios/)
- [Apple App ID registration](https://developer.apple.com/help/account/identifiers/register-an-app-id)
- [Apple internal TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)

## Audited repository configuration

Audit date: 2026-07-16. The established files were reviewed in place; the profiles were not
recreated.

| Concern             | Audited state                                                                                                                                       | Release implication                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| EAS CLI policy      | `cli.version` is `>= 16.0.0`; `eas-cli` is not a repository dependency.                                                                             | Phase Z installs a compatible CLI and records `eas --version`; no EAS command is a Phase J check.                                   |
| App versions        | `cli.appVersionSource` is `remote`; Expo app version is currently `0.0.1`; `runtimeVersion.policy` is `appVersion`.                                 | Phase Z initializes the remote version before the first build and records the marketing version and iOS build number.               |
| Development         | `developmentClient: true`, internal distribution, `dev` channel, physical-device build (`simulator: false`).                                        | Use for Metro-attached engineering and device QA; never submit this profile to TestFlight.                                          |
| Preview             | Internal distribution, `preview` channel, no development client.                                                                                    | This is an ad hoc stakeholder build, not a TestFlight build; registered devices and matching provisioning are required.             |
| Production          | Store distribution, `production` channel, `autoIncrement: true`.                                                                                    | This is the only current profile intended to produce the App Store/TestFlight artifact.                                             |
| EAS environments    | Default EAS environment selection follows the profile names `development`, `preview`, and `production`.                                             | Configure the two public mobile variables in each matching EAS environment; do not confuse these names with `APP_ENV`.              |
| App environment     | Profile `APP_ENV` values are `dev`, `staging`, and `prod`, matching `@primis/config`.                                                               | CU-093 corrected the prior invalid values without changing profile or channel names.                                                |
| iOS resources       | All profiles use `ios.resourceClass: m-medium`; tablet support is disabled.                                                                         | No resource-class change is required. Preview and production default to device/store builds.                                        |
| Submit profile      | `submit.production.ios` retains obvious Apple placeholders.                                                                                         | Submission cannot proceed until the Phase Z replacement and independent review below.                                               |
| Expo identity       | Name `Primis`, slug `primis`, scheme `primis`; bundle ID and EAS project/update IDs are placeholders.                                               | Slug and scheme are stable current decisions; the production bundle ID and EAS project association are unresolved.                  |
| Public mobile env   | `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_MOCK_MODE` are the only `EXPO_PUBLIC_*` variables.                                                      | They are readable from the app bundle and must never contain credentials or secret endpoints/tokens.                                |
| Native generation   | No `ios/` or `android/` directory is checked in; Expo config plugins are `expo-dev-client` and `expo-router`.                                       | EAS uses Expo prebuild/CNG; any plugin or native-module change requires compatibility review and a new binary.                      |
| Native dependencies | Expo Dev Client, Router, SQLite, MMKV, Gesture Handler, Reanimated, Safe Area Context, and Screens are installed. No HealthKit module is installed. | A dev client is mandatory. Do not add HealthKit entitlements or usage text until a native HealthKit feature is explicitly approved. |
| CI                  | The only workflow runs install, lint, typecheck, test, and format checks with no secrets or deployment permission.                                  | There is no release job and CU-093 does not add one. Build and submission remain manual Phase Z work.                               |

### Known pre-build blockers

- [ ] **Phase Z manual:** Replace `PLACEHOLDER_EAS_PROJECT_ID`, `PLACEHOLDER_BUNDLE_ID`,
      `PLACEHOLDER_APPLE_ID`, `PLACEHOLDER_ASC_APP_ID`, and `PLACEHOLDER_APPLE_TEAM_ID` only after
      the corresponding account records are created and reviewed. Keep
      `PLACEHOLDER_ANDROID_PACKAGE` until Android scope is approved.
- [ ] **Separate authorized code change, then Phase Z validation:** Resolve the current
      `expo install --check` compatibility report in a dedicated reviewed dependency change, then
      rerun it to a clean exit. On 2026-07-16 it reported mismatches for Expo, Expo Dev Client, Expo
      Router, React, React Native, Gesture Handler, Reanimated, Safe Area Context, and TypeScript.
- [ ] **Separate authorized code change, then Phase Z validation:** Wire real Cognito mobile
      authentication. The current mobile email flow is mock-only, and Google, Apple, and Facebook
      buttons are presentational placeholders. A non-mock build currently cannot sign in.
- [ ] **Separate authorized code change, then Phase Z validation:** Complete the real Google Health
      OAuth handoff. The mobile authorize action does not yet open/complete the returned consent URL.
- [ ] **Separate authorized code change, then Phase Z validation:** Prove or correct the mobile
      public-environment access pattern in an exported binary. Expo inlines direct
      `process.env.EXPO_PUBLIC_*` references, while the current mobile code reads a dynamic
      `process.env` object through `loadPublicEnv`; do not assume EAS values override the localhost
      and mock-mode defaults until artifact inspection confirms it.
- [ ] **Phase Z manual:** Configure an approved AI provider/backend path or explicitly scope the
      beta to labelled mock AI. Mock output must never be presented to a tester as personal live
      analysis.
- [ ] **Phase Z manual:** Approve the private-beta privacy, health-data, AI-processing, and
      performance-only/non-medical language. CU-086 copy is explicitly draft/informational.
- [ ] **Phase Z manual:** Decide whether the vendor-neutral no-op telemetry scaffold is an accepted
      beta limitation or approve a privacy-reviewed transport. Native fatal-crash capture does not
      exist today.
- [ ] **Phase Z manual:** Complete the physical-iPhone accessibility and performance records. The
      Phase J simulator could not build while the bundle identifier remained a placeholder.

Do not waive a blocker by switching to mock mode silently, inserting a temporary identifier, or
adding a credential to the repository.

## Phase J safe validation

These commands are local, credential-free, and safe to run from the repository root:

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8'))"
pnpm --dir apps/mobile exec expo config --type public --json
pnpm --dir apps/mobile exec expo install --check
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
docker compose config --quiet
git diff --check
```

Inspect the Expo JSON output and confirm that the name, slug, scheme, version, update URL, EAS
project ID, bundle ID, and Android package agree with the audit above. `expo install --check` is
expected to remain a documented blocker until the dedicated dependency correction lands; do not
change dependencies in CU-093 merely to make the audit green.

Confirm the release configuration still contains every placeholder and no credential-like value:

```bash
rg -n "PLACEHOLDER_(EAS_PROJECT_ID|BUNDLE_ID|ANDROID_PACKAGE|APPLE_ID|ASC_APP_ID|APPLE_TEAM_ID)" \
  apps/mobile/app.config.ts apps/mobile/eas.json
rg -n "console\.(log|warn|error)" services apps packages scripts
rg -ni "(authorization|bearer|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|raw[_-]?prompt|context[_-]?packet|provider[_-]?payload|userIdHash)" \
  services apps packages scripts docs/runbooks
```

Classify every match. Type names, policy text, tests, and explicit prohibitions can be valid;
runtime emission, mobile-bundled secrets, real identity values, health values, prompts, notes,
provider payloads, or credentials are release blockers.

## Phase Z account and identifier prerequisites

- [ ] **Phase Z manual:** Confirm active Apple Developer Program membership and an App Store
      Connect role permitted to manage the app, builds, privacy details, and internal testers.
- [ ] **Phase Z manual:** Confirm the Expo organization/account that will own the EAS project and
      restrict project access to the release team.
- [ ] **Phase Z manual:** Choose the permanent reverse-DNS bundle identifier through an explicit
      product/organization decision. Do not infer it from the placeholder example.
- [ ] **Phase Z manual:** Register one explicit Apple App ID with exactly that bundle ID and enable
      only capabilities used by the current binary.
- [ ] **Phase Z manual:** Create the App Store Connect app record with the same bundle ID, display
      name, primary language, and an approved SKU; record the numeric ASC App ID outside secrets.
- [ ] **Phase Z manual:** Associate the Expo project, then replace both EAS project-ID placeholders
      in `app.config.ts` with the generated UUID.
- [ ] **Phase Z manual:** Replace the iOS bundle placeholder and the three submit placeholders in
      one reviewed configuration change. Confirm no personal password, API key content, certificate,
      or provisioning profile is committed.
- [ ] **Phase Z manual:** Decide and configure required authentication capabilities. If third-party
      sign-in is offered on iOS, include and validate Sign in with Apple as required by the approved
      product/auth plan.
- [ ] **Phase Z manual:** Re-run public Expo config inspection and compare the resolved bundle ID,
      update URL, project ID, scheme, slug, and version to the Apple/Expo records character for
      character.

## Certificates, provisioning, and EAS credentials

Run credential operations only after identifiers are final, from `apps/mobile`, using an authorized
Apple/Expo account:

```bash
eas login
eas whoami
eas credentials --platform ios
```

- [ ] **Phase Z manual:** Prefer EAS-managed credentials unless an approved organizational policy
      requires local credentials. Record the owner and renewal procedure, never private material.
- [ ] **Phase Z manual:** Create or select the development/ad hoc signing assets needed for the
      physical-device development and preview profiles.
- [ ] **Phase Z manual:** Register preview devices before generating the ad hoc provisioning profile;
      adding a device later requires re-signing or rebuilding.
- [ ] **Phase Z manual:** Create or select the App Store distribution certificate and App Store
      provisioning profile used by the production profile.
- [ ] **Phase Z manual:** Verify certificate and profile bundle IDs, team, capabilities, and expiry.
      A capability change invalidates affected profiles and requires regeneration.
- [ ] **Phase Z manual:** Use an approved App Store Connect API key or other supported submission
      authentication. Never paste credentials into shell history, logs, tickets, or this runbook.

## Environment-variable gate

Use the default EAS environment attached to each build profile and configure these non-secret client
values in the Expo dashboard (or reviewed EAS environment workflow):

| Build profile | EAS environment | `APP_ENV` in `eas.json` | `EXPO_PUBLIC_API_BASE_URL`               | `EXPO_PUBLIC_MOCK_MODE`                                        |
| ------------- | --------------- | ----------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `development` | `development`   | `dev`                   | Approved dev API URL                     | Explicitly `true` only for labelled mock QA; otherwise `false` |
| `preview`     | `preview`       | `staging`               | Approved staging API URL                 | `false` for a live candidate                                   |
| `production`  | `production`    | `prod`                  | Approved private-beta production API URL | `false`                                                        |

- [ ] **Phase Z manual:** Confirm the resolved API URL uses HTTPS and the intended environment;
      never rely on the `.env.example` localhost default in a device/store build.
- [ ] **Phase Z manual:** Confirm production and live preview builds resolve mock mode to `false`.
      A mock-mode production artifact must not be distributed as a real private beta.
- [ ] **Phase Z manual:** Treat every `EXPO_PUBLIC_*` value as public and extractable. Cognito/provider
      client secrets, AI keys, AWS credentials, tokens, certificate material, and database URLs stay
      backend-only.
- [ ] **Phase Z manual:** Rebuild after changing an inlined public variable. An existing binary does
      not acquire a corrected build-time value automatically.
- [ ] **Phase Z manual:** Verify backend `APP_ENV`, Cognito, database, storage, provider, and AI
      resources belong to the same intended environment before using a live tester account.

## Version and build-number handling

- [ ] **Phase Z manual:** Choose the first private-beta marketing version; do not assume `0.0.1` is
      approved merely because it is checked in.
- [ ] **Phase Z manual:** Initialize and inspect EAS remote app versions before building. Record the
      resolved iOS marketing version and build number in the release record.
- [ ] **Phase Z manual:** Keep `production.autoIncrement: true`; each production rebuild must produce
      a new iOS build number. Development and preview profiles do not currently auto-increment.
- [ ] **Phase Z manual:** Bump the app marketing version whenever a native module, config plugin,
      entitlement, capability, or other native compatibility boundary changes. Because OTA runtime
      compatibility is keyed to `appVersion`, a build-number-only change is not a safe native-runtime
      boundary.
- [ ] **Phase Z manual:** Never reuse an App Store Connect build number. Confirm the post-build number
      before submission.

## Build and submission commands

Install a CLI satisfying `>= 16.0.0`, record its version, and run all commands from
`apps/mobile`. These commands are documentation only in Phase J.

```bash
eas --version
eas whoami

# Metro-attached physical-device engineering build; never submit to TestFlight.
eas build --platform ios --profile development

# Ad hoc internal build for registered devices; not a TestFlight artifact.
eas build --platform ios --profile preview

# Store-signed artifact used for App Store Connect and TestFlight.
eas build --platform ios --profile production

# Submit a completed store build using submit.production placeholders replaced in Phase Z.
eas submit --platform ios --profile production
```

Do not use the preview profile as a production substitute, and do not submit the development
profile. Record the EAS build URL/ID, commit SHA, profile, channel, EAS environment, marketing
version, build number, resolved backend mode, and QA result without recording credentials or user
data.

Before production build submission:

- [ ] **Phase Z manual:** Run the root CI-equivalent checks and clean `expo install --check`.
- [ ] **Phase Z manual:** Confirm the git SHA is approved and the worktree is clean.
- [ ] **Phase Z manual:** Confirm app identifiers, signing assets, version, public environment, and
      App Store Connect record all match.
- [ ] **Phase Z manual:** Confirm native assets and required usage descriptions are present for the
      features actually compiled into the binary. There is currently no HealthKit module; do not
      claim or enable HealthKit incidentally.
- [ ] **Phase Z manual:** Build development, then preview, and complete their applicable device QA
      before producing production.

## App privacy, health-data, and AI declarations

These are disclosure inputs for privacy/legal and App Store Connect review, not final answers:

- [ ] **Phase Z manual:** Inventory every data type collected by the exact submitted binary and its
      backend/third-party partners, including contact/account data, Health, Fitness, diagnostics if
      a crash transport is approved, manual wellness/nutrition/digestion inputs, and AI conversation
      content. Do not copy a declaration from a different build.
- [ ] **Phase Z manual:** For each type, document collection purpose, whether it is linked to the
      user, whether it is used for tracking, retention, deletion status, and recipient/processor.
- [ ] **Phase Z manual:** State that Primis uses health and fitness data to provide wellness and
      performance dashboards, trends, scores, planning, and coaching; do not imply diagnosis,
      treatment, disease detection, or guaranteed outcomes.
- [ ] **Phase Z manual:** Describe Google Health authorization separately from Primis app sign-in,
      request only approved scopes, and explain connected-source status and disconnection behavior.
- [ ] **Phase Z manual:** Describe AI processing accurately: task-specific structured Primis context
      may be sent to the approved model provider; raw OAuth tokens, exact account identifiers, full
      raw provider payloads, and unnecessary history are excluded. Document provider retention and
      training terms based on the actual configured service.
- [ ] **Phase Z manual:** Reconcile the in-app draft disclosure with App Store Connect responses,
      onboarding/connection disclosure, the privacy policy URL, deletion status, and actual backend
      implementation. Never claim production deletion is operational while CU-087 is dry-run-only.
- [ ] **Phase Z manual:** Complete Apple privacy manifests/reason declarations required by the exact
      third-party SDK set and resolve any App Store Connect warnings.
- [ ] **Phase Z manual:** Obtain privacy/legal/product approval and record known private-beta
      limitations. TestFlight acceptance is not evidence of public App Store readiness.

## Release QA gate

Record date, tester, device model, iOS version, commit/build, profile, EAS environment, backend mode,
appearance, accessibility settings, and pass/fail evidence. Do not attach screenshots or logs that
contain health values, identity, prompts, notes, tokens, or provider payloads.

### Authentication, onboarding, and environment

- [ ] Create and sign into a real private-beta account; relaunch and refresh the session.
- [ ] Validate email/password plus each enabled social provider. If third-party sign-in is offered,
      validate Sign in with Apple and account-linking behavior.
- [ ] Complete onboarding, sign out, and sign back in without exposing another account's data.
- [ ] Confirm the app targets the intended backend and `EXPO_PUBLIC_MOCK_MODE=false`.
- [ ] Confirm no mock badge, fixture content, synthetic token, localhost URL, or developer-only UI is
      present in the distributed candidate.

### Privacy and deletion (CU-086/CU-087)

- [ ] Open Settings -> Privacy & Data Controls and verify connected-source, retention, deletion, and
      AI-processing disclosures match the approved beta limitation language.
- [ ] Confirm the mobile deletion entry remains informational: it sends and schedules nothing.
- [ ] Confirm staging/prod does not register `POST /api/v1/data/delete-all`; the dry-run endpoint is
      local/dev mock-auth-only. Execute no destructive command during release QA.
- [ ] Follow [user-data-deletion.md](./user-data-deletion.md) to review the 52-target inventory,
      private-food hazard, AI records, raw archive metadata, and device-cache follow-up.
- [ ] Confirm the private-beta support path for a real deletion request is documented and staffed
      without misrepresenting the dry-run skeleton as execution.

### Crash boundary, telemetry, and redaction (CU-088/CU-089)

- [ ] Force the approved development-only render-crash fixture; verify safe fallback focus, Retry,
      and Home recovery without raw error text.
- [ ] Confirm telemetry accepts only allowlisted classification, screen code, request ID, and recovery
      action. No health data, user IDs or hashes, prompts, notes, payloads, screenshots, breadcrumbs,
      raw messages, stacks, or arbitrary objects may be emitted.
- [ ] Confirm API errors expose a safe request ID and backend logs correlate only approved operational
      fields.
- [ ] Review the repository log/sensitive scan. If the no-op telemetry transport remains, record
      native crash capture and remote monitoring as explicit limitations; do not claim crashes are
      remotely captured.

### Loading, stale, missing, and AI fallback states (CU-090)

- [ ] Exercise initial loading, cached refresh, empty, disconnected, unavailable, unverified,
      insufficient-history, stale, provisional, missing-required, missing-optional, calculation,
      API-error, and cached-AI states across the audit matrix.
- [ ] Confirm cached content stays visible during refresh; missing values never render as zero; rest
      day is not provider unavailable; unverified capability is not permission denial.
- [ ] Confirm cached AI content is dated and labelled honestly and failed/regenerating summaries are
      never served as fresh.

### Accessibility (CU-091)

- [ ] Execute every device step in [accessibility-checklist.md](./accessibility-checklist.md) and
      attach the result record.
- [ ] On a physical iPhone, verify VoiceOver order/rotor/headings, modal initial and return focus,
      chart summaries, state announcements, crash recovery, and provider/privacy language.
- [ ] Verify the largest Dynamic Type category, software keyboard traversal, minimum touch targets,
      light/dark Increase Contrast, and non-color state meaning.
- [ ] Verify Reduce Motion on and off, including sheets, AI auto-scroll, charts, and core screens.

### Performance (CU-092)

- [ ] Execute [mobile-performance-checklist.md](./mobile-performance-checklist.md) on a named physical
      device and record comparable cohorts for cold shell, cached Home, refresh, tabs, representative
      chart, AI first token, provider refresh, and manual-log cache commit.
- [ ] Keep dev-client diagnostics separate from release/profile measurements; production correctly
      emits no CU-092 performance events.
- [ ] Record medians/ranges, qualitative jank/frame pacing, thermal state, and attachments without
      recording health values, prompts, identity, provider-account details, or payloads.
- [ ] Treat source budgets as UX targets, not infrastructure SLAs or App Store readiness claims.

### Provider sync and AI mock/live boundaries

- [ ] Complete the Phase Z Google Health live-validation amendment and update the approved parity
      decisions/redacted fixtures before distribution.
- [ ] Exercise authorization, callback, capability state, initial sync, manual refresh, stale state,
      permission loss, provider outage, disconnect, and reconnect against the intended beta backend.
- [ ] Confirm app authentication and health-provider authorization remain separate and no token,
      connection ID, raw provider payload, or internal user ID appears in mobile UI/logs.
- [ ] Run mock and live provider/AI cohorts separately. Label mock output clearly and never use it as
      evidence that live sync, scores, summaries, or AI reasoning work.
- [ ] Exercise the approved live AI provider for summary cache/fallback, streaming first response,
      insufficient-data admission, performance-only language, and medical-safety redirect. Confirm
      prompts/responses/context are absent from logs.

## Internal TestFlight distribution

After the production build processes successfully in App Store Connect:

- [ ] **Phase Z manual:** Resolve export-compliance, privacy, encryption, content-rights, and other
      App Store Connect prompts truthfully for the submitted binary.
- [ ] **Phase Z manual:** Confirm the processed build displays the intended version/build, bundle ID,
      environment, and compliance state.
- [ ] **Phase Z manual:** Create a narrowly scoped internal tester group. Internal testers must be App
      Store Connect users with suitable access; use only approved accounts.
- [ ] **Phase Z manual:** Add the build to the group, provide concise test notes and known limitations,
      then invite the founder/internal tester.
- [ ] **Phase Z manual:** Install from TestFlight on a physical iPhone, cold launch without a dev
      machine, and rerun the release QA gate against the exact distributed build.
- [ ] **Phase Z manual:** Record pass/fail and stop distribution for any privacy, auth, environment,
      crash, data-integrity, or provider-boundary blocker.

## Failed build/submission, rebuild, and rollback

- A failed build or submission changes no release gate to passed. Record the EAS/App Store Connect
  error category and build ID without copying credential output or user data; fix the reviewed root
  cause and create a new build number.
- Do not delete or rotate certificates/profiles reflexively. First verify expiry, team, bundle ID,
  capability, registered-device, and App Store Connect agreement; regenerate only the affected asset
  through the approved credentials workflow.
- Any native dependency, plugin, entitlement, capability, usage-description, public build-time
  variable, or bundle-identity correction requires a rebuild. JavaScript-only OTA rollback/publish
  is not authorized by this runbook.
- TestFlight has no binary overwrite. Stop distribution of a bad candidate, remove it from tester
  groups or expire it as appropriate in App Store Connect, and select a previously validated build
  only if its backend/runtime remains compatible; otherwise rebuild and submit a higher build number.
- Roll back backend/config independently only through its approved deployment runbook, then repeat
  auth, sync, cached-data, AI, and schema-compatibility smoke tests. CU-093 does not deploy or roll
  back infrastructure.
- Preserve the failed artifact and evidence needed for diagnosis within approved retention/access
  controls. Never capture health values, credentials, raw prompts, or provider payloads in a ticket.

## Explicit Phase Z manual ownership

The following implementation-spec steps remain manual and incomplete until recorded by an operator:

| Phase Z step | Required release evidence                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| MAN-001      | Apple Developer and Expo/EAS account access confirmed; no keys committed.                                                    |
| MAN-002      | Intended backend environment deployed and its non-secret public endpoint approved.                                           |
| MAN-003      | Cognito email/social providers, callbacks, logout, and Sign in with Apple validated.                                         |
| MAN-004      | Google Health OAuth, scopes, real-device data, parity matrix, and redacted fixtures validated.                               |
| MAN-005      | Approved AI provider, routing, safety, cache, timeout, and cost controls validated.                                          |
| MAN-006      | Final identifiers, capabilities, EAS credentials, and dev/preview device builds recorded.                                    |
| MAN-007      | End-to-end real-account dev smoke test recorded with no unlabelled fake data.                                                |
| MAN-008      | Production build submitted, internal testers added, TestFlight install/open verified.                                        |
| MAN-009      | Security, privacy/deletion, disclosures, redaction, data states, accessibility, performance, and known limitations reviewed. |

## Release sign-off record

Copy this table into the private-beta release artifact. A blank or waived required row is a no-go.

| Gate                                           | Owner | Evidence/link | Result | Date |
| ---------------------------------------------- | ----- | ------------- | ------ | ---- |
| Accounts/roles and identifier match            |       |               |        |      |
| Expo compatibility and native dependency audit |       |               |        |      |
| Credentials/provisioning/capabilities          |       |               |        |      |
| Version/build and public environment           |       |               |        |      |
| Authentication/onboarding                      |       |               |        |      |
| Provider sync/live-data boundary               |       |               |        |      |
| AI provider/mock-live boundary                 |       |               |        |      |
| Privacy/health/AI declarations                 |       |               |        |      |
| Deletion/support limitation                    |       |               |        |      |
| Logging/crash/telemetry                        |       |               |        |      |
| Data-state regression                          |       |               |        |      |
| Accessibility device record                    |       |               |        |      |
| Performance device record                      |       |               |        |      |
| TestFlight install and exact-build smoke       |       |               |        |      |
| Known limitations and rollback owner           |       |               |        |      |
| Private-beta go/no-go                          |       |               |        |      |

Private-beta sign-off authorizes only the documented internal audience and build. It does not
authorize external TestFlight testing, public beta, App Store release, production deletion, new
data collection, new native capabilities, or unreviewed OTA updates.
