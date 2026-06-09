# ADR-0001: Use `vitest.workspace.ts` Instead of `vitest.config.ts` for Workspace Config

**Date:** 2026-06-09
**Status:** Accepted
**CU:** CU-005

---

## Context

`plans/phase-a-repo-tooling-foundation.md` (CU-005) specifies creating a root `vitest.config.ts`
with `defineWorkspace(...)` as its default export:

```typescript
import { defineWorkspace } from 'vitest/config';
export default defineWorkspace(['packages/*/vitest.config.ts', 'services/*/vitest.config.ts']);
```

During implementation, this configuration caused a fatal runtime error:

```
Error: config must export or return an object.
```

The error originates from Vite's internal config loader (`loadConfigFromFile`), which Vitest 1.x
uses to process `vitest.config.ts`. Vite expects an object-shaped config; `defineWorkspace` returns
an array, which Vite rejects.

## Decision

Rename the root workspace config to `vitest.workspace.ts`. Vitest 1.x auto-detects this filename
without any additional flags. The `defineWorkspace` call is identical; only the filename changes:

- **Removed:** `vitest.config.ts` (with `defineWorkspace`)
- **Added:** `vitest.workspace.ts` (same content)

The root `pnpm test` script (`vitest run`) remains unchanged — Vitest 1.x picks up
`vitest.workspace.ts` automatically.

## Consequences

- `pnpm test` passes and the `@primis/config` placeholder test runs correctly.
- Future packages add a `vitest.config.ts` using `defineConfig` (not `defineWorkspace`); this is
  unchanged from the spec.
- The root workspace entry point is `vitest.workspace.ts`, not `vitest.config.ts`. All future CU
  plans and documentation that reference the workspace config file should use the corrected name.
- No follow-up migration required; this is the stable approach for Vitest 1.x+.
