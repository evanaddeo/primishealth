# Contributing to Primis

This guide applies to human contributors and AI coding agents alike. Read it before writing any code.

---

## 1. Commit-Unit Workflow

Primis is built one **commit unit (CU)** at a time. Each CU is a single focused change with a defined
scope, acceptance criteria, and verification commands. This approach keeps the history bisectable,
makes AI agent handoffs safe, and prevents scope creep.

Rules:

- **One CU = one commit.** Do not bundle unrelated changes.
- **Do not start CU-N+1 until CU-N's acceptance criteria and verification commands all pass.**
- **Do not implement work from a later phase** even if it seems convenient. Scope is defined by the
  implementation spec, not by what feels natural in the moment.
- **Source-of-truth documents must not be silently edited.** If an implementation finding contradicts a
  source doc, create a decision record (see §5 below).

The full Phase A commit-unit dependency graph and per-CU details are in
`plans/phase-a-repo-tooling-foundation.md`.

---

## 2. Branch Naming

Format: `cu/<cu-id-lowercase>-<short-name>`

Examples:

```text
cu/cu-001-init-monorepo
cu/cu-002-docs-and-contribution-guide
cu/cu-003-typescript-baseline
cu/cu-004-lint-format-editor
```

Rules:

- Use the exact CU ID from the implementation spec (`primis_full_implementation_spec_commit_plan.md`).
- Use lowercase and hyphens only — no underscores, no slashes within the short name.
- The short name should match the commit unit title in the spec (abbreviated is fine).

---

## 3. Commit Message Format

Format: `<area>: <short imperative summary> (<CU-ID>)`

Examples:

```text
repo: initialize Primis monorepo structure (CU-001)
docs: add source-of-truth documentation guide (CU-002)
repo: configure strict TypeScript workspace (CU-003)
repo: add lint formatting and editor config (CU-004)
test: add Vitest baseline and fixtures convention (CU-005)
ci: add baseline checks workflow (CU-006)
config: add typed environment contract (CU-007)
```

Valid area prefixes:

| Prefix     | When to use                                           |
| ---------- | ----------------------------------------------------- |
| `repo`     | Repository structure, tooling config, workspace setup |
| `docs`     | Documentation only                                    |
| `config`   | Environment, shared config packages                   |
| `test`     | Test infrastructure, fixtures, test conventions       |
| `ci`       | GitHub Actions workflows                              |
| `feat`     | New product feature (Phase B+)                        |
| `fix`      | Bug fix                                               |
| `refactor` | Code restructuring without behavior change            |
| `chore`    | Dependency updates, cleanup with no behavioral effect |
| `mobile`   | Mobile app code (`apps/mobile`)                       |
| `design`   | Design system code (`packages/design-system`)         |

---

## 4. Verification Commands

Before committing, run these commands and confirm all pass with exit code 0:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

For Phase A (before CU-003/004/005 are implemented), only the commands that exist are required.
The implementation spec for each CU lists the exact verification commands for that unit.

---

## 5. Architecture Decision Records (ADRs)

If an implementation finding contradicts a source-of-truth document, **do not silently edit the source
doc**. Instead:

1. Create `docs/decisions/ADR-000X-<short-topic>.md` (use the next available sequence number).
2. Document:
   - Which source doc is contradicted and which section.
   - What the implementation found.
   - The decision made and the rationale.
   - Any follow-up actions required.
3. Reference the ADR in your commit message or PR description.

ADR template:

```markdown
# ADR-000X: <Title>

**Date:** YYYY-MM-DD
**Status:** Accepted | Proposed | Superseded

## Context

<What source doc and section is affected. What was found during implementation.>

## Decision

<What was decided and why.>

## Consequences

<What changes as a result. Any follow-up work required.>
```

---

## 6. Source-of-Truth Document Policy

- **Never overwrite source-of-truth documents** in `docs/source-of-truth/` during implementation.
- If filenames or paths need correction, note it and fix paths only — never change content.
- The reading order and authority hierarchy for all 9 source docs is in `docs/README.md`.

---

## 7. No Secrets Policy

- Never commit `.env`, `.env.local`, or any file containing real credentials.
- `.env.example` contains placeholder values only and is the only env file committed to the repo.
- Real provider credentials (Google Health OAuth, AWS keys, OpenAI keys) remain `PLACEHOLDER` until
  Phase Z deployment.
- Verify before committing:

```bash
git grep -r "sk-" .          # should return nothing (no OpenAI-format keys)
git grep -r "AKIA" .         # should return nothing (no AWS access key IDs)
git status --short | grep "\.env$"  # should return nothing
```
