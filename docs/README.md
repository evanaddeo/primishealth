# Primis Docs

This directory contains all planning, design, and operational documents for the Primis project.

## Source-of-Truth Documents

All seven primary specification documents plus two companion docs live under `docs/source-of-truth/`.
Read them in the order below before implementing any commit unit. Priority order also governs conflict
resolution — if two documents disagree, the lower priority number wins.

| Priority | Filename | Authority Domain |
|---|---|---|
| 1 | `primis_full_implementation_spec_commit_plan.md` | Commit sequencing authority; commit format; branch naming; verification commands; Definition of Done per commit unit |
| 2 | `primis_mvp_build_plan_milestones.md` | Milestone intent; health-data-model-first constraint; correct build order; M0–M5 work items and gates |
| 3 | `primis_technical_architecture_document.md` | Technology stack decisions; monorepo layout; AWS service boundaries; environment strategy; code boundary rules |
| 4 | `primis_data_model_health_metric_schema.md` | Canonical table definitions; metric codes; enums; units; provider mappings; data sensitivity classification (S0–S4); deletion conventions; fixture redaction policy |
| 5 | `primis_scoring_algorithms_spec.md` | Score formulas; component baselines; data-quality confidence; deterministic-only rule — do not invent score formulas ad hoc |
| 6 | `primis_ai_context_engine_spec.md` | AI gateway abstraction; intent classification; context packets; safety rules — no raw health data in prompts or logs |
| 7 | `primis_ui_ux_design_system_spec.md` | Design tokens; navigation patterns; component library; motion; accessibility — all UI must use design tokens; no ad hoc styles |
| 8 | `primis_product_requirements_document.md` | Product scope; core principles; user journeys; phase non-goals |
| 9 | `primis_google_health_api_feature_parity_matrix.md` | Required companion doc for provider phases; documents Google Health API surface, data types, and Fitbit field mapping. No implementation in Phase A. Treat as unconfirmed until M1 manual validation. |

### Conflict resolution

When two source documents conflict, the lower priority number (higher in the table) is authoritative.
If an implementation finding contradicts any source doc, **do not silently edit the doc** — create an
ADR under `docs/decisions/` instead.

---

## Other Directories

### `docs/decisions/`

Architecture Decision Records (ADRs) and decision records documenting deviations from source-of-truth
documents or significant technical choices made during implementation. File naming convention:
`ADR-000X-<short-topic>.md`.

### `docs/runbooks/`

Operational runbooks for production support, incident response, and routine maintenance procedures.
Empty during Phase A; populated as infrastructure is deployed.

---

## Reading Order for a New Agent or Contributor

1. Read this file (`docs/README.md`) to orient yourself.
2. Read `CONTRIBUTING.md` at the repo root for commit-unit workflow and naming conventions.
3. Read `.ai-agent-instructions.md` at the repo root for agent boundary rules.
4. Read the source-of-truth docs in priority order (1–9) for the sections relevant to your commit unit.
5. Read `plans/phase-a-repo-tooling-foundation.md` for the Phase A commit-unit dependency graph and
   per-CU acceptance criteria.
