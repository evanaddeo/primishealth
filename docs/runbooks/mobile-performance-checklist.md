# CU-092 Mobile Performance Checklist

Use this runbook to collect comparable private-beta mobile baselines. CU-092 events are development
diagnostics only: they are emitted locally, require no telemetry network, pass through the CU-088
allowlist, and contain only event code, duration, outcome, render count, and environment. Never add
prompts, notes, route parameters, user/provider identifiers, health or nutrition values, query data,
or payload metadata to a profiling record.

## Environment and setup

Record the following before each run:

- commit SHA and clean/dirty state;
- calendar date and tester initials;
- physical device model, OS version, battery/thermal state, and available storage;
- simulator model/runtime when a simulator is unavoidable;
- Expo/React Native/Hermes versions and dev-client build date;
- `APP_ENV`, mock/live-backend mode, network type, and backend location;
- Reduce Motion and screen-reader settings;
- whether Metro, React DevTools, debugger, screen recording, or Instruments is attached.

Build and run the existing Expo development client with Hermes. Keep the same device, dev-client
binary, environment, mock/live mode, network, and tool attachments for the before/after comparison.
Filter Metro output to `[primis-performance]`. Do not use Fast Refresh during a measured set; reload
or relaunch as the procedure specifies. Close unrelated apps, allow the device to return to a normal
thermal state, and disable Low Power Mode.

Production builds intentionally emit no CU-092 events. A dev-client baseline includes development
overhead and therefore must not be presented as release-build performance.

## Stable measurement points

| Event code                          | Begins                                    | Completes                                                    |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `app.cold_root_initialization`      | root JavaScript module evaluation         | first committed root effect                                  |
| `home.cached_warm_render`           | cached Home subtree render                | first cached Home subtree commit                             |
| `home.refresh_completion`           | Home query refetch request                | refetch settles                                              |
| `navigation.tab_transition`         | tab press                                 | first animation frame after destination focus                |
| `chart.representative_render`       | representative Sleep trend subtree render | first chart subtree commit                                   |
| `coach.first_token`                 | Coach turn starts                         | first mock or response token; emitted once per turn          |
| `sync.provider_refresh`             | Connections refresh action                | refresh request and connection-query reconciliation complete |
| `nutrition.manual_log_cache_commit` | measured manual-log mutation starts       | post-ack lifestyle/Nutrition cache update                    |

`not_visible` means an operation completed without an available cache/visible token boundary.
`cancelled` means navigation, a stream, or profiling cleanup ended the span. Investigate these
outcomes separately from completed durations instead of folding them into the baseline.

The root event measures JavaScript root initialization, not native process launch-to-glass. Use a
screen recording or platform profiler alongside it for perceived cold-start assessment.

## Repeatable procedure

1. Choose one fixed scenario with representative cached data. Record whether it uses mock data or a
   fixed backend account; never put account details in the results.
2. Perform two unrecorded warm-up passes after installing or rebuilding the dev client.
3. Collect at least five completed samples for each test below in one session. Ten samples are
   recommended when comparing a suspected regression.
4. Run one test at a time, in the order below, and wait for the UI/network to become idle between
   samples. Keep failed, cancelled, and `not_visible` outcomes in a separate count.
5. Record raw samples in the baseline table or an attached PR artifact. Report median and range;
   for ten or more samples, also report p90. Do not infer release p95 from a five-sample dev run.
6. Repeat on the same setup for the candidate change. Then perform a qualitative jank check with the
   platform profiler; mark dropped frames separately from span duration.

## Test checklists

### Cold root/app initialization

- Force-quit the dev client, leave Metro ready, then launch from the device home screen.
- Confirm one completed `app.cold_root_initialization` event.
- Separately record perceived launch-to-shell from a screen recording or platform profiler.
- Repeat without reinstalling; an install/first-ever launch is a different cohort.

### Home warm load

- First open Home and wait for its snapshot to persist, then navigate to another tab.
- Return to Home without clearing SQLite or the TanStack Query cache.
- Confirm cached content appears without a blocking skeleton and capture
  `home.cached_warm_render` on a fresh Home mount/reload.
- Trigger pull-to-refresh or the visible retry/refresh action and capture
  `home.refresh_completion`; keep cached content visible during the refresh.

### Tab transition

- From an idle Home tab, tap Sleep, Recovery, Activity, Nutrition, Coach, then Home.
- Pause after every destination settles and capture one `navigation.tab_transition` event per
  actual transition. Do not include repeated taps on the already focused tab.
- Note visible jank or delayed press feedback even if the duration looks acceptable.

### Representative chart render

- Open Sleep with a populated seven-night duration trend.
- Capture `chart.representative_render` for the first Sleep trend chart commit.
- Scroll the chart into view and confirm its accessible summary remains reachable; do not profile
  every chart or every re-render.
- Use the platform frame timeline for interaction smoothness; the commit span alone cannot certify
  60 fps.

### AI first token

- Open Coach, enter a fixed benign test prompt locally, and do not copy that prompt into results.
- Submit once and capture `coach.first_token`; confirm exactly one event despite multiple chunks.
- Run mock-stream and backend-response cohorts separately. Record failures and `not_visible`
  outcomes, but never response text, conversation IDs, request payloads, or provider/model details.

### Provider sync refresh

- Open Settings → Connections in a refreshable state and wait until the screen is idle.
- Tap **Refresh now** once and capture `sync.provider_refresh` after the request plus query refresh
  settles.
- Keep mock and live-provider runs separate. Record only the generic environment mode, never the
  provider connection, account, capability, or user identity.

### Optimistic/manual logging visibility

- Open Quick Add or Nutrition with the relevant day cache already present.
- Submit one Water, Caffeine, Alcohol, or Macros entry and capture
  `nutrition.manual_log_cache_commit`.
- Confirm the visible cached roll-up updates after success and note any `not_visible` outcome.
- The current implementation commits after server acknowledgement; this is not a pre-ack optimistic
  mutation. CU-092 measures the existing semantics and does not change them.
- Do not record entry amounts, macro values, notes, tags, local dates, or request bodies.

## What to record

Copy this table for each device/build cohort. Leave targets and baselines in separate columns.

| Measurement                         | Samples (ms) | Median | Range | p90 (10+ only) | Outcome counts | Notes |
| ----------------------------------- | ------------ | ------ | ----- | -------------- | -------------- | ----- |
| Native launch to shell (manual)     |              |        |       |                |                |       |
| `app.cold_root_initialization`      |              |        |       |                |                |       |
| `home.cached_warm_render`           |              |        |       |                |                |       |
| `home.refresh_completion`           |              |        |       |                |                |       |
| `navigation.tab_transition`         |              |        |       |                |                |       |
| `chart.representative_render`       |              |        |       |                |                |       |
| `coach.first_token`                 |              |        |       |                |                |       |
| `sync.provider_refresh`             |              |        |       |                |                |       |
| `nutrition.manual_log_cache_commit` |              |        |       |                |                |       |

Also record qualitative press feedback, skeleton/blank states, dropped frames, layout shifts,
thermal warnings, failures/cancellations, and whether cached content remained visible. Results must
contain no screenshots or logs that expose health values, nutrition values, notes, prompts, user
identity, provider identity tied to a user, or payload data.

## Comparing runs and interpreting targets

Compare only like-for-like cohorts. Use the median difference and percentage change, inspect the
range for variance, and repeat the set when thermal state, network, debugger, or background work
changed. Treat an isolated outlier as a reason to rerun, not as evidence to delete the sample.

The source documents provide UX targets—not contractual infrastructure SLAs—including under two
seconds to shell on a modern iPhone, warm cached Home under one second, a perceived tab switch under
250 ms/no visible jank, ideally under two seconds to the first AI token, and smooth 60 fps chart
interaction. Keep measured baselines separate from these non-contractual targets. Any team-specific
regression threshold (for example, a recommended rerun when the median worsens materially) is a
review heuristic and must be labeled **recommendation**, not an acceptance promise.

## Accessibility and reduced motion

- Run the functional checklist once with Reduce Motion off and once with it on; compare each setting
  only to the same setting. CU-092 does not alter animation timing or reduced-motion resolution.
- Recheck VoiceOver labels/order for Home, the Sleep chart summary, tab labels, Coach streaming,
  Connections status, and Quick Add. Performance events must produce no announcements, focus moves,
  haptics, or visible debug UI.
- When VoiceOver is enabled, record it as a separate cohort because accessibility services can alter
  timing. Never disable accessibility behavior merely to improve a number.
- Re-run the CU-091 accessibility checklist after profiling changes.

## Device and simulator limitations

- Prefer at least one supported physical iPhone; simulator CPU/GPU scheduling, host load, keyboard,
  network, thermal behavior, and animation cadence are not representative.
- A dev client, Metro, logging, React Profiler, screen recording, and Instruments each add overhead.
  Record attachments and avoid comparing attached and unattached runs.
- JavaScript spans approximate boundaries; they do not measure native startup, GPU frame pacing,
  bridge/native-module stalls, radio wake-up, backend processing, or what a user visually perceives.
- Mock streaming and mock sync are deterministic UI seams, not evidence of real provider/backend
  latency. Live validation needs an approved private-beta environment.
- Do not extrapolate one modern device baseline to older supported hardware or Android.

## Phase Z private-beta follow-up

During Phase Z, replace this blank baseline table with credential-free PR evidence plus approved
private-beta device results; run release/profile builds with platform tools because CU-092 logs are
correctly absent there. Validate the supported-device matrix, native cold start, frame pacing,
memory, network/backend cohorts, live sync, and real streamed AI separately. Any production
telemetry SDK, remote performance transport, new native profiling module, hard release budget, or
user-linked performance analysis requires explicit architecture/privacy approval and is not
authorized by CU-092.
