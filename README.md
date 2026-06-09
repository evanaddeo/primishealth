# Primis

Primis is a health data aggregation, deterministic scoring, and AI-native coaching platform. It connects to Google Health, Fitbit, Apple HealthKit, and other providers to give users a unified, scored view of their sleep, recovery, activity, and nutrition — with AI-powered coaching that explains what the numbers mean and what to do next.

---

## Documentation

All source-of-truth planning and architecture documents live in [`docs/source-of-truth/`](docs/source-of-truth/).

Read them in this order before implementing anything:

1. [`primis_full_implementation_spec_commit_plan.md`](docs/source-of-truth/primis_full_implementation_spec_commit_plan.md) — commit sequencing authority
2. [`primis_mvp_build_plan_milestones.md`](docs/source-of-truth/primis_mvp_build_plan_milestones.md) — milestone and gate intent
3. [`primis_technical_architecture_document.md`](docs/source-of-truth/primis_technical_architecture_document.md) — system boundaries and AWS architecture
4. [`primis_data_model_health_metric_schema.md`](docs/source-of-truth/primis_data_model_health_metric_schema.md) — schema, metric codes, enums
5. [`primis_scoring_algorithms_spec.md`](docs/source-of-truth/primis_scoring_algorithms_spec.md) — deterministic scoring algorithms
6. [`primis_ai_context_engine_spec.md`](docs/source-of-truth/primis_ai_context_engine_spec.md) — AI gateway and context engine rules
7. [`primis_ui_ux_design_system_spec.md`](docs/source-of-truth/primis_ui_ux_design_system_spec.md) — design tokens, components, accessibility
8. [`primis_product_requirements_document.md`](docs/source-of-truth/primis_product_requirements_document.md) — product scope and user journeys
9. [`primis_google_health_api_feature_parity_matrix.md`](docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md) — provider parity reference

Architecture decision records go in [`docs/decisions/`](docs/decisions/).  
Operational runbooks go in [`docs/runbooks/`](docs/runbooks/).

---

## Local Setup

> **Status:** Repository skeleton only (Phase A, CU-001). Full setup instructions will be added as tooling is configured in CU-002 through CU-007.

**Prerequisites:**

- Node.js ≥ 20
- pnpm ≥ 9

**Install dependencies** (once tooling is configured):

```bash
pnpm install
```

**Run checks:**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

---

## Repository Structure

```text
primis/
  apps/
    mobile/          # React Native + Expo Dev Client app
  services/
    api/             # Backend API handlers
    workers/         # Async jobs, sync workers, scoring workers
    ai/              # AI provider abstraction, context engine
  packages/
    core-types/      # Shared TypeScript types, enums, contracts
    health-metrics/  # Metric registry, unit definitions, DTOs
    scoring/         # Pure deterministic scoring algorithms
    api-contracts/   # Typed API envelope and error schemas
    design-system/   # Design tokens and shared components
    config/          # Environment config loader (Zod-validated)
  infrastructure/
    cdk/             # AWS CDK stacks
  database/
    migrations/      # SQL migration files
    seeds/           # Seed data for local development
    fixtures/        # Redacted test fixtures (no real user data)
  docs/
    source-of-truth/ # All planning and architecture documents
    decisions/       # Architecture decision records (ADRs)
    runbooks/        # Operational runbooks
  scripts/           # Developer and CI utility scripts
  .github/           # GitHub Actions workflows
```

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for commit conventions, branch naming, and agent boundary rules. *(Added in CU-002.)*
