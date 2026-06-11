# Phase C — Mobile Shell and Design System

**Plan version:** 1.0  
**Created:** 2026-06-09  
**Scope:** CU-014 through CU-023  
**Optimized for:** Sequential AI coding-agent execution, one commit unit at a time  
**Prerequisite:** Phase B DoD checklist (`plans/phase-b-shared-contracts-health-model-foundations.md §8`)
must be fully green before CU-014 begins.

---

## 1. Phase C Goal and Non-Goals

### Goal

Bootstrap the `apps/mobile` React Native app and the `packages/design-system` shared package
so every subsequent UI commit has a stable, token-driven, accessible, and type-safe foundation
to build on. When Phase C is complete, a future agent can render a real or mock dashboard screen
without inventing colors, spacing, animation constants, or API-call patterns.

Specifically, Phase C delivers:

- A working Expo Dev Client app skeleton (`apps/mobile`) with Expo Router file-based navigation.
- EAS build/update configuration stubs (placeholder credentials only).
- Stable bottom-tab navigation (Home, Sleep, Recovery, Activity, Nutrition, AI Coach).
- A token-driven theme system aligned with the UI/UX spec (Dark Performance + Light Precision,
  6 accent presets, semantic status colors).
- Core UI primitives (Screen, Card, Text, Button, MetricValue, StatusBadge, ProgressBar) that
  every subsequent screen must use.
- Motion primitives and reduced-motion support (React Native Reanimated, `useReducedMotion` hook).
- Chart primitive scaffolds (LineChart, StageTimeline, RingProgress) that accept precomputed data.
- Local state and cache foundations (Zustand stores, TanStack Query client, local dashboard cache).
- A typed API client shell using `@primis/api-contracts` with mock-mode toggle.
- A mock dashboard data provider conforming to `ScoreSnapshotDto` for normal / low-recovery /
  stale-data / missing-data states.

### Non-Goals for Phase C

- No backend routes, Lambda handlers, or API Gateway configuration.
- No database tables, SQL migrations, or ORM schema.
- No provider sync jobs or Google Health connector code.
- No scoring formula implementation.
- No AI gateway, prompt templates, or model calls.
- No real Apple team IDs, real Apple bundle IDs tied to an App Store account, or real
  TestFlight setup.
- No real EAS secrets, push certificates, or App Store Connect credentials.
- No Expo Go assumptions — the app targets Expo Dev Client from day one.
- No ad hoc styles (hard-coded hex colors, magic spacing numbers) once design tokens exist
  (i.e., after CU-017 any new code must use token values).
- No raw provider health payloads in mock data.
- No unredacted personal health data in any committed file.
- No Phase D backend work (CU-024+), even as stubs inside mobile code.

---

## 2. Current Repo State Summary

### 2.1 What Phase A created (CU-001–007)

| Asset                    | Location                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| pnpm workspace           | `pnpm-workspace.yaml` (apps/_, services/_, packages/_, infrastructure/_) |
| Strict TypeScript config | `tsconfig.base.json`                                                     |
| ESLint config            | `.eslintrc.cjs` (v8 legacy format, `@typescript-eslint/recommended`)     |
| Prettier config          | `.prettierrc` / `.prettierignore`                                        |
| Editor config            | `.editorconfig`                                                          |
| Vitest workspace         | `vitest.workspace.ts` (see ADR-0001 — NOT `vitest.config.ts`)            |
| GitHub Actions CI        | `.github/workflows/ci.yml`                                               |
| Environment contract     | `packages/config/src/env.ts` (loadPublicEnv, loadBackendEnv)             |
| Agent instructions       | `.ai-agent-instructions.md`                                              |
| Contribution guide       | `CONTRIBUTING.md`                                                        |
| Docs guide               | `docs/README.md`                                                         |

> **ADR-0001 critical note:** The root Vitest workspace file is `vitest.workspace.ts`, not
> `vitest.config.ts`. This was resolved during CU-005 because `defineWorkspace` returns an array
> that Vite rejects in `vitest.config.ts`. See `docs/decisions/ADR-0001-vitest-workspace-file-name.md`.
> The Phase C `apps/mobile/vitest.config.ts` and `packages/design-system/vitest.config.ts` must use
> `defineConfig` (not `defineWorkspace`), and `vitest.workspace.ts` at the root may need its glob
> updated to include `apps/*/vitest.config.ts`.

### 2.2 What Phase B created (CU-008–013)

| Package                  | Exports                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@primis/core-types`     | `ProviderCode`, `ScoreType`, `ScoreState`, `ScoreConfidence`, `ScoreBand`, `scoreToBand()`, `AiIntent`, `ContextDomain`, `MetricCategory`, `MissingReason`, `DataSensitivityLevel`, `RedactionLevel`                                                                                                                                       |
| `@primis/health-metrics` | `METRIC_DEFINITIONS` registry, `convertUnit()`, unit constants                                                                                                                                                                                                                                                                             |
| `@primis/api-contracts`  | `ApiSuccessResponse`, `ApiErrorResponse`, `makeSuccessResponse`, `makeErrorResponse`, `ApiError`, `ApiErrorCode`, `PaginationMeta`, `ScoreSnapshotDto`, `ScoreSnapshotDtoSchema`, `SCORE_SNAPSHOT_FIXTURE`, `ScoreComponentDto`, `ScoreDriverDto`, `MissingMetricDto`, `ScoreQualityMetadataDto`, `ProviderFreshnessDto`, `BaselineStatus` |
| `@primis/config`         | `loadPublicEnv()`, `loadBackendEnv()`, `PublicEnv`, `BackendEnv`                                                                                                                                                                                                                                                                           |

### 2.3 Current `apps/mobile` and `packages/design-system` state

Both directories exist but contain only `.gitkeep` placeholders:

```text
apps/mobile/.gitkeep
packages/design-system/.gitkeep
```

CU-014 initializes `apps/mobile` as a real Expo Dev Client package.  
CU-017 initializes `packages/design-system` as a real shared package.

### 2.4 Existing ADRs that affect Phase C

| ADR                                      | Relevance                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADR-0001-vitest-workspace-file-name.md` | Workspace config is `vitest.workspace.ts`; all new packages use `vitest.config.ts` with `defineConfig`.                                           |
| `ADR-001-provider-code-naming.md`        | Provider codes are `healthkit`, `health_connect`, `google_health`, etc. Mock data must use these exact strings when referencing provider sources. |
| `ADR-002-ai-intent-count-discrepancy.md` | `AiIntent` has 20 values. If mock AI data references intent types, use values from `@primis/core-types`.                                          |

### 2.5 Relevant conventions

| Convention                    | Rule                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit message format         | `<area>: <short imperative summary> (<CU-ID>)`                                                                                                        |
| Branch naming                 | `cu/<cu-id-lowercase>-<short-name>`                                                                                                                   |
| Valid area prefixes (current) | `repo`, `docs`, `config`, `test`, `ci`, `feat`, `fix`, `refactor`, `chore`                                                                            |
| Area prefix gap               | `mobile:` and `design:` are used in the impl spec but absent from `CONTRIBUTING.md`. CU-014 must add them.                                            |
| Test files                    | `*.test.ts` co-located in `src/` or in a `test/` subdirectory; never `.spec.ts`                                                                       |
| Vitest workspace glob         | `vitest.workspace.ts` currently covers `packages/*/vitest.config.ts` and `services/*/vitest.config.ts`. Must add `apps/*/vitest.config.ts` in CU-014. |
| Secrets policy                | `.env` never committed; `.env.example` with `PLACEHOLDER` values only                                                                                 |
| Data sensitivity              | S1 (user preferences) may be stored locally; S2/S3 health values require encryption or secure storage; S4 secrets never in code                       |

---

## 3. Required Source Documents and Sections

Before implementing any CU in Phase C, the executing agent MUST read the sections listed in the
handoff prompt for that CU **plus** the following baseline reading:

| Priority | Document                                            | Sections to read for Phase C                  | Why                                                                                                               |
| -------- | --------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1        | `primis_full_implementation_spec_commit_plan.md`    | §0–§5, Phase C CU-014–023, §9                 | Commit sequencing authority; commit format; branch naming; verification commands; DoD                             |
| 2        | `primis_mvp_build_plan_milestones.md`               | §0, §0.5, §3.5, §4, §12 (M6)                  | Health-data-model-first constraint; Expo/RN constraints; M6 work items                                            |
| 3        | `primis_technical_architecture_document.md`         | §0, §3.4, §6.1, §7, §8, §18                   | Mobile stack decisions; Expo Dev Client constraint; module structure; env strategy                                |
| 7        | `primis_ui_ux_design_system_spec.md`                | §0, §5–§14                                    | Design tokens; navigation; components; motion; charts; accessibility; loading/empty/stale states                  |
| 8        | `primis_product_requirements_document.md`           | §0, §8, §9 (onboarding/home/theme flows only) | Home IA, user journeys for shell/mock scope only                                                                  |
| 4        | `primis_data_model_health_metric_schema.md`         | §0, §5.4                                      | Data sensitivity levels S0–S4; fixture redaction rules for mock data                                              |
| 5        | `primis_scoring_algorithms_spec.md`                 | §0, §6 (score state/confidence/band), §8.4    | ScoreState, ScoreBand, ScoreConfidence, MissingReason for mock data and score-card props                          |
| 6        | `primis_ai_context_engine_spec.md`                  | §0, §7.2                                      | Safety rules (no raw health data in logs/AI prompts); AiIntent values for mock AI data only                       |
| 9        | `primis_google_health_api_feature_parity_matrix.md` | Skim metric names only                        | Understand future provider metric names when creating mock metric references; do NOT implement Google Health sync |

> Source priority for conflict resolution: spec (1) > milestone plan (2) > TAD (3) > data model (4) > scoring spec (5) > AI spec (6) > UI/UX spec (7) > PRD (8).

---

## 4. Phase C Dependency Graph

Phase C is strictly sequential. Do not start CU-N+1 until CU-N's acceptance criteria and
verification commands all pass.

```text
Phase B complete (CU-001–CU-013, all packages linting/testing green)
  └─> CU-014  apps/mobile initialized (Expo Dev Client, TypeScript, ESLint extended, vitest.workspace.ts updated)
        └─> CU-015  apps/mobile EAS config placeholders (builds on app.config.ts from CU-014)
              └─> CU-016  apps/mobile Expo Router navigation shell (builds on app/ dir from CU-014)
                    └─> CU-017  packages/design-system initialized + theme tokens (ThemeProvider consumes tokens)
                          └─> CU-018  packages/design-system core UI primitives (requires CU-017 tokens)
                                └─> CU-019  packages/design-system motion primitives (requires CU-017 tokens, CU-018 for Pressable/hook)
                                      └─> CU-020  packages/design-system chart scaffolds (requires CU-017 tokens, CU-019 motion awareness)
                                            └─> CU-021  apps/mobile local state + cache foundations (requires CU-016 nav context, CU-017 ThemeProvider)
                                                  └─> CU-022  apps/mobile typed API client shell (requires CU-021 queryClient, @primis/api-contracts)
                                                        └─> CU-023  apps/mobile mock dashboard data provider (requires CU-022 client interface, @primis/api-contracts DTOs)
```

**Package dependency summary for Phase C:**

| Package / App            | New dependencies introduced in Phase C                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`            | `expo`, `expo-dev-client`, `expo-router`, `react-native`, `react`, `react-native-reanimated`, `react-native-gesture-handler`, `@tanstack/react-query`, `zustand`, `react-native-mmkv`, `expo-sqlite`, `@primis/core-types`, `@primis/api-contracts`, `@primis/config`, `@primis/design-system`, `@testing-library/react-native` |
| `packages/design-system` | `react`, `react-native`, `react-native-reanimated`, `react-native-skia`, `@primis/core-types`                                                                                                                                                                                                                                   |

---

## 5. Commit Units

---

### CU-014 — Initialize Expo Dev Client mobile app

**Branch name:** `cu/cu-014-expo-dev-client-init`  
**Commit message:** `mobile: initialize Expo Dev Client app (CU-014)`

#### Goal

Remove `apps/mobile/.gitkeep` and replace it with a fully working Expo Dev Client app skeleton.
The app must use TypeScript, target iOS-first with Android-ready architecture, and be integrated
into the pnpm monorepo workspace, ESLint config, and Vitest workspace.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-014
- `primis_technical_architecture_document.md` §3.4 (EXT-RN-001, EXT-RN-002), §6.1 (mobile stack), §18 (mobile module structure)
- `primis_mvp_build_plan_milestones.md` §3.5, §12 M6-T001
- `primis_ui_ux_design_system_spec.md` §0 (instructions — no ad hoc styles, iOS-first Android-ready)
- Expo Development Builds docs: `https://docs.expo.dev/develop/development-builds/introduction/`

#### Existing repo assets this CU builds on

- `tsconfig.base.json` — extended by `apps/mobile/tsconfig.json`
- `.eslintrc.cjs` — updated with React Native plugins
- `vitest.workspace.ts` — glob updated to include `apps/*/vitest.config.ts`
- `@primis/config` (`loadPublicEnv`) — API base URL in future CUs
- `CONTRIBUTING.md` — add `mobile:` and `design:` area prefixes

#### Files created / edited

```text
apps/mobile/.gitkeep                              DELETE — replaced by real files
apps/mobile/package.json                          CREATE (@primis/mobile)
apps/mobile/app.config.ts                         CREATE (typed Expo config with placeholder IDs)
apps/mobile/tsconfig.json                         CREATE (extends ../../tsconfig.base.json)
apps/mobile/babel.config.js                       CREATE (babel-preset-expo + Reanimated plugin)
apps/mobile/metro.config.js                       CREATE (extends @expo/metro-config)
apps/mobile/vitest.config.ts                      CREATE (defineConfig, node environment — see OQ-001)
apps/mobile/src/.gitkeep                          CREATE (placeholder until CU-016 adds routes)
vitest.workspace.ts                               EDIT (add 'apps/*/vitest.config.ts' to glob)
.eslintrc.cjs                                     EDIT (add react, react-native, react-hooks plugins)
CONTRIBUTING.md                                   EDIT (add mobile: and design: to area prefix table)
```

#### In-scope work

**`apps/mobile/package.json`** shape:

```json
{
  "name": "@primis/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start --dev-client",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx --max-warnings 0",
    "test": "vitest run"
  },
  "dependencies": {
    "expo": "^<latest-stable>",
    "expo-dev-client": "^<latest-stable>",
    "expo-router": "^<latest-stable>",
    "expo-status-bar": "^<latest-stable>",
    "react": "^<peer-version>",
    "react-native": "^<peer-version>",
    "react-native-reanimated": "^3.x",
    "react-native-gesture-handler": "^<latest-stable>",
    "react-native-safe-area-context": "^<latest-stable>",
    "react-native-screens": "^<latest-stable>",
    "@primis/core-types": "workspace:*",
    "@primis/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/react": "^<peer-version>",
    "@types/react-native": "^<peer-version>",
    "@babel/core": "^7.x",
    "babel-preset-expo": "^<latest-stable>",
    "vitest": "^1.x",
    "@testing-library/react-native": "^<latest-stable>",
    "@vitest/coverage-v8": "^1.x"
  }
}
```

> **Version guidance:** Use `pnpm add` to fetch the latest compatible versions rather than
> inventing version numbers. Expo SDK version determines peer constraints for react and
> react-native. Verify Reanimated 3.x is compatible with the chosen Expo SDK version.

**`apps/mobile/app.config.ts`** must:

- Use `ExpoConfig` type from `expo/config`
- Set `name: "Primis"` and `slug: "primis"`
- Set `scheme: "primis"` (required for Expo Router deep linking)
- Set `ios.bundleIdentifier: "PLACEHOLDER_BUNDLE_ID"` with a comment: `// Phase Z: replace with real Apple bundle ID`
- Set `android.package: "PLACEHOLDER_ANDROID_PACKAGE"` with the same comment
- Set `plugins: ["expo-dev-client", "expo-router"]`
- Reference `EXPO_PUBLIC_*` env vars via `process.env` for public config (no secrets)
- Do NOT include any real Apple team ID, real push certificate, or EAS project ID (that is CU-015)

**`apps/mobile/babel.config.js`:**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // MUST be last
  };
};
```

> Reanimated Babel plugin must be listed last.

**`apps/mobile/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "jsx": "react-native",
    "moduleResolution": "bundler",
    "types": ["react", "react-native"]
  },
  "include": ["app", "src", "app.config.ts", "babel.config.js", "metro.config.js"]
}
```

**`vitest.workspace.ts`** update — add `apps/*/vitest.config.ts` to the glob array.

**`apps/mobile/vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

> Use `environment: 'node'` — consistent with all other workspace packages and sufficient for
> Phase C tests (store logic, API error mapping, mock data schema validation, hook utilities).
> RNTL component rendering tests are deferred to Phase G; the runner choice for those tests
> (Vitest vs. Jest/Expo Jest) is documented in OQ-001 and resolved via ADR when first needed.
> Do NOT add `setupFiles` for RNTL here — add only when RNTL tests are introduced.

**`.eslintrc.cjs`** additions:

- Add `eslint-plugin-react` and `eslint-plugin-react-hooks` to devDependencies (root)
- Add `eslint-plugin-react-native` to devDependencies (root)
- Extend with `plugin:react/recommended`, `plugin:react-hooks/recommended`
- Add `settings: { react: { version: 'detect' } }`
- Ensure `.tsx` files are included

**`CONTRIBUTING.md`** — add `mobile:` and `design:` to the area prefix table:

```
mobile  Mobile app code (apps/mobile)
design  Design system code (packages/design-system)
```

#### Out of scope

- EAS credentials, real bundle IDs, TestFlight setup (CU-015)
- Expo Router navigation structure (CU-016)
- Any design tokens, theme, or UI components (CU-017+)
- Any state management, API client, or mock data (CU-021+)
- Local database setup
- Android-specific native configuration

#### Acceptance criteria

- `apps/mobile/package.json` has `"name": "@primis/mobile"` and `"main": "expo-router/entry"`
- `app.config.ts` sets `name: "Primis"`, `scheme: "primis"`, placeholder bundle IDs with comments
- `apps/mobile/tsconfig.json` extends `../../tsconfig.base.json`
- `babel.config.js` includes `react-native-reanimated/plugin` as the last plugin
- `vitest.workspace.ts` now includes `'apps/*/vitest.config.ts'` in the glob
- `pnpm --filter @primis/mobile typecheck` exits with code 0
- `pnpm --filter @primis/mobile lint` exits with code 0
- `pnpm --filter @primis/mobile test` exits with code 0 (may have zero tests; must not fail)
- `pnpm install` succeeds without lockfile conflicts
- No real credentials, Apple team IDs, or real bundle IDs in any committed file
- `CONTRIBUTING.md` lists `mobile:` and `design:` as valid area prefixes

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile lint
pnpm --filter @primis/mobile test
pnpm lint                         # root lint still passes
pnpm typecheck                    # full workspace typecheck still passes
pnpm test                         # full workspace tests still pass
git grep -r "AKIA" .              # should return nothing
git grep -r "sk-" .               # should return nothing
```

#### Likely pitfalls

- **`"main": "expo-router/entry"` is required** for Expo Router file-based routing. Missing this
  causes a blank screen or metro error.
- **Reanimated Babel plugin must be last.** If another plugin follows it, animations will silently
  break.
- **`"moduleResolution": "bundler"`** is already in `tsconfig.base.json` and is correct for Expo.
  Do not change it to `node16` for the mobile app.
- **`apps/mobile/.gitkeep` must be deleted** (or replaced). Git will not auto-delete placeholder
  files on scaffold.
- **ESLint glob must cover `.tsx`** — the root lint script uses `--ext .ts,.tsx,.js,.jsx` which
  should already cover `.tsx`, but verify the `apps/mobile/` path is not in an `ignorePatterns`.
- **`vitest.workspace.ts` glob update** — confirm the updated glob picks up `apps/mobile/vitest.config.ts`
  by running `pnpm test` and checking that the mobile package is included in the workspace run.
- **Do not run `expo init` or `create-expo-app`** — these scaffold tools create files that conflict
  with the monorepo structure. Create the files manually as described.
- **pnpm workspace symlinks** — `@primis/core-types` and `@primis/config` are referenced as
  `workspace:*`. Run `pnpm install` after updating `package.json` to create the symlinks.

#### Questions before implementation

None blocking. Proceed with the assumptions in §11. Flag the mobile test environment decision
(OQ-001) as an ADR task if RNTL component tests require a different runner than Vitest/node.

---

### CU-015 — Add EAS build/update configuration placeholders

**Branch name:** `cu/cu-015-eas-config-placeholders`  
**Commit message:** `mobile: add EAS build and update config placeholders (CU-015)`

#### Goal

Prepare the EAS configuration structure (build profiles, update channels) so future agents and
the founder understand what is needed for real builds — without committing any real Apple or
Google credentials.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-015
- `primis_technical_architecture_document.md` §6.1 (Expo mode: Dev Client / EAS builds)
- `primis_mvp_build_plan_milestones.md` §3.5 (React Native / Expo constraints)
- EAS Build docs: `https://docs.expo.dev/build/introduction/`
- EAS Update docs: `https://docs.expo.dev/eas-update/introduction/`

#### Existing repo assets this CU builds on

- `apps/mobile/app.config.ts` from CU-014
- `apps/mobile/package.json` from CU-014

#### Files created / edited

```text
apps/mobile/eas.json              CREATE (EAS build profiles with placeholder values)
apps/mobile/app.config.ts         EDIT (add updates.url placeholder if using EAS Update)
apps/mobile/README.md             CREATE (EAS/build setup instructions for Phase Z)
```

#### In-scope work

**`apps/mobile/eas.json`:**

```json
{
  "$schema": "https://json.schemastore.org/eas.json",
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "channel": "production",
      "ios": {
        "bundleIdentifier": "PLACEHOLDER_BUNDLE_ID"
      },
      "android": {
        "buildType": "app-bundle",
        "applicationId": "PLACEHOLDER_ANDROID_PACKAGE"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "PLACEHOLDER_APPLE_ID",
        "ascAppId": "PLACEHOLDER_ASC_APP_ID",
        "appleTeamId": "PLACEHOLDER_APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "PLACEHOLDER_GOOGLE_SERVICE_ACCOUNT_KEY"
      }
    }
  }
}
```

> All `PLACEHOLDER_*` values must be replaced manually during Phase Z.

**`apps/mobile/README.md`** must document:

- App name: Primis
- How to run locally: `pnpm --filter @primis/mobile start`
- How to build a dev client: `eas build --profile development --platform ios` (requires Phase Z credentials)
- A clear note: "Real Apple team ID, bundle ID, EAS project ID, and App Store Connect credentials are NOT committed. See Phase Z setup for manual credential configuration."
- The three EAS profiles (development, preview, production) and their purposes
- Update channel strategy: `dev`, `preview`, `production`

**`app.config.ts`** update (if using EAS Update):

- Add `updates: { url: 'PLACEHOLDER_EAS_UPDATE_URL', enabled: true, fallbackToCacheTimeout: 30000 }`
- Add a comment: `// Phase Z: replace with real EAS project ID and update URL`

#### Out of scope

- Real `eas.json` `extra.eas.projectId` (requires EAS account login — Phase Z)
- Real Apple team ID, push key, or provisioning profile
- TestFlight wiring
- CI/CD pipeline for EAS builds (Phase Z)
- Android Play Store submission configuration beyond placeholder

#### Acceptance criteria

- `apps/mobile/eas.json` has three build profiles: `development`, `preview`, `production`
- All real credential fields are `PLACEHOLDER_*` strings
- `apps/mobile/README.md` clearly states "credentials are Phase Z"
- `pnpm --filter @primis/mobile typecheck` exits with code 0 (no TypeScript errors from `app.config.ts` changes)
- No real Apple team ID, real bundle ID, or real EAS project ID appears in any committed file

#### Verification commands

```bash
pnpm --filter @primis/mobile typecheck
grep -r "PLACEHOLDER" apps/mobile/eas.json   # should match all credential fields
grep -r "AKIA\|sk-\|ya29\." apps/mobile/     # should return nothing
```

#### Likely pitfalls

- **`eas.json` schema validation** — EAS CLI may warn about missing `extra.eas.projectId` in
  `app.config.ts`. This is expected and intentional. Do not add a real project ID.
- **Do not run `eas init`** — this command attempts to create a real EAS project and requires
  Expo account login. Create `eas.json` manually with placeholder content.
- **`app.config.ts` must remain valid TypeScript** — validate with `tsc --noEmit` after edits.

#### Questions before implementation

None. Placeholder-only approach is unambiguous.

---

### CU-016 — Add Expo Router navigation shell

**Branch name:** `cu/cu-016-expo-router-nav-shell`  
**Commit message:** `mobile: add tab navigation shell (CU-016)`

#### Goal

Create stable, final tab navigation structure using Expo Router file-based routing. Each tab
renders a placeholder screen. Navigation code must be clean and isolated from business logic.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-016
- `primis_ui_ux_design_system_spec.md` §5 (Information Architecture, navigation principles UX-NAV-001–006)
- `primis_product_requirements_document.md` §8 (product IA: Home, Sleep, Recovery, Activity, Nutrition, AI Coach)
- Expo Router docs: `https://docs.expo.dev/router/introduction/`

#### Existing repo assets this CU builds on

- `apps/mobile/app.config.ts` with `scheme: "primis"` and `plugins: ["expo-router"]`
- `apps/mobile/package.json` with `"main": "expo-router/entry"`

#### Files created / edited

```text
apps/mobile/app/_layout.tsx                  CREATE (root layout, wraps navigation providers)
apps/mobile/app/(tabs)/_layout.tsx           CREATE (tab navigator with 6 tabs)
apps/mobile/app/(tabs)/index.tsx             CREATE (Home tab — placeholder)
apps/mobile/app/(tabs)/sleep.tsx             CREATE (Sleep tab — placeholder)
apps/mobile/app/(tabs)/recovery.tsx          CREATE (Recovery tab — placeholder)
apps/mobile/app/(tabs)/activity.tsx          CREATE (Activity tab — placeholder)
apps/mobile/app/(tabs)/nutrition.tsx         CREATE (Nutrition tab — placeholder)
apps/mobile/app/(tabs)/coach.tsx             CREATE (AI Coach tab — placeholder)
apps/mobile/src/test/setup.ts               SKIP — defer until RNTL component tests are introduced (see OQ-001)
```

#### In-scope work

**`app/_layout.tsx`** root layout:

- Import `Stack` from `expo-router`
- Wrap with `GestureHandlerRootView` from `react-native-gesture-handler`
- Wrap with `SafeAreaProvider` from `react-native-safe-area-context`
- Add `<Stack screenOptions={{ headerShown: false }} />` to hide the default header for the tab layout
- This is where `ThemeProvider` (CU-017) will be inserted later

**`app/(tabs)/_layout.tsx`** tab navigator:

- Import `Tabs` from `expo-router`
- Define 6 tabs in this order: `index` (Home), `sleep`, `recovery`, `activity`, `nutrition`, `coach`
- Tab bar labels: "Home", "Sleep", "Recovery", "Activity", "Nutrition", "AI Coach"
- Tab bar icons: use simple text labels or placeholder icon names until a real icon library is added
- `tabBarStyle` must use `backgroundColor: '#07090D'` only in this one layout file (this is the one
  acceptable pre-token hardcode, flagged with `// TODO(CU-017): replace with theme token`)
- Each tab `href` maps to the correct file name

**Tab screen files** (`index.tsx`, `sleep.tsx`, `recovery.tsx`, `activity.tsx`, `nutrition.tsx`, `coach.tsx`):

Each must:

- Render `<View style={{ flex: 1 }}>` with a centered `<Text>` placeholder:
  e.g., `"Home — placeholder (CU-016)"`
- Import `View` and `Text` from `react-native`
- Add a comment: `// TODO(CU-018): replace with token-driven Screen and Text primitives`
- Contain zero business logic

**Navigation principles enforced:**

- `UX-NAV-001`: Bottom tabs remain stable (no future CU should rearrange them)
- `UX-NAV-002`: Widget customization must not rearrange tabs
- Tab names and order are locked: Home → Sleep → Recovery → Activity → Nutrition → AI Coach

#### Out of scope

- Real tab bar icons (icon library not yet selected; placeholder only)
- Any product logic, data fetching, or score rendering
- ThemeProvider wrapping (CU-017)
- Deep links beyond the root scheme
- Modal/sheet navigation (Phase G)
- Settings, onboarding, or secondary screens

#### Acceptance criteria

- `app/(tabs)/_layout.tsx` defines exactly 6 tabs: Home, Sleep, Recovery, Activity, Nutrition, AI Coach
- Each tab renders a clearly labeled placeholder with zero product logic
- All navigation code is confined to `app/` files; no business logic in route files
- `pnpm --filter @primis/mobile typecheck` exits with code 0
- `pnpm --filter @primis/mobile start` launches without error (Metro bundler starts successfully)
- No hardcoded colors except the one `// TODO(CU-017)` instance in the tab layout
- Tab names match the UI/UX spec §5.1 exactly (case-sensitive): "Home", "Sleep", "Recovery", "Activity", "Nutrition", "AI Coach"

#### Verification commands

```bash
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile lint
pnpm --filter @primis/mobile test
# Visual check:
pnpm --filter @primis/mobile start
# Confirm Metro bundler starts, 6 tabs are visible in simulator
```

#### Likely pitfalls

- **`(tabs)` group syntax** in Expo Router uses a parentheses directory name to define a route
  group. The `(tabs)/` directory does not appear in the URL path. Ensure directory is named
  exactly `(tabs)` not `tabs`.
- **`GestureHandlerRootView` must wrap the entire app**, not just specific screens. Place it at
  the top level in `app/_layout.tsx`.
- **`SafeAreaProvider` must be at the root** for safe-area hooks to work correctly on all screens.
- **Tab order in `_layout.tsx`** is visually rendered in the order the `<Tabs.Screen>` components
  are defined. Ensure the file order matches the spec order.
- **Expo Router `expo-router/entry` entrypoint** means the root `index.js` is auto-generated;
  do not create `apps/mobile/index.js` manually.

---

### CU-017 — Add theme token system

**Branch name:** `cu/cu-017-theme-tokens`  
**Commit message:** `design: add Primis theme tokens (CU-017)`

#### Goal

Initialize the `packages/design-system` package and define the complete Primis token system
(colors, spacing, typography, radius, shadow, accent presets, semantic status colors, motion).
After this CU, no component — in any phase — may use hardcoded style values when a token exists.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-017
- `primis_ui_ux_design_system_spec.md` §8 (theme modes, accent colors, status colors, token examples), §9 (typography scale), §10 (spacing, shape, elevation), §12.2 (motion tokens)
- `primis_technical_architecture_document.md` §6.1 (mobile stack — no ad hoc styles)

#### Existing repo assets this CU builds on

- `tsconfig.base.json` — extended by `packages/design-system/tsconfig.json`
- `vitest.workspace.ts` — already covers `packages/*/vitest.config.ts`
- `packages/core-types` — imports `ScoreBand` for semantic color mapping in token tests
- `packages/design-system/.gitkeep` — DELETE and replace with real package

#### Files created / edited

```text
packages/design-system/.gitkeep                        DELETE
packages/design-system/package.json                    CREATE (@primis/design-system)
packages/design-system/tsconfig.json                   CREATE (extends ../../tsconfig.base.json)
packages/design-system/vitest.config.ts                CREATE (defineConfig, node environment)
packages/design-system/src/tokens/color.ts             CREATE (dark/light/accent/status color tokens)
packages/design-system/src/tokens/spacing.ts           CREATE (4-point grid, all named values)
packages/design-system/src/tokens/typography.ts        CREATE (type scale, font weight, line heights)
packages/design-system/src/tokens/radius.ts            CREATE (radius scale: sm, md, lg, xl, pill, full)
packages/design-system/src/tokens/shadow.ts            CREATE (elevation levels)
packages/design-system/src/tokens/motion.ts            CREATE (duration tokens, easing constants)
packages/design-system/src/theme.ts                    CREATE (ThemeMode, AccentColor, Theme type, createTheme())
packages/design-system/src/tokens/index.ts             CREATE (re-exports all token modules)
packages/design-system/src/index.ts                    CREATE (barrel export)
packages/design-system/test/tokens.test.ts             CREATE (token completeness tests)
apps/mobile/src/providers/ThemeProvider.tsx            CREATE (React context + useTheme hook)
apps/mobile/app/_layout.tsx                            EDIT (wrap with ThemeProvider)
```

#### In-scope work

**`packages/design-system/package.json`:**

```json
{
  "name": "@primis/design-system",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-native": ">=0.73"
  },
  "dependencies": {
    "@primis/core-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^1.x"
  }
}
```

**`src/tokens/color.ts`** — token values sourced from UI/UX Spec §8.5 examples and
the Dark Performance / Light Precision theme descriptions:

- `colors.dark` palette (bg, surface, surfaceElevated, textPrimary, textSecondary, textMuted, borderSubtle, overlay)
- `colors.light` palette (corresponding light values)
- `colors.accent` map: `electricBlue`, `signalGreen`, `violet`, `amber`, `crimson`, `monochrome`
- `colors.status` map: `excellent`, `good`, `caution`, `low`, `attention`, `neutral`

> Exact hex values not fully specified in the source docs — use the spec §8.5 example values as
> a starting point for `dark.*`. For light, status, and accent colors, use reasonable design-system
> values and add a `// TODO(design): finalize color values with founder` comment. Do NOT invent
> colors that contradict the spec intent. Create an ADR task (`// TODO(ADR):`) if a value must
> be chosen without spec guidance.

**`src/tokens/spacing.ts`** — 4-point base grid matching UI/UX Spec §10.1:

```text
xs2: 2, xs: 4, sm: 8, sm2: 12, md: 16, md2: 20, lg: 24, xl: 32, xl2: 40, xl3: 48
```

**`src/tokens/typography.ts`** — semantic scale from UI/UX Spec §9.3:

```text
displayLarge: { fontSize: 40, lineHeight: 46 }
displayMedium: { fontSize: 34, lineHeight: 40 }
titleLarge: { fontSize: 28, lineHeight: 34 }
titleMedium: { fontSize: 22, lineHeight: 28 }
titleSmall: { fontSize: 18, lineHeight: 24 }
bodyLarge: { fontSize: 16, lineHeight: 24 }
bodyMedium: { fontSize: 14, lineHeight: 20 }
bodySmall: { fontSize: 13, lineHeight: 18 }
caption: { fontSize: 12, lineHeight: 16 }
micro: { fontSize: 11, lineHeight: 14 }
```

Plus font weight tokens: `regular: '400'`, `medium: '500'`, `semibold: '600'`, `bold: '700'`.

**`src/tokens/radius.ts`** — matching UI/UX Spec §10.3:

```text
none: 0, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24, pill: 999, full: 9999
```

**`src/tokens/motion.ts`** — motion durations from UI/UX Spec §12.2:

```text
durations: { instant: 80, fast: 140, standard: 220, expressive: 320, slow: 450 }
easings: { standard: 'ease-out', enter: 'ease-out', exit: 'ease-in', emphasis: 'spring' }
```

**`src/theme.ts`** exports:

- `ThemeMode`: `'dark' | 'light'`
- `AccentColor`: `'electricBlue' | 'signalGreen' | 'violet' | 'amber' | 'crimson' | 'monochrome'`
- `Theme` interface: `{ mode: ThemeMode; accent: AccentColor; colors: ResolvedColorTokens; spacing: SpacingTokens; typography: TypographyTokens; radius: RadiusTokens; motion: MotionTokens }`
- `createTheme(mode, accent): Theme` — pure function that returns a resolved Theme object
- `DEFAULT_THEME: Theme` — Dark Performance + Electric Blue preset

**`apps/mobile/src/providers/ThemeProvider.tsx`:**

- `ThemeContext` via `React.createContext`
- `ThemeProvider` component: reads persisted theme from settings store (stub in CU-017;
  wired in CU-021) or defaults to `DEFAULT_THEME`
- `useTheme(): Theme` hook — throws if called outside provider
- Exports `ThemeProvider` and `useTheme`

**`test/tokens.test.ts`** must verify:

- All spacing token keys are present
- All type scale entries have `fontSize` and `lineHeight`
- All radius keys are present
- All dark color keys are defined (not undefined)
- All accent keys are defined
- All status color keys are defined
- `createTheme('dark', 'electricBlue')` returns a valid Theme without throwing

#### Out of scope

- Custom fonts (use system fonts per UI/UX Spec §9.2)
- `ThemeProvider` persisting state (CU-021 adds MMKV-backed settings store)
- Any UI component implementation (CU-018)
- Animation utilities (CU-019)
- Icon library setup

#### Acceptance criteria

- `packages/design-system/package.json` name is `@primis/design-system`
- All 6 token modules exist with correct exports
- `colors.dark.*`, `colors.accent.*`, `colors.status.*` all have named exports matching spec
- `createTheme()` is a pure function — no side effects, no React calls
- `useTheme()` is only in `apps/mobile`; token files have zero React imports
- `pnpm --filter @primis/design-system typecheck` exits with code 0
- `pnpm --filter @primis/design-system test` passes all token tests
- `pnpm --filter @primis/mobile typecheck` exits with code 0 (ThemeProvider compiles cleanly)
- `apps/mobile/app/_layout.tsx` wraps children with `ThemeProvider`
- No hardcoded hex values outside `color.ts`; any new component created after this CU must use tokens

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/design-system typecheck
pnpm --filter @primis/design-system test
pnpm --filter @primis/mobile typecheck
pnpm test   # all workspace tests still pass
```

#### Likely pitfalls

- **`peerDependencies` vs `dependencies`** — React and React Native must be `peerDependencies`
  in `packages/design-system`, not `dependencies`. The consuming app (`@primis/mobile`) provides
  the real React Native runtime.
- **`vitest.config.ts` environment** — the design-system package has no React Native runtime in
  tests. Use `environment: 'node'` for pure token tests. Do NOT use `jsdom` or `react-native`
  environment here since tokens are plain TypeScript objects.
- **`@primis/design-system` in `apps/mobile`** — add `"@primis/design-system": "workspace:*"`
  to `apps/mobile/package.json` dependencies and run `pnpm install`.
- **Color hex values** — the spec provides partial values. Do not invent values that contradict
  the described intent. Use `// TODO(design):` for values requiring founder approval.

---

### CU-018 — Add core UI primitives

**Branch name:** `cu/cu-018-core-ui-primitives`  
**Commit message:** `design: add core UI primitives (CU-018)`

#### Goal

Create the foundational React Native components every future screen must use. All primitives
must be token-driven, accessibility-aware, and have zero hardcoded style values.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-018
- `primis_ui_ux_design_system_spec.md` §11 (component hierarchy, buttons, cards, ScoreCard, progress, MetricTile), §0.1 rule 1 (no ad hoc styles), §0.1 rule 9 (accessibility)
- `primis_technical_architecture_document.md` §18.2 (mobile module structure: primitives layer)
- `@primis/core-types` `ScoreBand` and `ScoreState` for StatusBadge semantic mapping

#### Existing repo assets this CU builds on

- `packages/design-system/src/tokens/` (CU-017) — all components import from here
- `apps/mobile/src/providers/ThemeProvider.tsx` (CU-017) — `useTheme()` hook
- `@primis/core-types` (`ScoreBand`, `ScoreState`)

#### Files created / edited

```text
packages/design-system/src/components/Screen.tsx         CREATE
packages/design-system/src/components/Card.tsx           CREATE
packages/design-system/src/components/Text.tsx           CREATE
packages/design-system/src/components/Button.tsx         CREATE
packages/design-system/src/components/MetricValue.tsx    CREATE
packages/design-system/src/components/StatusBadge.tsx    CREATE
packages/design-system/src/components/ProgressBar.tsx    CREATE
packages/design-system/src/components/index.ts           CREATE (barrel export)
packages/design-system/src/index.ts                      EDIT (add component exports)
packages/design-system/test/components.test.ts           CREATE (prop rendering tests)
apps/mobile/app/(tabs)/index.tsx                         EDIT (replace placeholder with Screen + Text primitives)
apps/mobile/app/(tabs)/sleep.tsx                         EDIT (same)
apps/mobile/app/(tabs)/recovery.tsx                      EDIT (same)
apps/mobile/app/(tabs)/activity.tsx                      EDIT (same)
apps/mobile/app/(tabs)/nutrition.tsx                     EDIT (same)
apps/mobile/app/(tabs)/coach.tsx                         EDIT (same)
```

#### In-scope work

**Component contracts:**

- **`Screen`**: Wraps content in `SafeAreaView` + `ScrollView`. Props: `children`, `style?`.
  Uses `useTheme()` for background color. Handles safe area insets.
- **`Card`**: `View` with surface background, radius, and optional border. Props: `children`,
  `variant?: 'default' | 'elevated'`, `style?`. Uses theme tokens for colors and radius.
- **`Text`**: Wraps React Native `Text`. Props: `variant: keyof typeof typography` (e.g.,
  `'bodyLarge'`, `'titleMedium'`), `color?: 'primary' | 'secondary' | 'muted'`, `children`.
  Uses theme tokens. Supports dynamic type via `allowFontScaling` (default: `true`).
- **`Button`**: Props: `variant: 'primary' | 'secondary' | 'ghost' | 'destructive'`, `label`,
  `onPress`, `disabled?`, `size?: 'sm' | 'md' | 'lg'`. Minimum touch target 44×44pt (`UX-BTN-001`).
  Disabled state must not silently do nothing — show visual indication. Uses theme tokens.
- **`MetricValue`**: Displays a health metric value pair. Props: `value: string | number | null`,
  `unit: string`, `label?: string`, `size?: 'sm' | 'md' | 'lg'`. Renders `null` as `'—'` (em dash).
  Uses tabular-numerals font variant where supported (`UX-TYPE-001`).
- **`StatusBadge`**: Maps a `ScoreBand | ScoreState | 'unknown'` to a semantic color chip. Props:
  `status: ScoreBand | 'available' | 'not_enough_data' | 'stale_data' | 'provisional' | 'unknown'`,
  `label?: string` (auto-generated from status if absent). Always shows label text (not color-only —
  `UX-COLOR-001`).
- **`ProgressBar`**: Props: `value: number` (0–100), `color?: string` (falls back to accent token),
  `height?: number`, `label?: string`, `accessible?: boolean`. Must include `accessibilityValue`
  for screen readers.

**Component rules applied:**

- `UX-COMP-001`: Primitives must not import feature or domain logic.
- All components must accept a `testID` prop for testing.
- All interactive components set `accessibilityRole`, `accessibilityLabel`, and
  `accessibilityState` correctly.
- No `StyleSheet.create()` calls with hardcoded numeric colors — all colors reference
  `useTheme().colors.*` or `theme.colors.*` tokens.

**Tab placeholder screens update:**

Replace `<View><Text>Home — placeholder</Text></View>` with:

```tsx
<Screen>
  <Text variant="titleLarge">Home</Text>
  <Text variant="bodyMedium" color="secondary">
    Placeholder — CU-018
  </Text>
</Screen>
```

This proves the primitive chain works: ThemeProvider → tokens → Screen → Text.

**`test/components.test.ts`:**

- Test that `Text` with each variant renders without throwing
- Test that `Button` with `disabled` renders correctly
- Test that `MetricValue` renders `'—'` for `null` value
- Test that `StatusBadge` renders a label for each status
- Test that `ProgressBar` with value 50 renders without throwing

> Note: component tests in `packages/design-system` run in `node` environment without React
> Native runtime. These tests validate prop handling and rendering logic using lightweight
> stubs. For full RNTL rendering tests, add them in `apps/mobile/` (see OQ-001).

#### Out of scope

- `HeroCard`, `ScoreCard`, `InsightCard`, `ChartCard`, `BedtimeWindowCard` (Phase G)
- Icon component or icon library (deferred — use text-only placeholders)
- Bottom sheet component (Phase G)
- Form inputs (Phase H)
- `ProgressRing` / `ProgressArc` (Phase G or Phase C CU-020 scaffold only)

#### Acceptance criteria

- All 7 primitives exist in `packages/design-system/src/components/`
- All primitives are exported from `packages/design-system/src/index.ts`
- No hardcoded colors — every color value is `useTheme().colors.*` or a token reference
- `MetricValue` renders `'—'` when value is `null`
- `StatusBadge` always renders a text label (not color-only)
- `Button` minimum touch target is `minHeight: 44` enforced in styles
- `pnpm --filter @primis/design-system typecheck` exits with code 0
- `pnpm --filter @primis/design-system test` passes
- `pnpm --filter @primis/mobile typecheck` exits with code 0 (updated placeholder screens compile)

#### Verification commands

```bash
pnpm --filter @primis/design-system typecheck
pnpm --filter @primis/design-system test
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile lint
```

#### Likely pitfalls

- **`useTheme()` in `packages/design-system` components** — `packages/design-system` is a shared
  package. It must NOT import `ThemeProvider` from `apps/mobile`. Instead, accept a `theme: Theme`
  prop or use a lightweight `ThemeContext` defined within `packages/design-system` itself that
  `apps/mobile/src/providers/ThemeProvider.tsx` populates. Alternatively, pass `useTheme()` via
  dependency injection at the component level. **Recommended**: define `ThemeContext` in
  `packages/design-system/src/ThemeContext.tsx` and re-export `useTheme()` from there;
  `apps/mobile/ThemeProvider` provides the context value.
- **React Native components in design-system test env** — `View`, `Text`, etc. require a React
  Native runtime. The design-system `vitest.config.ts` uses `environment: 'node'`, so tests must
  not call `render()` on RN components. Keep tests in `packages/design-system` to pure-logic
  (prop validation, default values, null handling). RNTL rendering tests belong in `apps/mobile`
  and are deferred to Phase G per OQ-001.
- **`accessibilityValue` for ProgressBar** — React Native's accessibility progress representation
  uses `{ min: 0, max: 100, now: value }` format.

---

### CU-019 — Add motion primitives and reduced-motion support

**Branch name:** `cu/cu-019-motion-primitives`  
**Commit message:** `design: add motion primitives and reduced motion handling (CU-019)`

#### Goal

Define reusable, intentional animation constants and helpers using React Native Reanimated.
Provide a `useReducedMotion` hook so every animation checks the system preference.
No animation constant may be scattered in screen files after this CU.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-019
- `primis_ui_ux_design_system_spec.md` §12 (motion philosophy, primitives, transitions, microinteractions, loading states)
- `primis_technical_architecture_document.md` §6.1 (Animation: React Native Reanimated)

#### Existing repo assets this CU builds on

- `packages/design-system/src/tokens/motion.ts` (CU-017) — duration and easing constants
- `packages/design-system/src/components/` (CU-018) — Pressable-equivalent components

#### Files created / edited

```text
packages/design-system/src/motion/timing.ts             CREATE (duration/easing constants re-exported from tokens)
packages/design-system/src/motion/transitions.ts        CREATE (Reanimated animation presets)
packages/design-system/src/motion/useReducedMotion.ts   CREATE (cross-package hook)
packages/design-system/src/motion/index.ts              CREATE (barrel export)
packages/design-system/src/index.ts                     EDIT (add motion exports)
apps/mobile/src/hooks/useReducedMotion.ts               CREATE (re-exports from design-system + mobile-specific override)
packages/design-system/test/motion.test.ts              CREATE (timing constant tests)
```

#### In-scope work

**`src/motion/timing.ts`:**

Re-export and name the token values as animation-ready constants:

```typescript
import { motion as motionTokens } from '../tokens/motion.js';

export const DURATIONS = motionTokens.durations;
export const EASINGS = motionTokens.easings;
```

**`src/motion/transitions.ts`** — Reanimated-based preset builders:

- `cardEnterTransition()`: fade-in + slide-up using `withTiming` with `standard` duration
- `cardPressTransition()`: scale to 0.98 using `withSpring` with low overshoot (per §12.4)
- `screenTransition()`: opacity cross-fade with `fast` duration
- `metricUpdateTransition()`: subtle opacity pulse using `standard` duration

Each function:

- Returns a Reanimated `AnimatedStyle` or `WithTimingConfig` / `WithSpringConfig`
- Checks the `reducedMotion` flag before applying — if true, returns instant values
- Is a pure function (no React hooks called inside)

**`src/motion/useReducedMotion.ts`:**

```typescript
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * Returns true if the user has enabled the "Reduce Motion" system setting.
 * UX-MOTION-005: All animations must respect this preference.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => subscription.remove();
  }, []);

  return reducedMotion;
}
```

**`apps/mobile/src/hooks/useReducedMotion.ts`:**

Re-exports `useReducedMotion` from `@primis/design-system` for convenience in mobile screens.
This indirection allows mobile-specific overrides if needed (e.g., dev build override flag).

**`test/motion.test.ts`** must verify:

- `DURATIONS.standard === 220`
- `DURATIONS.fast === 140`
- `DURATIONS.instant === 80`
- `cardPressTransition()` exists and returns an object without throwing
- `screenTransition()` exists and returns an object without throwing

#### Out of scope

- Actual animations on real screens (those come in Phase G with real content)
- Shared-element transitions (`UX-MOTION-002` explicitly deferred to post-v1)
- Haptic feedback integration
- Pull-to-refresh animation customization (Phase G)

#### Acceptance criteria

- `packages/design-system/src/motion/` exports at minimum: `DURATIONS`, `EASINGS`, `cardEnterTransition`, `cardPressTransition`, `screenTransition`, `metricUpdateTransition`, `useReducedMotion`
- `useReducedMotion` subscribes to `reduceMotionChanged` and unsubscribes on unmount
- All animation durations are sourced from token values, not hard-coded
- `pnpm --filter @primis/design-system typecheck` exits with code 0
- `pnpm --filter @primis/design-system test` passes (motion timing tests)
- `pnpm --filter @primis/mobile typecheck` exits with code 0

#### Verification commands

```bash
pnpm --filter @primis/design-system typecheck
pnpm --filter @primis/design-system test
pnpm --filter @primis/mobile typecheck
```

#### Likely pitfalls

- **Reanimated is a peer dependency** — `packages/design-system/package.json` should list
  `react-native-reanimated` as a `peerDependency`, not a `dependency`. The mobile app
  provides it at runtime. For token tests, Reanimated functions must be mocked.
- **`AccessibilityInfo` in tests** — `AccessibilityInfo.isReduceMotionEnabled` is a native
  module call. Tests that import `useReducedMotion` must mock `react-native`'s
  `AccessibilityInfo` via `vi.mock('react-native', ...)` or test at the hook level in
  `apps/mobile` with RNTL.
- **Reanimated Babel plugin** — already configured in CU-014's `babel.config.js`. No change
  needed in this CU, but verify the plugin is present before testing animations.

---

### CU-020 — Add chart primitives scaffold

**Branch name:** `cu/cu-020-chart-primitives`  
**Commit message:** `design: add chart primitive scaffold (CU-020)`

#### Goal

Define stable chart component APIs that future screen CUs (Phase G) can use directly.
Chart components must accept precomputed chart-ready data — not raw provider payloads.
Placeholder visual implementations are acceptable; the API shape must be stable.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-020
- `primis_ui_ux_design_system_spec.md` §11.8 (chart component list), §13 (data viz: philosophy, types, rules UX-CHART-001–008, labeling §13.4)
- `primis_technical_architecture_document.md` §6.1 (Charts: React Native Skia), ARCH-MOBILE-003 (charts receive chart-ready series, not raw payloads), ARCH-MOBILE-004 (heavy transforms not in render)

#### Existing repo assets this CU builds on

- `packages/design-system/src/tokens/color.ts` and `motion.ts` (CU-017)
- `packages/design-system/src/motion/` (CU-019) — for `useReducedMotion` in chart animations
- `@primis/core-types` — `ScoreBand` for chart color mapping

#### Files created / edited

```text
packages/design-system/src/charts/types.ts              CREATE (shared chart data types)
packages/design-system/src/charts/LineChart.tsx          CREATE (line chart scaffold)
packages/design-system/src/charts/StageTimeline.tsx      CREATE (sleep stage horizontal chart)
packages/design-system/src/charts/RingProgress.tsx       CREATE (original progress ring, NOT Apple rings clone)
packages/design-system/src/charts/index.ts              CREATE (barrel export)
packages/design-system/src/index.ts                     EDIT (add charts export)
packages/design-system/test/charts.test.ts              CREATE (type contract and prop validation tests)
```

#### In-scope work

**`src/charts/types.ts`** — precomputed data contracts:

```typescript
/** A single data point on a time-series chart. */
export interface ChartPoint {
  /** Unix timestamp (ms) or date string (YYYY-MM-DD). */
  readonly x: number | string;
  /** Y-axis value; null represents a missing/gap data point. */
  readonly y: number | null;
  /** Optional label for tooltip or selection focus. */
  readonly label?: string;
}

/** A contiguous sleep stage segment. */
export interface SleepStageSegment {
  readonly stage: 'awake' | 'light' | 'deep' | 'rem';
  readonly startMs: number;
  readonly endMs: number;
}

/** Props for a precomputed ring progress value. */
export interface RingProgressData {
  /** Value 0–100 (progress percentage). */
  readonly value: number;
  /** Label displayed in center or beside the ring. */
  readonly label: string;
  /** Optional sublabel (e.g., unit or goal text). */
  readonly sublabel?: string;
}

/** Loading/empty/error states for chart components. */
export type ChartState = 'loading' | 'empty' | 'error' | 'data';
```

**`src/charts/LineChart.tsx`** props:

- `data: ChartPoint[]` — precomputed series (ARCH-MOBILE-003)
- `unit: string` — y-axis unit label (UX-CHART-003)
- `timeRange: string` — display label e.g. `"7 days"` (UX-CHART-003)
- `baselineBand?: { min: number; max: number }` — optional baseline shading (UX-CHART-004)
- `state: ChartState` — loading/empty/data/error
- `reducedMotion?: boolean` — skips entry animation if true
- Placeholder implementation: render a `View` with dimensions, labeled axes using `Text`, and
  placeholder dots. Add `// TODO(Phase G): replace with React Native Skia implementation`

**`src/charts/StageTimeline.tsx`** props:

- `segments: SleepStageSegment[]`
- `totalDurationMs: number`
- `state: ChartState`
- `reducedMotion?: boolean`
- Placeholder: render colored `View` blocks proportional to segment duration

**`src/charts/RingProgress.tsx`** props:

- `data: RingProgressData`
- `state: ChartState`
- `size?: number` (diameter in dp)
- `strokeWidth?: number`
- `color?: string` (defaults to accent token)
- Placeholder: render `View` with border-radius circle + centered `Text` value
- Add `// TODO(Phase G): replace with React Native Skia arc implementation`
- Must be visually distinct from Apple Activity Rings (no concentric multi-ring layout in Phase C)

**Chart rules enforced in scaffold:**

- `UX-CHART-001`: Charts must accept both `dark` and `light` theme via `useTheme()`
- `UX-CHART-005`: Color must not be the only indicator — all charts include text labels
- `UX-CHART-007`: `null` values in `ChartPoint.y` are rendered as visual gaps, not interpolated
- `UX-EMPTY-001/002`: `state: 'empty'` renders an explanatory message, not a blank chart frame

**`test/charts.test.ts`** must verify:

- `ChartPoint` type compiles with `y: null`
- `SleepStageSegment` stage values cover all 4 sleep stages
- `LineChart` with `state: 'loading'` renders without throwing
- `RingProgress` with `value: 75` renders without throwing

#### Out of scope

- React Native Skia GPU-rendered chart implementations (Phase G — these are placeholders)
- `AreaChart`, `BarChart`, `StackedBarChart`, `ZoneChart`, `Sparkline` (Phase G screens define need)
- Real chart interaction (drag-to-inspect, tap-to-focus) — Phase G
- Chart animation with Reanimated (beyond noting `reducedMotion` prop)

#### Acceptance criteria

- `ChartPoint.y` accepts `null` (missing data gap)
- `state: 'loading'` on any chart renders a visible loading indicator, not a blank frame
- `state: 'empty'` renders an explanatory message (not a blank/spinner)
- `RingProgress` is visually distinct from Apple Activity Rings (no concentric multi-ring pattern)
- Charts accept `unit` and `timeRange` props and render labels (`UX-CHART-003`)
- All chart components are exported from `packages/design-system/src/index.ts`
- `pnpm --filter @primis/design-system typecheck` exits with code 0
- `pnpm --filter @primis/design-system test` passes

#### Verification commands

```bash
pnpm --filter @primis/design-system typecheck
pnpm --filter @primis/design-system test
```

#### Likely pitfalls

- **Do not implement Skia in CU-020.** The Skia dependency requires native build. The chart
  scaffold must compile and pass typecheck without Skia being fully configured. Add Skia as a
  dependency comment with `// TODO(Phase G): add react-native-skia`.
- **Prop naming stability** — the `data`, `unit`, `timeRange`, `state` prop names will be used
  by Phase G screens. Changing them later is a breaking change across many files. Choose names
  carefully and document them clearly.
- **`null` in `ChartPoint.y`** is a deliberate design choice per `UX-CHART-007`. Ensure the
  TypeScript type explicitly allows it; do not use `number | undefined`.

---

### CU-021 — Add mobile local state and cache foundations

**Branch name:** `cu/cu-021-local-state-cache`  
**Commit message:** `mobile: add local state and cache foundations (CU-021)`

#### Goal

Configure TanStack Query, Zustand-based local UI state stores (settings, widget order), and
a local dashboard cache abstraction so the Home screen (Phase G) can render instantly from
cached data. No health metric values are stored in plain local storage.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-021
- `primis_technical_architecture_document.md` §6.1 (TanStack Query, MMKV, SQLite), ARCH-MOBILE-001 (Home renders from cached snapshot), ARCH-MOBILE-002 (stale-while-revalidate)
- `primis_ui_ux_design_system_spec.md` §12.5 (loading states: cached content preferred), §14 (customizable Home)
- `primis_data_model_health_metric_schema.md` §5.4 (data sensitivity S1–S4)

#### Existing repo assets this CU builds on

- `apps/mobile/app/(tabs)/index.tsx` (CU-016) — Home screen will use queryClient
- `apps/mobile/src/providers/ThemeProvider.tsx` (CU-017) — co-located providers pattern
- `@primis/config` `loadPublicEnv()` — APP_ENV for cache TTL decisions
- `@primis/api-contracts` `ScoreSnapshotDto` — shape of cached dashboard snapshots

#### Files created / edited

```text
apps/mobile/src/state/settingsStore.ts            CREATE (Zustand store, MMKV-persisted, S1 data only)
apps/mobile/src/state/widgetStore.ts              CREATE (Zustand store, widget order + visibility)
apps/mobile/src/api/queryClient.ts               CREATE (TanStack Query client with default options)
apps/mobile/src/cache/localDashboardCache.ts     CREATE (SQLite-backed dashboard snapshot cache)
apps/mobile/app/_layout.tsx                      EDIT (wrap with QueryClientProvider)
apps/mobile/package.json                         EDIT (add @tanstack/react-query, zustand, react-native-mmkv, expo-sqlite)
apps/mobile/src/state/index.ts                   CREATE (barrel export)
apps/mobile/test/settingsStore.test.ts           CREATE (store action and selector tests)
```

#### In-scope work

**`src/state/settingsStore.ts`** — persisted S1 user preferences (safe to store locally):

```typescript
interface SettingsState {
  themeMode: 'dark' | 'light' | 'system';
  accentColor: AccentColor; // from @primis/design-system
  coachTone: string; // placeholder string; values defined in Phase I
  summaryTone: string; // placeholder string; values defined in Phase I
  onboardingComplete: boolean;
}
```

- Use Zustand with `create`
- Persist via `react-native-mmkv` (fast key-value, S1 data only)
- Use `zustand/middleware persist` adapter for MMKV
- Do NOT store any health metric values or score values here (those are S2–S3)

**`src/state/widgetStore.ts`** — Home widget visibility and order:

```typescript
interface WidgetState {
  widgetOrder: string[]; // widget IDs in display order
  hiddenWidgets: Set<string>; // widget IDs that are toggled off
}
```

- Persist via MMKV (S1 data — widget layout preferences are user preferences, not health data)
- Actions: `setWidgetOrder(ids: string[])`, `toggleWidget(id: string)`
- Default widget order matches UI/UX spec §6.1.2 default Home widgets

**`src/api/queryClient.ts`** — TanStack Query client:

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false, // React Native has no browser window
    },
  },
});
```

**`src/cache/localDashboardCache.ts`** — SQLite-backed precomputed dashboard snapshot cache:

- Uses `expo-sqlite` to store the latest resolved dashboard snapshot
- Schema (single table): `dashboard_cache (id TEXT PRIMARY KEY, data TEXT, cached_at INTEGER)`
- Methods: `saveDashboardSnapshot(key: string, snapshot: unknown): Promise<void>`,
  `getDashboardSnapshot(key: string): Promise<unknown | null>`,
  `clearDashboardCache(): Promise<void>`
- Data stored as JSON strings; the `snapshot` parameter is typed as `unknown` in Phase C
  (will be narrowed to real DTO types in Phase G)
- **Security note**: Do not store raw provider payloads or personal identifiers in this cache.
  Only store precomputed/aggregated dashboard data (S2 sensitivity at most). Future phases
  may add encryption if needed. Add a comment: `// TODO(ADR): evaluate SQLite encryption if
cache stores S3 data in Phase G`
- No real health data is cached in Phase C (mock data only flows in CU-023)

**`app/_layout.tsx`** update:

Wrap existing providers with `<QueryClientProvider client={queryClient}>`.

Provider nesting order (outer to inner):

1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `ThemeProvider`
4. `QueryClientProvider`
5. `<Stack>`

**`test/settingsStore.test.ts`:**

- Test `themeMode` defaults to `'dark'`
- Test `accentColor` defaults to `'electricBlue'`
- Test `setWidgetOrder` updates the order
- Test `toggleWidget` adds/removes from hidden set
- Mock MMKV to avoid native module in tests

#### Out of scope

- Real SQLite encryption (evaluate in Phase G/J)
- WatermelonDB (over-engineering at this stage; plain Expo SQLite is sufficient)
- Persisting score history or raw provider observations locally
- React Query Devtools (add in Phase G for debugging)
- Auth token storage (Phase D — use SecureStore/Keychain when auth is implemented)
- Real settings UI (Phase G)

#### Acceptance criteria

- `settingsStore` holds only S1 data (theme, accent, coach/summary tone stubs, onboarding flag)
- `widgetStore` default order matches UI/UX spec §6.1.2 default widget list
- TanStack Query client has `staleTime`, `gcTime`, `retry`, and `refetchOnWindowFocus: false`
- `localDashboardCache` has `save`, `get`, and `clear` methods backed by SQLite
- `QueryClientProvider` wraps the navigation stack in `app/_layout.tsx`
- `pnpm --filter @primis/mobile typecheck` exits with code 0
- `pnpm --filter @primis/mobile test` passes (store tests with MMKV mocked)
- No health metric values or score raw values stored in Zustand or MMKV

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile test
pnpm --filter @primis/mobile lint
```

#### Likely pitfalls

- **MMKV native module in tests** — `react-native-mmkv` requires native build. Tests must mock
  MMKV via `vi.mock('react-native-mmkv', ...)`. Provide a simple in-memory mock.
- **`expo-sqlite` async API** — `expo-sqlite` v12+ uses `openDatabaseAsync` (async). Ensure
  `localDashboardCache` handles the async initialization correctly (singleton open pattern).
- **`Set` in Zustand persist** — JavaScript `Set` does not serialize to JSON by default.
  Convert to/from array in the persist storage layer.
- **`refetchOnWindowFocus: false`** is required for React Native — the default `true` value
  causes unnecessary refetches on Android app foreground events.
- **Zustand v4/v5 API** — confirm the Zustand version before using `create`; v5 changed the
  API slightly. Use the version compatible with `react-native-mmkv` zustand middleware.

---

### CU-022 — Add typed API client shell

**Branch name:** `cu/cu-022-api-client-shell`  
**Commit message:** `mobile: add typed API client shell (CU-022)`

#### Goal

Centralize all mobile HTTP calls behind a typed client that uses `@primis/api-contracts` error
and response shapes. Provide a mock mode toggle so CU-023 mock data can substitute the real
API during local development. Support auth token injection without implementing auth yet.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-022
- `primis_technical_architecture_document.md` §6.1 (API boundaries), ARCH-CODE-006 (shared DTO schemas)
- `primis_mvp_build_plan_milestones.md` §12 M6-T005 (API/client cache foundation)
- `@primis/api-contracts` `ApiSuccessResponse`, `ApiErrorResponse`, `ApiErrorCode`, `ApiError`

#### Existing repo assets this CU builds on

- `apps/mobile/src/api/queryClient.ts` (CU-021) — client integrated with TanStack Query
- `@primis/api-contracts` — `ApiSuccessResponse`, `ApiErrorCode`, `makeErrorResponse`
- `@primis/config` `loadPublicEnv()` — API base URL from `EXPO_PUBLIC_API_BASE_URL`
- `.env.example` — add `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`

#### Files created / edited

```text
apps/mobile/src/api/client.ts              CREATE (typed fetch wrapper)
apps/mobile/src/api/errors.ts             CREATE (error mapping to ApiError)
apps/mobile/src/api/endpoints.ts          CREATE (named endpoint constants)
apps/mobile/src/api/index.ts              CREATE (barrel export)
apps/mobile/test/api/client.test.ts       CREATE (unit tests for error handling and mock mode)
.env.example                              EDIT (add EXPO_PUBLIC_API_BASE_URL placeholder)
```

#### In-scope work

**`src/api/client.ts`** structure:

```typescript
interface ApiClientConfig {
  baseUrl: string;
  mockMode: boolean;           // true = skip real fetch, throw MissingMockError
  getAuthToken?: () => Promise<string | null>;  // Phase D — stub returns null
}

/**
 * Typed API client for @primis/mobile.
 * Uses @primis/api-contracts envelope shapes for all responses.
 */
export class PrimisApiClient {
  constructor(config: ApiClientConfig) { ... }

  async get<T>(path: string, options?: RequestInit): Promise<T>;
  async post<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  // ... patch, delete as needed

  // Injects auth token into headers if getAuthToken() returns a value (Phase D).
  // In Phase C: getAuthToken always returns null.
}

/** Singleton client configured from env vars. */
export const apiClient: PrimisApiClient;
```

- `baseUrl` comes from `loadPublicEnv().EXPO_PUBLIC_API_BASE_URL` (add this var to `PublicEnvSchema` in `@primis/config`)
- `mockMode` defaults to `true` in `NODE_ENV !== 'production'` or reads `EXPO_PUBLIC_MOCK_MODE`
- Auth token injection stub: `getAuthToken` is accepted in config but defaults to `() => Promise.resolve(null)`
- Response parsing maps the backend `ApiSuccessResponse<T>` envelope to `T` (extracts `data` field)
- Non-2xx responses throw a mapped `ApiClientError` (see `errors.ts`)

**`src/api/errors.ts`:**

```typescript
import type { ApiErrorCode } from '@primis/api-contracts';

/** Mobile-side API error with the backend ApiErrorCode preserved. */
export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly message: string,
    public readonly status: number,
  ) { super(message); this.name = 'ApiClientError'; }
}

/**
 * Parse a backend error response body into an ApiClientError.
 * Falls back to UNKNOWN_ERROR if the response body does not match the contract.
 */
export function parseApiError(status: number, body: unknown): ApiClientError { ... }
```

**`src/api/endpoints.ts`:**

Named endpoint path constants (Phase C: only dashboard endpoint listed):

```typescript
export const API_ENDPOINTS = {
  HEALTH: '/health',
  DASHBOARD: '/v1/dashboard', // Phase D backend provides this
  SCORE_SNAPSHOT: '/v1/scores/:type', // Phase D
} as const;
```

**Mock mode behavior:**

When `mockMode: true`, `apiClient.get(endpoint)` should throw a `MockModeError` (or return a
sentinel) to signal that the caller should use mock data instead. CU-023 will add the mock data
provider that intercepts these calls.

**`.env.example`** additions:

```bash
# --- Mobile API (Expo public — safe to bundle in app) ---
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_MOCK_MODE=true
```

**`@primis/config` update** — `loadPublicEnv()` must include `EXPO_PUBLIC_API_BASE_URL`:

```typescript
const publicEnvSchema = z.object({
  NODE_ENV: ...,
  APP_ENV: ...,
  EXPO_PUBLIC_API_BASE_URL: z.string().url().optional().default('http://localhost:3000'),
  EXPO_PUBLIC_MOCK_MODE: z.string().optional().default('true'),
});
```

> **Note:** `EXPO_PUBLIC_*` prefix is required for Expo to inline the variable into the mobile
> bundle at build time. Only safe-to-expose values should use this prefix.

**`test/api/client.test.ts`:**

- Test that `ApiClientError` is thrown for non-2xx responses
- Test that `parseApiError` returns `ApiClientError` with correct `code` and `status`
- Test that `mockMode: true` prevents real fetch calls (mock global `fetch`)
- Test that error messages are descriptive for common HTTP status codes (400, 401, 404, 500)

#### Out of scope

- Real JWT auth token injection (Phase D — Cognito integration)
- Refresh token logic
- Request retries beyond what TanStack Query handles
- Websocket or streaming endpoints
- Request signing (Phase Z — AWS SigV4 if ever needed)

#### Acceptance criteria

- `apiClient.get` and `apiClient.post` are generic typed methods
- All API responses use `@primis/api-contracts` envelope shapes
- `ApiClientError` carries `ApiErrorCode` from `@primis/api-contracts`
- API base URL comes from `loadPublicEnv()` — NOT hardcoded
- Mock mode is enabled by default in development (`EXPO_PUBLIC_MOCK_MODE=true`)
- Auth token injection point exists (stub returns `null` in Phase C)
- `pnpm --filter @primis/mobile test` passes including API client tests
- `pnpm --filter @primis/mobile typecheck` exits with code 0
- `pnpm --filter @primis/config typecheck` exits with code 0 (publicEnv schema updated)
- `pnpm --filter @primis/config test` passes (updated schema tests)

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/config typecheck
pnpm --filter @primis/config test
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile test
pnpm --filter @primis/mobile lint
```

#### Likely pitfalls

- **`EXPO_PUBLIC_*` vars must be set at build time.** Expo inlines these during Metro bundling.
  They are NOT available as runtime `process.env` in production; they are embedded into the
  bundle. Ensure `loadPublicEnv()` is called at module init time, not inside a render function.
- **`fetch` in React Native** is the global `fetch` API (polyfilled by Expo). Do not import
  `node-fetch` or any Node.js HTTP module.
- **Updating `@primis/config` publicEnvSchema** — this is a shared package. Any changes to the
  public env schema must still pass `pnpm --filter @primis/config test`. Update the existing
  tests to include the new env vars.
- **`ApiClientError` must not log raw health data.** If parsing a response body for the error
  message, do not include raw health observation payloads in error messages or logs.

---

### CU-023 — Add mock dashboard data provider

**Branch name:** `cu/cu-023-mock-dashboard-data`  
**Commit message:** `mobile: add mock health dashboard data provider (CU-023)`

#### Goal

Create structured mock data fixtures that conform to `@primis/api-contracts` DTOs, covering
four distinct dashboard states: normal (healthy day), low recovery, stale data, and missing data.
Mock data must be clearly marked as development-only and must never contain raw provider payloads
or real personal health data.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase C CU-023
- `primis_product_requirements_document.md` §8 (Home IA — widget content expectations)
- `primis_ui_ux_design_system_spec.md` §6.1 (Home widgets), §7 (provisional/stale/empty states)
- `primis_scoring_algorithms_spec.md` §6 (ScoreState, ScoreConfidence, ScoreBand values)
- `@primis/api-contracts` `ScoreSnapshotDto`, `SCORE_SNAPSHOT_FIXTURE`
- `@primis/core-types` `ScoreType`, `ScoreState`, `ScoreConfidence`, `ScoreBand`

#### Existing repo assets this CU builds on

- `@primis/api-contracts` `ScoreSnapshotDto`, `ScoreSnapshotDtoSchema`, `SCORE_SNAPSHOT_FIXTURE`
- `apps/mobile/src/api/client.ts` (CU-022) — `mockMode` toggle
- `apps/mobile/src/api/queryClient.ts` (CU-021) — TanStack Query for consuming mock data

#### Files created / edited

```text
apps/mobile/src/mocks/dashboard.ts           CREATE (mock dashboard response: all 4 states)
apps/mobile/src/mocks/sleep.ts               CREATE (sleep ScoreSnapshotDto mocks)
apps/mobile/src/mocks/recovery.ts            CREATE (recovery ScoreSnapshotDto mocks)
apps/mobile/src/mocks/activity.ts            CREATE (activity metric mocks)
apps/mobile/src/mocks/ai.ts                  CREATE (mock AI summary/coach data)
apps/mobile/src/mocks/index.ts               CREATE (barrel export)
apps/mobile/src/mocks/README.md              CREATE (mock mode documentation)
apps/mobile/test/mocks/dashboard.test.ts     CREATE (schema validation tests)
```

#### In-scope work

**Four mock dashboard states (required by spec):**

All mock `ScoreSnapshotDto` objects must pass `ScoreSnapshotDtoSchema.parse()`.

```typescript
/** State 1: Normal day — good recovery, good sleep, active. */
export const MOCK_NORMAL: MockDashboard;

/** State 2: Low recovery — poor HRV/resting HR, low score. */
export const MOCK_LOW_RECOVERY: MockDashboard;

/** State 3: Stale data — data present but sync is >12 hours old. */
export const MOCK_STALE_DATA: MockDashboard;

/** State 4: Missing data — insufficient data for scores (new user). */
export const MOCK_MISSING_DATA: MockDashboard;
```

**`MockDashboard` shape:**

```typescript
interface MockDashboard {
  readonly recoveryScore: ScoreSnapshotDto;
  readonly sleepScore: ScoreSnapshotDto;
  readonly activitySummary: MockActivitySummary;
  readonly aiSummary: MockAiSummary;
  readonly providerSyncStatus: MockSyncStatus;
}
```

**Mock data requirements per state:**

| State        | recoveryScore.state | recoveryScore.value | sleepScore.state           | activitySummary      |
| ------------ | ------------------- | ------------------- | -------------------------- | -------------------- |
| Normal       | `'available'`       | 82                  | `'available'` (78)         | 7500 steps, 450 kcal |
| Low Recovery | `'available'`       | 34 (very_low band)  | `'available'` (65)         | 5200 steps, 340 kcal |
| Stale Data   | `'stale_data'`      | null                | `'stale_data'` (null)      | N/A (stale)          |
| Missing Data | `'not_enough_data'` | null                | `'not_enough_data'` (null) | zero/unknown         |

**Specific requirements for each state:**

- **Normal**: `confidence: 'high'`, `band: 'good'`, at least 2 `topDrivers` with `direction: 'positive'`
- **Low Recovery**: `confidence: 'medium'`, `band: 'very_low'`, at least 1 driver with `direction: 'negative'`
  and `magnitude: 'major'`, at least 1 `missingMetrics` entry (e.g., `hrv_rmssd`)
- **Stale Data**: `state: 'stale_data'`, `value: null`, `band: null`, `confidence: 'unknown'`,
  `components: []`, `missingMetrics: [{ metricCode: 'sync_timestamp', reason: 'sync_gap', isRequired: false }]`
  — Note: use a valid `MissingReason` from `@primis/core-types`
- **Missing Data**: `state: 'not_enough_data'`, `value: null`, `band: null`, `confidence: 'unknown'`,
  `components: []`, `topDrivers: []`, `missingMetrics` with `isRequired: true`

**Mock AI summary shape** (`MockAiSummary`):

```typescript
interface MockAiSummary {
  readonly intent: AiIntent; // from @primis/core-types
  readonly summary: string; // 1–2 sentence plain text
  readonly isMock: true; // must be literally `true` — development-only guard
}
```

> `isMock: true` is a compile-time and runtime guard. Any code that consumes `MockAiSummary`
> must check `isMock` before rendering in a non-dev context.

**Safety rules for mock data:**

- Metric codes (e.g., `'hrv_rmssd'`, `'resting_hr'`) must use canonical codes from
  `@primis/health-metrics` `METRIC_DEFINITIONS` — do NOT invent new codes
- Score values on 0–100 scale are synthetic (not real personal health data)
- No real user IDs, email addresses, device identifiers, or OAuth tokens
- No raw provider API response structures (no Fitbit/Google Health payloads embedded)
- `localDate` in all fixtures: use `'2026-01-15'` (clearly synthetic/historical)

**`src/mocks/README.md`** must state:

```markdown
# Mock Data (Development Only)

These files are DEVELOPMENT ONLY. Mock data is used when EXPO_PUBLIC_MOCK_MODE=true.

Mock data conforms to @primis/api-contracts DTO schemas. It must NEVER contain:

- Real user data, health observations, or OAuth tokens
- Raw provider API payloads
- Production-like user IDs or identifiers

Do not enable mock mode in production builds. See apps/mobile/src/api/client.ts for
the mock mode toggle.
```

**`test/mocks/dashboard.test.ts`:**

- `ScoreSnapshotDtoSchema.parse(MOCK_NORMAL.recoveryScore)` passes
- `ScoreSnapshotDtoSchema.parse(MOCK_LOW_RECOVERY.recoveryScore)` passes
- `ScoreSnapshotDtoSchema.parse(MOCK_STALE_DATA.recoveryScore)` passes
- `ScoreSnapshotDtoSchema.parse(MOCK_MISSING_DATA.recoveryScore)` passes
- `MOCK_STALE_DATA.recoveryScore.value === null` (stale data must have null value)
- `MOCK_MISSING_DATA.recoveryScore.value === null` (missing data must have null value)
- `MOCK_NORMAL.aiSummary.isMock === true`

#### Out of scope

- Mock data for Vitals, Body Composition, Nutrition, Bedtime Planner (Phase G introduces these screens)
- Real API integration with backend (Phase D)
- Provider sync mock beyond `providerSyncStatus` stub
- Realistic date-series chart mock data (Phase G, when `LineChart` is implemented with Skia)
- MSW (Mock Service Worker) integration for intercepting HTTP in development — optional Phase G enhancement

#### Acceptance criteria

- All 4 mock states (`MOCK_NORMAL`, `MOCK_LOW_RECOVERY`, `MOCK_STALE_DATA`, `MOCK_MISSING_DATA`) are exported
- All mock `ScoreSnapshotDto` objects pass `ScoreSnapshotDtoSchema.parse()` in tests
- Stale and missing data states have `value: null` and `band: null`
- `MOCK_*.aiSummary.isMock === true` is a literal `true` type, not just `boolean`
- All metric codes used in mocks exist in `METRIC_DEFINITIONS` from `@primis/health-metrics`
- `src/mocks/README.md` clearly states mocks are development-only
- No real personal data, OAuth tokens, or raw provider payloads in any mock file
- `pnpm --filter @primis/mobile test` passes all mock validation tests
- `pnpm --filter @primis/mobile typecheck` exits with code 0

#### Verification commands

```bash
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile test
pnpm --filter @primis/mobile lint
# Secret scan:
git grep -r "sk-\|AKIA\|ya29\." apps/mobile/src/mocks/
# Should return nothing
```

#### Likely pitfalls

- **`MissingReason` values must match `@primis/core-types`** — do not invent new reason strings.
  Check `packages/core-types/src/metrics.ts` for the `MISSING_REASONS` constant.
- **`localDate` format must be `YYYY-MM-DD`** per `ScoreSnapshotDtoSchema` regex constraint.
  Use `'2026-01-15'` or another clearly synthetic historical date.
- **`algorithmVersion`** must be a non-empty string — use `'1.0.0'` in all fixtures.
- **`isMock: true` as literal type** — declare `isMock: true` as `as const` to preserve the
  literal type through TypeScript.

---

## 6. Phase-Level Guardrails

These guardrails apply to EVERY CU in Phase C. An agent must verify each one before committing.

| Guardrail                      | Rule                                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No backend routes              | Do not create Express routes, Lambda handlers, or API Gateway endpoints.                                                                                                                                                                       |
| No database migrations         | Do not create SQL DDL, ORM schema files, or migration scripts.                                                                                                                                                                                 |
| No provider sync               | Do not implement Google Health, Fitbit, HealthKit, or Health Connect connectors.                                                                                                                                                               |
| No scoring formulas            | Do not implement scoring algorithms, baseline calculations, or data-quality formulas.                                                                                                                                                          |
| No AI provider calls           | Do not call OpenAI, Anthropic, or any LLM API. Do not write AI prompts.                                                                                                                                                                        |
| No real Apple credentials      | `eas.json`, `app.config.ts`, and all source files must contain only `PLACEHOLDER_*` strings for Apple team ID, bundle ID, push cert, and App Store Connect keys.                                                                               |
| No real EAS project ID         | Do not run `eas init` or commit a real EAS project ID.                                                                                                                                                                                         |
| No Expo Go assumptions         | The app must target Expo Dev Client. No code should assume Expo Go compatibility.                                                                                                                                                              |
| No raw health payloads         | No mock file, test fixture, or source file may contain raw provider API payloads (Google Health, Fitbit, HealthKit, Health Connect, Hume).                                                                                                     |
| No unredacted personal data    | No real user IDs, email addresses, device identifiers, or OAuth tokens may be committed.                                                                                                                                                       |
| No ad hoc styles after CU-017  | Once design tokens exist (after CU-017 is merged), every new component or screen must use token values. No hardcoded hex colors or magic spacing numbers. The one `// TODO(CU-017)` placeholder in CU-016 may remain until CU-018 replaces it. |
| No secrets in `.env`           | `.env` and `.env.local` must not be committed. `.env.example` contains only `PLACEHOLDER` values.                                                                                                                                              |
| No S4 data in any file         | OAuth tokens, API keys, push certificates, and signing credentials must never appear in source code, config files, or comments.                                                                                                                |
| Mock data is dev-only          | All mock data files must have `isMock: true` guards and `README.md` disclaimers.                                                                                                                                                               |
| DTOs must validate             | All mock `ScoreSnapshotDto` objects must pass `ScoreSnapshotDtoSchema.parse()` in tests — no ad hoc type assertions to skip validation.                                                                                                        |
| Metric codes must be canonical | Any metric code referenced in mocks or UI must exist in `METRIC_DEFINITIONS` from `@primis/health-metrics`.                                                                                                                                    |

**Standard secret-scan commands to run before each commit:**

```bash
git grep -r "sk-" .              # no OpenAI-format keys
git grep -r "AKIA" .             # no AWS access key IDs
git grep -r "ya29\." .           # no Google OAuth access tokens
git status --short | grep "\.env$"  # no .env file tracked
```

---

## 7. Handoff Prompt Template

Copy and adapt this template for each CU. Replace all `<PLACEHOLDER>` values before sending.

```
You are a senior AI coding agent working on the Primis monorepo.

Your task is to implement exactly ONE commit unit: <CU-ID> — <CU-TITLE>.

BEFORE writing any code, read these documents in order:

1. docs/source-of-truth/primis_full_implementation_spec_commit_plan.md
   Read: §0 Purpose, §2 Non-Negotiable Principles, §3 Commit Unit Contract,
   §4 Architecture Decisions, Phase C <CU-ID> section.

2. docs/source-of-truth/primis_technical_architecture_document.md
   Read: §0, §3.4, §6.1, §7, §18

3. docs/source-of-truth/primis_ui_ux_design_system_spec.md
   Read: §0, <SPECIFIC-SECTIONS-FOR-THIS-CU>

4. <ADD ANY CU-SPECIFIC DOCS FROM THE PLAN SECTION FOR THIS CU>

5. plans/phase-c-mobile-shell-design-system.md
   Read: §5 <CU-ID> section and §6 Phase-Level Guardrails

ALSO read (for context, not full implementation):
- docs/decisions/ADR-0001-vitest-workspace-file-name.md (Vitest workspace file is vitest.workspace.ts)
- docs/decisions/ADR-001-provider-code-naming.md (canonical provider codes)

THEN implement only the files listed under "Files created / edited" for <CU-ID>.

ACCEPTANCE CRITERIA — all must pass before committing:
<PASTE THE ACCEPTANCE CRITERIA FROM THE CU SECTION>

GUARDRAILS — enforce on every line you write:
- No real Apple team IDs, bundle IDs, EAS project IDs, or provider credentials.
- No database migrations, Lambda handlers, or scoring formulas.
- No AI provider calls or prompts.
- No raw provider payloads or real personal health data.
- No hardcoded styles after CU-017 — use design tokens.
- Mock data must pass @primis/api-contracts DTO schema validation in tests.
- Do not edit source-of-truth docs. If you find a conflict, create docs/decisions/ADR-<topic>.md.
- Do not implement work beyond this CU's scope.
- Use commit message format: `<area>: <short imperative> (<CU-ID>)`
- Use branch: `cu/<cu-id-lowercase>-<short-name>`

AFTER implementing:
1. Run all verification commands listed in the plan for <CU-ID>.
2. Confirm all acceptance criteria pass.
3. Run secret scan: `git grep -r "sk-\|AKIA\|ya29\." .`
4. State any known limitations or deferred decisions.
5. If you found a conflict between source docs, create docs/decisions/ADR-00X-<topic>.md
   and note it in your implementation summary.
6. Do not commit until all checks are green.

CU-SPECIFIC DOCS TO READ:
<PASTE THE "Relevant docs / sections" FROM THE CU SECTION>
```

**Per-CU reference cheat sheet:**

| CU     | Area prefix | Key doc sections              | Specific pitfalls to mention                                                                                  |
| ------ | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CU-014 | `mobile:`   | TAD §3.4, §6.1; MVP §3.5      | `"main": "expo-router/entry"`, Reanimated plugin last, ADR-0001 glob update, vitest env is `node` not `jsdom` |
| CU-015 | `mobile:`   | TAD §6.1; MVP §3.5            | Do not run `eas init`, all fields are `PLACEHOLDER_*`                                                         |
| CU-016 | `mobile:`   | UX Spec §5                    | `(tabs)` group syntax, `GestureHandlerRootView` at root, 6 tabs exact                                         |
| CU-017 | `design:`   | UX Spec §8–§12.2              | peerDeps not deps, ThemeContext in design-system not mobile, token-only colors                                |
| CU-018 | `design:`   | UX Spec §11                   | Touch target 44pt min, useTheme in design-system, mock RN in design-system tests                              |
| CU-019 | `design:`   | UX Spec §12                   | Reanimated is peerDep, mock AccessibilityInfo in tests, plugin already in babel                               |
| CU-020 | `design:`   | UX Spec §13                   | No Skia yet, `null` in ChartPoint.y, non-Apple-rings RingProgress                                             |
| CU-021 | `mobile:`   | TAD §6.1, ARCH-MOBILE-001/002 | MMKV mock in tests, Set serialization, `refetchOnWindowFocus: false`                                          |
| CU-022 | `mobile:`   | TAD §6.1, ARCH-CODE-006       | `EXPO_PUBLIC_*` build-time, update @primis/config schema                                                      |
| CU-023 | `mobile:`   | UX Spec §6.1, §7; Scoring §6  | `MissingReason` from core-types, `localDate` YYYY-MM-DD, `isMock: true` literal                               |

---

## 8. Definition of Done for Phase C

Phase C is complete when ALL of the following are true:

### App skeleton

- [ ] `apps/mobile/package.json` has `"name": "@primis/mobile"` and `"main": "expo-router/entry"`
- [ ] `apps/mobile/app.config.ts` sets `name: "Primis"`, `scheme: "primis"`, placeholder bundle IDs
- [ ] `babel.config.js` includes `react-native-reanimated/plugin` as the last plugin
- [ ] `vitest.workspace.ts` includes `apps/*/vitest.config.ts` in the glob

### EAS config

- [ ] `apps/mobile/eas.json` has `development`, `preview`, `production` build profiles
- [ ] All EAS credential fields are `PLACEHOLDER_*` strings
- [ ] `apps/mobile/README.md` states credentials are Phase Z

### Navigation

- [ ] 6 bottom tabs exist in order: Home, Sleep, Recovery, Activity, Nutrition, AI Coach
- [ ] Each tab renders a non-blank placeholder screen
- [ ] Navigation is isolated from business logic

### Theme system

- [ ] `packages/design-system` is a real package with `package.json` and `tsconfig.json`
- [ ] All token modules exist: color, spacing, typography, radius, shadow, motion
- [ ] `createTheme('dark', 'electricBlue')` returns a valid Theme
- [ ] `ThemeProvider` and `useTheme()` are in `apps/mobile/src/providers/ThemeProvider.tsx`
- [ ] `app/_layout.tsx` wraps with `ThemeProvider`

### UI primitives

- [ ] Screen, Card, Text, Button, MetricValue, StatusBadge, ProgressBar exist in design-system
- [ ] No component has hardcoded colors — all use theme tokens
- [ ] `MetricValue` renders `'—'` for `null` values
- [ ] `StatusBadge` always includes a text label
- [ ] `Button` has minimum 44pt touch target

### Motion primitives

- [ ] `DURATIONS` and `EASINGS` constants are exported from design-system
- [ ] `cardEnterTransition`, `cardPressTransition`, `screenTransition`, `metricUpdateTransition` exist
- [ ] `useReducedMotion()` subscribes to system accessibility preference
- [ ] Motion durations are sourced from tokens, not hardcoded

### Chart scaffolds

- [ ] `LineChart`, `StageTimeline`, `RingProgress` exist with stable prop APIs
- [ ] `ChartPoint.y` accepts `null` for missing data gaps
- [ ] `state: 'loading'` and `state: 'empty'` render meaningful UI (not blank)
- [ ] `RingProgress` is visually distinct from Apple Activity Rings

### Local state and cache

- [ ] `settingsStore` holds only S1 data (theme, accent, tone stubs, onboarding flag)
- [ ] `widgetStore` default order matches UI/UX Spec §6.1.2 default widgets
- [ ] TanStack Query client is configured with `staleTime`, `gcTime`, `refetchOnWindowFocus: false`
- [ ] `localDashboardCache` has `save`, `get`, `clear` methods backed by SQLite
- [ ] `QueryClientProvider` wraps the navigation stack

### API client

- [ ] `PrimisApiClient` has typed `get` and `post` methods
- [ ] API errors map to `ApiClientError` with `ApiErrorCode` from `@primis/api-contracts`
- [ ] `baseUrl` comes from `loadPublicEnv()` — not hardcoded
- [ ] Mock mode is enabled by default in development
- [ ] Auth token injection stub exists (returns `null` in Phase C)

### Mock data

- [ ] `MOCK_NORMAL`, `MOCK_LOW_RECOVERY`, `MOCK_STALE_DATA`, `MOCK_MISSING_DATA` all exported
- [ ] All mock `ScoreSnapshotDto` objects pass `ScoreSnapshotDtoSchema.parse()` in tests
- [ ] Stale and missing states have `value: null` and `band: null`
- [ ] `aiSummary.isMock === true` is a literal type
- [ ] No raw provider payloads in mock files

### Toolchain

- [ ] `pnpm install` succeeds with no lockfile conflicts
- [ ] `pnpm lint` exits with 0 (all packages)
- [ ] `pnpm typecheck` exits with 0 (all packages)
- [ ] `pnpm test` exits with 0 (all packages)
- [ ] `pnpm format:check` exits with 0
- [ ] `pnpm --filter @primis/mobile typecheck` exits with 0
- [ ] `pnpm --filter @primis/mobile test` exits with 0
- [ ] `pnpm --filter @primis/design-system typecheck` exits with 0
- [ ] `pnpm --filter @primis/design-system test` exits with 0

### Guardrails verified

- [ ] `git grep -r "sk-" .` returns nothing
- [ ] `git grep -r "AKIA" .` returns nothing
- [ ] `git grep -r "ya29\." .` returns nothing
- [ ] No `.env` file in `git status` output
- [ ] No real bundle ID, Apple team ID, or EAS project ID in any file
- [ ] No `PLACEHOLDER_*` values replaced with real credentials

---

## 9. Known Risks / Decisions to Defer

| Risk / Decision                                        | Status                                                                                                                                                                                                                      | Where to resolve                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Mobile test environment (Vitest/node vs Jest for RNTL) | **Open — see OQ-001.** Phase C uses Vitest/node for all pure tests. RNTL component rendering tests are deferred to Phase G; runner choice (Vitest vs Jest/Expo Jest) resolved via ADR at that point.                        | Phase G; create ADR when RNTL tests are first introduced  |
| Exact hex values for light theme and accent colors     | Spec provides dark palette; light and accent are described but not fully specified. Use reasonable values with `// TODO(design):` comments.                                                                                 | Founder design review before Phase G                      |
| Zustand v4 vs v5 API                                   | Zustand v5 changed the API. Verify the version compatible with `react-native-mmkv` zustand middleware.                                                                                                                      | CU-021 — check at install time                            |
| SQLite encryption for dashboard cache                  | Phase C cache may hold S2-sensitivity precomputed snapshots. If Phase G moves S3 data to cache, encryption (e.g., SQLite with sqlcipher) must be evaluated.                                                                 | Phase J hardening (CU pre-beta)                           |
| React Native Skia native config                        | Skia requires `@shopify/react-native-skia` with native linking. CU-020 uses placeholder implementations. Skia must be set up with a dev build before Phase G uses it.                                                       | CU-020 notes TODO; Phase G CU agent sets up Skia properly |
| Icon library selection                                 | No icon library is chosen in Phase C. Tab icons are text-only placeholders.                                                                                                                                                 | Phase G or a dedicated icon CU before Phase G             |
| `expo-sqlite` v12+ async API changes                   | Expo SQLite API changed significantly in SDK 50+. Verify API surface at install time.                                                                                                                                       | CU-021 — check at install time                            |
| `CONTRIBUTING.md` area prefix gap                      | `mobile:` and `design:` are used by the impl spec but were absent from `CONTRIBUTING.md`. CU-014 must add them.                                                                                                             | CU-014                                                    |
| ThemeContext location (design-system vs mobile)        | Pitfall section of CU-018 discusses; recommend defining `ThemeContext` in `packages/design-system` rather than `apps/mobile`. If agent makes a different choice, document in an ADR.                                        | CU-017 or CU-018 — agent decision                         |
| `useReducedMotion` hook test coverage                  | Testing `AccessibilityInfo.isReduceMotionEnabled` requires native bridge mocking in unit tests. Agent must mock `react-native` or test at integration level.                                                                | CU-019 — agent decision                                   |
| `@primis/mobile` app build on simulator                | `pnpm --filter @primis/mobile start` launches Metro but a dev client build on simulator requires `eas build --profile development`. Dev client build is a manual Phase Z action; plan only requires Metro to start cleanly. | Phase Z manual setup                                      |

---

## 10. Open Questions / Assumptions

**OQ-001: Mobile test environment choice**

> **Question**: Which test runner and environment should `apps/mobile` use for different test
> categories (pure utilities vs. React Native component rendering)?
>
> **Context**: Vitest 1.x does not have a first-party React Native runtime environment. Running
> RNTL component tests inside Vitest requires either mocking the entire `react-native` module
> surface (fragile) or a community RN environment shim (not stable in 2026). The three realistic
> options are: (a) Vitest/node for everything, mocking RN where needed; (b) Vitest for utilities
> and Jest/Expo Jest preset for RNTL component tests (two runners); (c) wait until a stable
> Vitest RN environment exists.
>
> **Assumption (updated)**: Split by test category:
>
> - **Pure tests** (token validation, DTO parsing, hook logic, store actions, API error mapping,
>   mock data schema checks): use **Vitest with `environment: 'node'`** in both
>   `apps/mobile/vitest.config.ts` and `packages/design-system/vitest.config.ts`. These tests
>   have zero dependency on the RN runtime and run identically to other workspace packages.
> - **React Native component rendering tests** (RNTL `render()` calls): **defer runner choice**
>   until Phase G when real screens with real content make the investment worthwhile. If RNTL
>   requires Jest/Expo Jest instead of Vitest, create `docs/decisions/ADR-00X-mobile-test-environment.md`
>   at that point and document the two-runner setup.
>
> **Implication for CU-014**: Set `apps/mobile/vitest.config.ts` to `environment: 'node'`
> (not `jsdom`). Remove the `setupFiles` reference to RNTL in the initial setup — add it only
> when RNTL tests are introduced. This keeps Phase C tests fast, dependency-light, and consistent
> with the rest of the workspace.
>
> **Non-blocking**: Proceed with node environment. Create ADR when RNTL component tests are
> first needed.

**OQ-002: `packages/design-system` React Native dependency strategy**

> **Question**: Should `packages/design-system` declare `react-native` as a `peerDependency`
> (preferred) or bundle a mock/shim for tests?
>
> **Assumption**: Declare as `peerDependency`. Token files are pure TypeScript (no RN). Component
> files import RN, but tests for those components are either (a) pure logic tests that mock RN
> or (b) moved to `apps/mobile`. The `vitest.config.ts` for `packages/design-system` uses
> `environment: 'node'` for token tests.

**OQ-003: `settingsStore` persistence key strategy**

> **Question**: What MMKV storage key names should be used for settings persistence?
>
> **Assumption**: Use `'primis.settings'` and `'primis.widgets'` as storage keys. These are
> stable across app versions. If the schema changes in a later phase, add a migration in the
> store itself. Document with a comment in the store.

**OQ-004: Default widget order**

> **Question**: What is the exact default widget order for `widgetStore`?
>
> **Assumption**: Use the default order from UI/UX Spec §6.1.2:
> `['recovery_score', 'sleep_score', 'sleep_debt', 'steps_activity', 'calories_burned',
'training_readiness', 'hrv_trend', 'todays_recommendation']`
> These are string widget IDs. If the spec list changes in a later design decision, update
> the default in `widgetStore` and create a migration.

**OQ-005: `EXPO_PUBLIC_API_BASE_URL` schema in `@primis/config`**

> **Question**: Should `EXPO_PUBLIC_API_BASE_URL` be added to the `publicEnvSchema` in
> `@primis/config`, or should mobile manage its own env parsing?
>
> **Assumption**: Add to `publicEnvSchema` in `@primis/config` as an optional field with a
> default. This maintains the principle that all env parsing goes through the shared config
> package. Update tests accordingly.

---

## 11. Next Phase Preview — Phase D Awareness

**Phase C must be complete before Phase D begins.** Do not implement any Phase D work during
Phase C, even as stubs.

Phase D — Backend Local Foundation and Database (CU-024 onward) will create:

| CU     | Title                                               | First file                                            |
| ------ | --------------------------------------------------- | ----------------------------------------------------- |
| CU-024 | Add backend API service skeleton                    | `services/api/src/app.ts`                             |
| CU-025 | Add local Docker Postgres setup                     | `docker-compose.yml`                                  |
| CU-026 | Add SQL migration framework and Kysely DB layer     | `database/migrations/000001_init.sql`                 |
| CU-027 | Implement identity, preferences, and consent tables | `database/migrations/000002_identity_preferences.sql` |
| CU-028 | Implement provider connection and sync tables       | `database/migrations/000003_provider_sync.sql`        |

**Phase D dependencies on Phase C:**

- The `PrimisApiClient` from CU-022 will be the first consumer of the Phase D backend's
  `/health` and `/v1/dashboard` endpoints. When Phase D provides a real response, the mock
  mode toggle in `src/api/client.ts` is set to `false`.
- The `localDashboardCache` from CU-021 will store precomputed backend responses once Phase D
  provides them via real data.
- The `ScoreSnapshotDto` from `@primis/api-contracts` (Phase B) is the DTO contract that Phase D
  backend scoring endpoints must produce and Phase C API client must consume — no DTO changes
  are expected between Phase C and Phase D for core score shapes.
- The `@primis/config` env contract (CU-007, updated in CU-022) already includes
  `DATABASE_URL` and backend-only secrets in `backendEnvSchema`. Phase D will use these.

**Before starting CU-024, the executing agent must:**

1. Confirm Phase C DoD checklist (§8 above) is fully checked.
2. Read `primis_technical_architecture_document.md` §6.2 (backend stack), §9 (data flow),
   §11 (storage decisions).
3. Read `primis_data_model_health_metric_schema.md` §4–§9 for the Postgres schema design.
4. Read `plans/phase-c-mobile-shell-design-system.md §11` to understand Phase C→D handoff.

---

_End of Phase C — Mobile Shell and Design System Plan_
