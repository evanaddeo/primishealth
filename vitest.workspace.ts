import { defineWorkspace } from 'vitest/config';

/**
 * Root Vitest workspace config (auto-detected as `vitest.workspace.ts`).
 *
 * Picks up any package or service that ships its own vitest.config.ts.
 * Packages without tests yet do not need to provide a config — the glob
 * simply produces no matches for them.
 */
export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'services/*/vitest.config.ts',
]);
