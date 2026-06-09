# Phase A — Repo and Tooling Foundation

**Plan version:** 1.0  
**Created:** 2026-06-08  
**Scope:** CU-001 through CU-007  
**Optimized for:** Sequential AI coding-agent execution, one commit unit at a time  
**Prerequisite reading:** See §2 below before implementing any CU.

---

## 1. Phase A Goal and Non-Goals

### Goal

Establish a clean, AI-agent-safe monorepo skeleton with strict TypeScript, enforced lint/format rules, a working test baseline, a GitHub Actions CI gate, and a typed environment contract — so that every subsequent commit unit has a stable, consistent foundation to build on.

When Phase A is complete, a new contributor or AI coding agent can:

- clone the repo
- run `pnpm install`
- run `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` and see all green
- understand where every source-of-truth document lives
- understand the commit-unit workflow and agent boundaries

### Non-Goals for Phase A

- Do **not** scaffold the mobile app, any backend service, or any infrastructure stack.
- Do **not** create database schemas, migration files, or seed data.
- Do **not** implement scoring, AI gateway, provider connectors, or UI screens.
- Do **not** add real secrets, provider credentials, AWS credentials, Apple team IDs, or Google OAuth client IDs.
- Do **not** deploy any cloud resource.
- Do **not** implement the shared `core-types`, `health-metrics`, `api-contracts`, or `scoring` packages (those are Phase B, CU-008 onward).
- Do **not** silently edit source-of-truth documents. If an implementation finding contradicts a source doc, write a decision record instead.

---

## 2. Required Source Documents

Before implementing any CU in Phase A, the executing agent MUST read the following sections. Do not skip sections; each one contains guardrails that govern Phase A decisions.

| Priority | Document | Sections to read | Why |
|---|---|---|---|
| 1 | `docs/source-of-truth/primis_full_implementation_spec_commit_plan.md` | §0–§5, Phase A CU-001–007, §9 | Commit sequencing authority; commit format; branch naming; verification commands; DoD per commit |
| 2 | `docs/source-of-truth/primis_mvp_build_plan_milestones.md` | §0, §0.5, §1, §4, §6 | Milestone intent; health-data-model-first constraint; build order; M0 work items |
| 3 | `docs/source-of-truth/primis_technical_architecture_document.md` | §0, §6, §7, §8 | Technology stack decisions; monorepo layout; environment strategy; code boundary rules |
| 4 | `docs/source-of-truth/primis_data_model_health_metric_schema.md` | §0, §5.4, §5.5 | Data sensitivity classification (S0–S4); deletion conventions; fixture redaction policy |
| 5 | `docs/source-of-truth/primis_scoring_algorithms_spec.md` | §0 only | Rule: do not invent score formulas ad hoc; scoring must be deterministic and centralized |
| 6 | `docs/source-of-truth/primis_ai_context_engine_spec.md` | §0 only | Rules: no raw health data in prompts/logs; use `AiGateway` abstraction from day one |
| 7 | `docs/source-of-truth/primis_ui_ux_design_system_spec.md` | §0 only | Rule: all future UI must use design tokens; no ad hoc styles |
| 8 | `docs/source-of-truth/primis_product_requirements_document.md` | §0, §3, §4 | Product scope; core principles; goals and non-goals |
| 9 | `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md` | Full (skim) | Required companion doc for future provider phases; no implementation in Phase A |

### Source priority order (conflict resolution)

If documents conflict, resolve in this order:

1. `primis_full_implementation_spec_commit_plan.md` — commit sequencing authority
2. `primis_mvp_build_plan_milestones.md` — milestone/gate intent
3. `primis_technical_architecture_document.md` — system boundaries
4. `primis_data_model_health_metric_schema.md` — schema and metric names
5. `primis_scoring_algorithms_spec.md` — algorithm rules
6. `primis_ai_context_engine_spec.md` — AI behavior rules
7. `primis_ui_ux_design_system_spec.md` — interface behavior rules
8. `primis_product_requirements_document.md` — product intent

If a real-world implementation finding contradicts any source doc, create a file under `docs/decisions/` instead of silently changing the doc.

---

## 3. Phase A Dependency Graph

Each commit unit depends on the one before it. Phase A is intentionally sequential.

```
CU-001 (monorepo skeleton)
  └─> CU-002 (docs discoverable + contribution guide)
        └─> CU-003 (TypeScript baseline — tsconfig.base.json, typecheck script)
              └─> CU-004 (ESLint + Prettier + .editorconfig)
                    └─> CU-005 (Vitest baseline + fixture conventions)
                          └─> CU-006 (GitHub Actions CI — runs CU-003/004/005 checks)
                                └─> CU-007 (env contract — packages/config Zod loader)
```

**Hard rule:** Do not start CU-N+1 until CU-N's acceptance criteria and verification commands all pass.

---

## 4. Commit Units

---

### CU-001 — Initialize repository structure

**Branch name:** `cu/cu-001-init-monorepo`

**Commit message:** `repo: initialize Primis monorepo structure (CU-001)`

#### Goal

Create the full folder skeleton expected by all later commits. Every directory defined by the implementation spec must exist. Placeholder `.gitkeep` files make empty dirs trackable in git.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` §4.1 (monorepo layout), Phase A CU-001
- `primis_mvp_build_plan_milestones.md` §6.2, §6.3
- `primis_technical_architecture_document.md` §7.1, §7.2

#### Files created

```text
package.json                          # root — name "@primis/root", private: true, workspaces via pnpm
pnpm-workspace.yaml                   # includes apps/*, services/*, packages/*, infrastructure/*
.gitignore                            # node_modules, dist, .env, .env.local, *.tsbuildinfo, coverage
README.md                             # product name, local setup placeholder, docs location pointer
apps/mobile/.gitkeep
services/api/.gitkeep
services/workers/.gitkeep
services/ai/.gitkeep
packages/core-types/.gitkeep
packages/health-metrics/.gitkeep
packages/scoring/.gitkeep
packages/api-contracts/.gitkeep
packages/design-system/.gitkeep
packages/config/.gitkeep
infrastructure/cdk/.gitkeep
database/migrations/.gitkeep
database/seeds/.gitkeep
database/fixtures/.gitkeep
docs/decisions/.gitkeep
docs/runbooks/.gitkeep
scripts/.gitkeep
.github/.gitkeep
```

> **Note:** `docs/source-of-truth/` already exists in the repo with all planning documents. Do not recreate or overwrite it.

#### In scope

- Root `package.json` with `"private": true`, `"name": "@primis/root"`, placeholder scripts (`install`, `lint`, `typecheck`, `test`, `format`, `format:check`, `build`) returning a stub message until later CUs implement them
- `pnpm-workspace.yaml` declaring `apps/*`, `services/*`, `packages/*`, `infrastructure/*`
- `.gitignore` covering `node_modules`, `dist`, `.env`, `.env.*` (but not `.env.example`), `*.tsbuildinfo`, `coverage`, `.DS_Store`
- `README.md`: one-paragraph product description, link to `docs/source-of-truth/`, placeholder setup steps

#### Out of scope

- Any actual TypeScript source files
- Any `package.json` files inside `apps/`, `services/`, or `packages/` subdirectories (those come in later CUs)
- Expo/mobile scaffolding
- Database schema or seed data
- CI configuration

#### Acceptance criteria

- All directories from the implementation spec §4.1 exist in the repo
- `pnpm-workspace.yaml` references `apps/*`, `services/*`, `packages/*`, `infrastructure/*`
- `.gitignore` prevents `.env` from being tracked
- `README.md` documents the product purpose and points to `docs/source-of-truth/`
- Running `pnpm -v` succeeds (confirms pnpm is present; install not required yet)

#### Verification commands

```bash
pnpm -v
ls apps services packages infrastructure database docs scripts .github
cat pnpm-workspace.yaml
```

#### Likely pitfalls

- The repo currently contains only `docs/`. Do not delete or move existing `docs/source-of-truth/` content.
- Do not generate a mobile app scaffold (no `npx create-expo-app`, no `expo init`).
- Stub root scripts must not fail with a non-zero exit code — use `echo "not implemented"` pattern or leave scripts field minimal; do not run real commands that don't exist yet.
- `pnpm-workspace.yaml` format requires YAML arrays under a `packages:` key; double-check syntax to avoid install failures in later CUs.

---

### CU-002 — Add source-of-truth documents and contribution guide

**Branch name:** `cu/cu-002-docs-and-contribution-guide`

**Commit message:** `docs: add source-of-truth documentation guide (CU-002)`

#### Goal

Make the source-of-truth documents discoverable in a consistent reading order, and establish explicit guidance for AI coding agents and human contributors about how to work within this repo.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-002
- `primis_mvp_build_plan_milestones.md` §0.1 (agent instructions), §6.5 M0-T003
- All seven source-of-truth documents — for reading-order table

#### Files created

```text
docs/README.md                        # reading order table + doc summaries + agent instructions
CONTRIBUTING.md                       # commit-unit workflow, branch naming, commit format, agent behavior
.ai-agent-instructions.md            # top-level agent boundary rules
```

#### In scope

**`docs/README.md`** must include:
- A table listing all source-of-truth documents in required reading order (1–9, as in §2 of this plan)
- One-sentence description of each doc's authority domain
- A note that `docs/decisions/` holds ADRs and decision records
- A note that `docs/runbooks/` holds operational runbooks (empty now)

**`CONTRIBUTING.md`** must include:
- Summary of the commit-unit workflow (one CU = one focused commit)
- Commit message format: `<area>: <short imperative summary> (<CU-ID>)`
- Branch naming format: `cu/<cu-id-lowercase>-<short-name>`
- Standard verification commands (lint, typecheck, test, format:check)
- Statement that source-of-truth docs must not be silently edited
- Statement that ADRs go in `docs/decisions/` when architecture deviates from source docs

**`.ai-agent-instructions.md`** must include:
- Rule: implement only the currently assigned commit unit
- Rule: do not invent schema tables, metric codes, score formulas, or UI styles not in source docs
- Rule: read the docs listed in this file before implementing
- Rule: add tests for every non-trivial change
- Rule: do not commit `.env` files, real credentials, or real provider payloads
- Pointer to `docs/README.md` for reading order
- Pointer to `CONTRIBUTING.md` for workflow

#### Out of scope

- Editing any existing source-of-truth document content
- Creating `docs/decisions/` files (the directory exists from CU-001; leave it empty)
- Any code changes

#### Acceptance criteria

- `docs/README.md` exists and lists all 9 source-of-truth documents (including the implementation spec and the Google Health parity matrix) in reading order
- `CONTRIBUTING.md` documents commit message and branch naming conventions matching the implementation spec exactly
- `.ai-agent-instructions.md` states the five agent boundary rules listed above
- `ls docs/source-of-truth` shows all planning documents unchanged

#### Verification commands

```bash
ls docs/source-of-truth
cat docs/README.md
cat CONTRIBUTING.md
cat .ai-agent-instructions.md
```

#### Likely pitfalls

- The source-of-truth docs already exist. Do not overwrite them. Only create the three new files listed above.
- The implementation spec references 7 documents, but the actual repo contains 9 (the spec itself and the Google Health parity matrix are additional). The `docs/README.md` reading order should reflect all 9 real files.
- `.ai-agent-instructions.md` at the repo root (not inside `docs/`) makes it immediately visible to agents scanning the workspace root.

---

### CU-003 — Configure TypeScript workspace baseline

**Branch name:** `cu/cu-003-typescript-baseline`

**Commit message:** `repo: configure strict TypeScript workspace (CU-003)`

#### Goal

Establish a shared, strict TypeScript configuration that every package in the monorepo can extend. Create the `packages/config` package shell as the first real package, since it will own the env loader in CU-007.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-003, §4.1
- `primis_technical_architecture_document.md` §6.3 (TypeScript decision), §7.1, §7.2

#### Files created / edited

```text
tsconfig.base.json                    # root shared strict config
package.json                          # add typecheck script: "pnpm -r typecheck"
packages/config/package.json          # name "@primis/config", private, scripts.typecheck
packages/config/tsconfig.json         # extends ../../tsconfig.base.json
packages/config/src/.gitkeep         # placeholder; real source comes in CU-007
```

#### In scope

**`tsconfig.base.json`** must set:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "exclude": ["node_modules", "dist"]
}
```

> **Note on `moduleResolution`:** Use `"bundler"` for packages consumed by Expo/Vite/Vitest. Backend services that run directly in Node.js may use `"node16"` or `"nodenext"` in their own `tsconfig.json`. Document this in the `packages/config/tsconfig.json` comment if applicable.

**`packages/config/package.json`** minimal shape:

```json
{
  "name": "@primis/config",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

**Root `package.json`** typecheck script: `"typecheck": "pnpm -r typecheck"` (runs recursively across all packages).

#### Out of scope

- Any actual TypeScript source code (source comes in CU-007 for `packages/config`)
- Path aliases (keep them minimal at this stage; add per-package aliases only when a concrete import need arises)
- Project references / composite builds (defer until package graph is established in Phase B)
- `tsconfig.json` files for `apps/`, `services/`, or other `packages/*` subdirectories (those come in later phases when those packages are initialized)

#### Acceptance criteria

- `tsconfig.base.json` uses `"strict": true` at minimum
- `packages/config/tsconfig.json` extends `../../tsconfig.base.json`
- `pnpm typecheck` runs without error (it will only check `packages/config` which has no source yet, so it should succeed cleanly)
- No TypeScript errors introduced

#### Verification commands

```bash
pnpm install
pnpm typecheck
```

#### Likely pitfalls

- `"moduleResolution": "bundler"` requires TypeScript ≥ 5.0. Confirm the TypeScript version in root `package.json` `devDependencies` is `^5.x`.
- `pnpm -r typecheck` will fail if any package's `tsconfig.json` references a non-existent path. Ensure `packages/config/src/.gitkeep` is present so `src/` exists even though it has no `.ts` files yet (or set `"include": []` in the package tsconfig until source exists).
- Do not copy React Native / Expo-specific tsconfig settings here — those belong in `apps/mobile/tsconfig.json` which is Phase C (CU-014+).

---

### CU-004 — Add linting, formatting, and editor config

**Branch name:** `cu/cu-004-lint-format-editor`

**Commit message:** `repo: add lint formatting and editor config (CU-004)`

#### Goal

Prevent formatting and lint drift before any source code is written. Establish consistent rules that all packages and services will inherit.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-004
- `primis_mvp_build_plan_milestones.md` §6.4 (quality tooling decisions)

#### Files created / edited

```text
.eslintrc.cjs                         # root ESLint config (legacy format for monorepo compatibility)
.prettierrc                           # Prettier config
.prettierignore                       # ignores: dist, node_modules, pnpm-lock.yaml, *.gitkeep, coverage
.editorconfig                         # consistent editor settings
package.json                          # add/update lint and format scripts
```

#### In scope

**Root `package.json` scripts:**
```json
{
  "lint": "eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

**`.eslintrc.cjs`** minimum rules:
- Extends `@typescript-eslint/recommended`
- `no-unused-vars`: error
- `no-console`: warn (allow `console.error`)
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/explicit-function-return-type`: off (too noisy at foundation stage; re-evaluate at Phase B)
- Parser: `@typescript-eslint/parser`
- `ignorePatterns`: `["dist/", "node_modules/", "*.js"]` (allow plain JS config files)

**`.prettierrc`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

**`.editorconfig`:**
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

**Root `package.json` `devDependencies`** to add:
- `eslint`
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`
- `prettier`

#### Out of scope

- React Native-specific ESLint plugins (`eslint-plugin-react-native`, `eslint-plugin-react-hooks`) — add in Phase C when mobile app is initialized
- Import-order plugins — add when meaningful cross-package imports exist
- Prettier plugins for specific file types beyond default TypeScript/JS/JSON

#### Acceptance criteria

- `pnpm lint` runs without errors on the current codebase (only config files exist, so this should be clean)
- `pnpm format:check` runs without diff (all existing files are already Prettier-formatted)
- `pnpm format` runs without error
- `.prettierignore` excludes `pnpm-lock.yaml` and `dist/`
- ESLint is configured to catch unused variables and explicit `any`

#### Verification commands

```bash
pnpm install
pnpm lint
pnpm format:check
```

#### Likely pitfalls

- ESLint v8 vs v9 flat config: the implementation spec specifies `.eslintrc.cjs` (legacy format). Use ESLint v8 with legacy config format to avoid flat-config migration complexity at this early stage. Pin ESLint to `^8.x` in `devDependencies`.
- `.prettierignore` must include `pnpm-lock.yaml` — Prettier will try to format it otherwise and may alter it.
- The `--max-warnings 0` flag in the lint script means any warning is a CI failure. Start with a clean zero-warnings config; loosen only with documented justification.
- Running `pnpm lint` on `.gitkeep` files is harmless (they will be ignored by the `--ext` flag), but confirm glob behavior does not accidentally include binary or non-text files.

---

### CU-005 — Add test framework baseline

**Branch name:** `cu/cu-005-vitest-baseline`

**Commit message:** `test: add Vitest baseline and fixtures convention (CU-005)`

#### Goal

Ensure every package in the monorepo can add deterministic, fast unit tests. Establish the fixture redaction policy before any provider payloads are saved.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-005
- `primis_mvp_build_plan_milestones.md` §0.1 (test requirements), §6 (M0 scope)
- `primis_data_model_health_metric_schema.md` §5.4 (data sensitivity S0–S4)

#### Files created / edited

```text
vitest.config.ts                      # root Vitest workspace config
package.json                          # add test script
tests/README.md                       # test conventions and fixture redaction policy
database/fixtures/README.md           # fixture policy: redaction rules, sensitivity levels, no-secrets mandate
packages/config/vitest.config.ts      # package-level Vitest config (extends root or standalone)
packages/config/src/placeholder.test.ts  # minimal passing smoke test
```

#### In scope

**Root `vitest.config.ts`** using Vitest workspace mode:

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'services/*/vitest.config.ts',
]);
```

**Root `package.json` test script:** `"test": "vitest run"`

**`packages/config/vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

**`packages/config/src/placeholder.test.ts`** — minimal test that asserts `true` to confirm the test runner works. This will be replaced by real tests in CU-007.

**`tests/README.md`** must document:
- Use Vitest for all TypeScript packages and services
- Tests must be deterministic; no real network calls in unit tests
- Use fixtures from `database/fixtures/` for provider payload tests
- All fixtures must be redacted (see `database/fixtures/README.md`)
- Test file naming: `*.test.ts` co-located with source, or in a `test/` subdirectory

**`database/fixtures/README.md`** must document:
- Data sensitivity levels S0–S4 (reference `primis_data_model_health_metric_schema.md §5.4`)
- **No real user IDs, real OAuth tokens, real email addresses, or real device identifiers may be committed**
- S2/S3 fixtures must have realistic value structure but synthetic or anonymized identifiers
- S4 data (credentials, tokens) is never committed — use `.env.example` placeholders only
- Future provider payload fixtures go under `database/fixtures/provider/<provider_name>/redacted/`
- Redacted real payloads (from M1 manual validation) go under `database/fixtures/provider/<provider_name>/redacted_real/` and must be reviewed before commit

#### Out of scope

- Integration tests or database tests (those require a running DB — Phase D)
- React Native testing setup (React Native Testing Library — Phase C)
- Snapshot tests (no UI yet)
- Coverage reporting configuration (add when enough tests exist to be meaningful)

#### Acceptance criteria

- `pnpm test` runs Vitest and the placeholder test in `packages/config` passes
- `pnpm test` completes without requiring network access
- `database/fixtures/README.md` clearly states that no real credentials or raw provider payloads may be committed
- `tests/README.md` describes the test conventions used in this repo

#### Verification commands

```bash
pnpm install
pnpm test
```

#### Likely pitfalls

- Vitest workspace mode requires Vitest ≥ 0.34 or 1.x. Use `vitest@^1.x` (latest stable). Pin the same version across root and package devDependencies.
- The root `vitest.config.ts` glob `packages/*/vitest.config.ts` will only pick up packages that have their own vitest config. Packages without tests yet should not need a vitest config — the workspace entry can be omitted until tests are added.
- `placeholder.test.ts` will be replaced in CU-007. Name it clearly (e.g., `placeholder.test.ts`) so future agents know to replace it.
- `pnpm test` must not fail if a package has zero test files — configure Vitest's `passWithNoTests` option if needed.

---

### CU-006 — Add GitHub Actions CI baseline

**Branch name:** `cu/cu-006-ci-baseline`

**Commit message:** `ci: add baseline checks workflow (CU-006)`

#### Goal

Run lint, type check, tests, and format check automatically on every pull request. Catch regressions before they accumulate. Establish least-privilege GitHub Actions permissions from the start.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-006
- `primis_technical_architecture_document.md` §6.2 (CI/CD: GitHub Actions + AWS OIDC — note: OIDC deploy wiring is Phase Z only)

#### Files created

```text
.github/workflows/ci.yml              # baseline PR checks workflow
```

#### In scope

**`.github/workflows/ci.yml`** must:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  checks:
    name: Lint, Type Check, Test, Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9              # pin to match root .npmrc or engines field
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm format:check
```

**Key CI requirements from the spec:**
- No AWS credentials required (none exist yet; OIDC for deployments is Phase Z)
- `permissions: contents: read` — least-privilege baseline
- PNPM version pinned (use v9 unless a different version is already locked in the workspace)
- Node.js 20 LTS
- `--frozen-lockfile` on install to catch lockfile drift

#### Out of scope

- AWS deploy workflows (Phase Z)
- EAS build workflows (Phase C/Z)
- Docker build jobs
- Code coverage upload
- Release tagging or artifact publishing
- Secrets management in CI (no secrets exist in Phase A)

#### Acceptance criteria

- `ci.yml` runs lint, typecheck, test, and format:check as separate steps
- No AWS credentials or secrets are referenced in the workflow
- Workflow permissions are `contents: read` at the job level
- pnpm action version is pinned
- Node version is 20

#### Verification commands

```bash
# Local simulation
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

#### Likely pitfalls

- `pnpm install --frozen-lockfile` will fail if `pnpm-lock.yaml` does not exist. Ensure `pnpm install` was run locally and the lockfile is committed before this CU.
- `pnpm/action-setup@v3` — confirm this is the current stable version; the action has gone through version bumps. Check `https://github.com/pnpm/action-setup` for the latest major.
- The workflow runs on `push` to `main` AND on `pull_request`. This is intentional — direct pushes to `main` during solo development should also be validated.
- Do not add secrets or environment variables to the CI workflow at this stage. Any step that requires secrets will fail — that is correct behavior and the desired guard.

---

### CU-007 — Add environment variable contract and safe config loader

**Branch name:** `cu/cu-007-env-contract`

**Commit message:** `config: add typed environment contract (CU-007)`

#### Goal

Centralize environment variable validation using Zod. Make missing required variables fail fast with a clear error. Separate public mobile-safe config from backend secrets. Prevent any secret from being accidentally committed.

#### Relevant docs / sections

- `primis_full_implementation_spec_commit_plan.md` Phase A CU-007
- `primis_technical_architecture_document.md` §8 (environment strategy), §8.2 (isolation), §8.3 (config loading)
- `primis_ai_context_engine_spec.md` §0.1 rule 9 (do not log raw health data, AI prompts, or sensitive values)
- `primis_mvp_build_plan_milestones.md` §28–29 (env and secrets strategy — referenced in spec)

#### Files created / edited

```text
.env.example                          # all env vars with placeholder values; committed to repo
.gitignore                            # confirm .env and .env.local are ignored (set in CU-001; verify here)
packages/config/package.json          # add zod dependency, update scripts
packages/config/tsconfig.json         # already exists; confirm includes src/
packages/config/src/env.ts            # Zod schema + validated env export
packages/config/src/index.ts         # re-exports env and any future config utilities
packages/config/src/env.test.ts       # tests: valid env parses; missing required throws; invalid type throws
```

> Remove `packages/config/src/placeholder.test.ts` from CU-005 when adding real tests.

#### In scope

**`.env.example`** — placeholders only, committed to repo:

```bash
# ============================================================
# Primis Environment Variables — EXAMPLE FILE
# Copy to .env for local development. Never commit .env.
# ============================================================

# --- App (public / mobile-safe) ---
NODE_ENV=development
APP_ENV=local

# --- Backend API (server-side only) ---
DATABASE_URL=postgres://primis:primis@localhost:5432/primis_dev
DATABASE_SSL=false

# --- Auth (Cognito — placeholder; real values are Phase Z) ---
COGNITO_USER_POOL_ID=PLACEHOLDER
COGNITO_CLIENT_ID=PLACEHOLDER
COGNITO_REGION=us-east-1

# --- Provider OAuth (placeholder; real values are Phase Z) ---
GOOGLE_HEALTH_CLIENT_ID=PLACEHOLDER
GOOGLE_HEALTH_CLIENT_SECRET=PLACEHOLDER

# --- AI Gateway (placeholder; real keys are Phase Z) ---
OPENAI_API_KEY=PLACEHOLDER
ANTHROPIC_API_KEY=PLACEHOLDER

# --- AWS (never commit real values; use OIDC for CI) ---
AWS_REGION=us-east-1
```

**`packages/config/src/env.ts`** structure:

```typescript
import { z } from 'zod';

/**
 * Schema for public/mobile-safe config values (safe to expose in client bundles).
 * Extend this schema for any value that is safe to ship in the mobile app.
 */
const publicEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
});

/**
 * Schema for backend-only secrets and service config.
 * These values MUST NOT appear in any mobile bundle.
 */
const backendEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_REGION: z.string().default('us-east-1'),
  GOOGLE_HEALTH_CLIENT_ID: z.string().min(1),
  GOOGLE_HEALTH_CLIENT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type BackendEnv = z.infer<typeof backendEnvSchema>;

/**
 * Validates and returns public env vars.
 * Safe to call from mobile app build-time config.
 */
export function loadPublicEnv(raw: NodeJS.ProcessEnv = process.env): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[config] Invalid public environment variables:\n${result.error.toString()}`,
    );
  }
  return result.data;
}

/**
 * Validates and returns backend env vars.
 * MUST NOT be called from mobile code.
 * In Phase A, provider/AI keys may be PLACEHOLDER values; validation still passes
 * because the schema only checks presence and type, not key validity.
 */
export function loadBackendEnv(raw: NodeJS.ProcessEnv = process.env): BackendEnv {
  const result = backendEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[config] Invalid backend environment variables:\n${result.error.toString()}`,
    );
  }
  return result.data;
}
```

**`packages/config/src/env.test.ts`** must cover:
- `loadPublicEnv` succeeds with valid input
- `loadPublicEnv` throws a descriptive error when `NODE_ENV` is missing or invalid
- `loadBackendEnv` succeeds with all required fields populated (use the `.env.example` placeholder values)
- `loadBackendEnv` throws when `DATABASE_URL` is missing
- `loadBackendEnv` correctly transforms `DATABASE_SSL` string to boolean

#### Out of scope

- Real secrets (all values remain `PLACEHOLDER` in `.env.example`)
- Secrets Manager integration (Phase D/Z — local development uses `.env` files)
- SSM Parameter Store loader
- Mobile-specific Expo env handling (EAS `env` fields in `app.config.ts` — Phase C)

#### Acceptance criteria

- `.env.example` contains only placeholder values; no real credentials
- `.env` is in `.gitignore` and is not tracked
- `loadPublicEnv()` throws a clear error when a required public var is missing
- `loadBackendEnv()` throws a clear error when a required backend var is missing
- `pnpm --filter @primis/config test` passes all tests
- `pnpm --filter @primis/config typecheck` passes

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/config typecheck
pnpm --filter @primis/config test
# Confirm .env is not tracked:
git status --short | grep "\.env$" # should return nothing
```

#### Likely pitfalls

- The `DATABASE_URL`, `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` will contain `PLACEHOLDER` strings locally. The Zod schema only validates presence (`.min(1)`) — it does not validate key format or liveness. This is intentional for Phase A.
- Do not use `process.env.DATABASE_URL!` (non-null assertion) anywhere. Always go through the validated loader.
- `packages/config` must not import from any other `packages/*`, `apps/*`, or `services/*` — it is a leaf dependency. Circular imports will break the workspace.
- Zod should be listed in `dependencies` (not `devDependencies`) of `packages/config/package.json` since runtime code imports it.
- The `env.ts` file uses `process.env`. Ensure `packages/config/tsconfig.json` includes `"types": ["node"]` or that `@types/node` is in devDependencies.

---

## 5. Phase-Level Guardrails

These rules apply to every CU in Phase A and must be re-stated in each agent handoff prompt:

| Guardrail | Rule |
|---|---|
| No secrets committed | `.env`, `.env.local`, real API keys, OAuth client secrets, and AWS credentials must never appear in any committed file. `.env.example` contains placeholders only. |
| No production resources | Do not create, modify, or reference real AWS resources. CDK stacks that exist in `infrastructure/cdk/` are valid-but-undeployed. Phase Z is when real resources are created. |
| No real OAuth / provider credentials | Google Health OAuth client IDs/secrets, Apple team IDs, Facebook app secrets remain `PLACEHOLDER` throughout Phase A. |
| No database schema | No migration files, no SQL DDL, no Kysely/Drizzle schema files. Database schema is Phase D. |
| No mobile app generation | Do not run `expo init`, `create-expo-app`, or any scaffolding command. `apps/mobile/.gitkeep` exists only as a directory placeholder. |
| No scoring / AI / UI implementation | Do not implement any algorithm, AI call, design token, or UI component. Those phases are C, F, G, I respectively. |
| Do not silently change source-of-truth docs | If an implementation finding contradicts a source doc, create `docs/decisions/ADR-000X-<topic>.md` and reference the conflict explicitly. Do not overwrite the source doc. |

---

## 6. Handoff Prompt Template

Copy and adapt this template when handing a commit unit to a new agent session. Replace all `<PLACEHOLDER>` values before sending.

```
You are a senior AI coding agent working on the Primis monorepo.

Your task is to implement exactly ONE commit unit: <CU-ID> — <CU-TITLE>.

BEFORE writing any code, read these documents:

1. docs/source-of-truth/primis_full_implementation_spec_commit_plan.md
   Read: §0 Purpose, §2 Non-Negotiable Principles, §3 Commit Unit Contract, §4 Architecture Decisions, Phase A CU-<CU-ID>

2. docs/source-of-truth/primis_technical_architecture_document.md
   Read: §0, §6, §7, §8

3. docs/source-of-truth/primis_mvp_build_plan_milestones.md
   Read: §0, §0.5, §6

4. <ADD ANY CU-SPECIFIC DOCS FROM THE PLAN SECTION FOR THIS CU>

5. plans/phase-a-repo-tooling-foundation.md
   Read: §4 <CU-ID> section and §5 Guardrails

THEN implement only the files listed under "Files created / edited" for <CU-ID>.

GUARDRAILS — apply to every line you write:
- Do not commit .env, real credentials, real provider payloads, or real API keys.
- Do not create mobile app scaffolding, database schemas, scoring code, AI code, or UI components.
- Do not edit source-of-truth docs. If you find a conflict, create docs/decisions/ADR-<topic>.md.
- Do not implement work from Phase B (CU-008+) or any later phase.
- Use commit message format: `<area>: <short imperative> (<CU-ID>)`
- Use branch: `cu/<cu-id-lowercase>-<short-name>`

AFTER implementing:
1. Run the verification commands listed in the plan.
2. Confirm all acceptance criteria are met.
3. State any known limitations or deferred decisions.
4. Do not commit until all checks are green.
```

---

## 7. Definition of Done for Phase A

Phase A is complete when ALL of the following are true:

### Repository structure

- [ ] All directories from implementation spec §4.1 exist: `apps/`, `services/`, `packages/`, `infrastructure/`, `database/`, `docs/`, `scripts/`, `.github/`
- [ ] `pnpm-workspace.yaml` declares `apps/*`, `services/*`, `packages/*`, `infrastructure/*`
- [ ] `README.md` describes the product and links to `docs/source-of-truth/`
- [ ] `.gitignore` prevents `.env` from being tracked

### Documentation

- [ ] All 9 source-of-truth documents are present under `docs/source-of-truth/` and unchanged
- [ ] `docs/README.md` lists all source-of-truth documents in required reading order
- [ ] `CONTRIBUTING.md` documents commit format and branch naming conventions
- [ ] `.ai-agent-instructions.md` states agent boundary rules
- [ ] `database/fixtures/README.md` documents redaction policy and data sensitivity levels

### TypeScript

- [ ] `tsconfig.base.json` has `"strict": true`
- [ ] `packages/config/tsconfig.json` extends the base config
- [ ] `pnpm typecheck` exits with code 0

### Linting and formatting

- [ ] `.eslintrc.cjs` exists and catches unused variables and explicit `any`
- [ ] `.prettierrc` exists with project-standard settings
- [ ] `.editorconfig` exists
- [ ] `pnpm lint` exits with code 0 and zero warnings
- [ ] `pnpm format:check` exits with code 0 (no diff)

### Testing

- [ ] `vitest.config.ts` exists at repo root with workspace config
- [ ] `packages/config` has at least one passing test
- [ ] `pnpm test` exits with code 0
- [ ] `tests/README.md` documents fixture redaction policy

### CI

- [ ] `.github/workflows/ci.yml` runs lint, typecheck, test, format:check
- [ ] Workflow uses `permissions: contents: read`
- [ ] No AWS credentials or secrets are referenced in CI
- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile is committed)

### Environment contract

- [ ] `.env.example` contains only placeholder values
- [ ] `.env` is not tracked by git
- [ ] `packages/config/src/env.ts` exports `loadPublicEnv` and `loadBackendEnv`
- [ ] Both loaders throw descriptive Zod errors on invalid input
- [ ] `pnpm --filter @primis/config test` passes

### Guardrails verified

- [ ] `git grep -r "sk-" .` returns nothing (no OpenAI-format keys)
- [ ] `git grep -r "AKIA" .` returns nothing (no AWS access key IDs)
- [ ] `git grep -r "client_secret" -- "*.ts" "*.js"` returns nothing in source files
- [ ] No `.env` file in `git status` output

---

## 8. Known Risks and Decisions to Defer

| Risk / Decision | Status | Where to resolve |
|---|---|---|
| ESLint v8 vs v9 flat config | Deferred — use ESLint v8 legacy format (`eslintrc.cjs`) for now to avoid flat-config complexity | Migrate to flat config in a future CU when team and tooling stabilize |
| `moduleResolution: "bundler"` vs `"node16"` for backend services | Deferred — `tsconfig.base.json` uses `"bundler"` for Vitest/Vite compatibility; backend services may need `"node16"` in their own tsconfig | Address per-service in Phase D (CU-014+) |
| TypeScript project references / composite builds | Deferred — add composite builds when the package graph is non-trivial (Phase B/C) | Document in `docs/decisions/ADR-003-ts-project-references.md` when implemented |
| Node.js version pinning | Deferred — CI uses Node 20 LTS; add `.nvmrc` or `engines` field in root package.json | Add before onboarding second developer |
| pnpm version pinning | Assumed v9 in CI. Confirm with `pnpm -v` locally and add `packageManager` field to root `package.json` | CU-003 or a follow-up cleanup commit |
| `apps/mobile` vs `apps/mobile/` naming consistency | The implementation spec and TAD both use `apps/mobile/`; no conflict | N/A |
| Google Health API parity matrix doc status | Document exists in `docs/source-of-truth/` but validation against a real account is Phase Z (manual). Future agents must not treat it as confirmed availability data. | Phase Z / M1 manual validation |
| `docs/source-of-truth/` already contains 9 docs (not 7) | The implementation spec §1 references 7 docs, but the repo also contains `primis_full_implementation_spec_commit_plan.md` itself and `primis_google_health_api_feature_parity_matrix.md`. Both are valid source docs. | No action required; acknowledge in `docs/README.md` reading order |

---

## 9. Next Phase Preview — Phase B Awareness

**Phase A must be complete before Phase B begins.** Do not implement any of the following in Phase A.

Phase B — Shared Contracts and Health Model Foundations (CU-008 onward) will create:

| CU | Title | First file created |
|---|---|---|
| CU-008 | Core type package with domain enums | `packages/core-types/src/provider.ts` |
| CU-009 | Canonical metric registry | `packages/health-metrics/src/registry.ts` |
| CU-010 | Unit conversion utilities | `packages/health-metrics/src/units.ts` |
| CU-011 | API contract envelope and error schema | `packages/api-contracts/src/envelope.ts` |
| CU-012 | Score and data-quality DTOs | `packages/api-contracts/src/scores.ts` |
| CU-013 | Fixture redaction helpers | `scripts/redact-fixture.ts` |

**Phase B dependency on Phase A:**
- All Phase B packages extend `tsconfig.base.json` from CU-003
- All Phase B packages are linted by the ESLint config from CU-004
- All Phase B tests run through the Vitest workspace from CU-005
- All Phase B CI checks pass through the GitHub Actions workflow from CU-006
- Phase B packages that need env values import `loadBackendEnv` from `@primis/config` (CU-007)

**Before starting CU-008, the executing agent must:**
1. Confirm Phase A DoD checklist is fully checked
2. Read `primis_data_model_health_metric_schema.md` §5–§9 for enum values and metric registry structure
3. Read `primis_scoring_algorithms_spec.md` §5–§6 for score types and algorithm version conventions
4. Read `primis_ai_context_engine_spec.md` §7–§8 for AI intent types

---

*End of Phase A — Repo and Tooling Foundation Plan*
