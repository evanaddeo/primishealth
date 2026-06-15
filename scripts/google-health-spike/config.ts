/**
 * Spike script configuration (CU-040).
 *
 * Parses the `--mode` CLI argument and reads live-mode credentials from
 * `process.env`. Does NOT use `@primis/config`'s Zod-based loader to avoid
 * failing when spike-specific env vars are absent during normal test runs.
 *
 * Live-mode guard: if `mode === 'live'` and `GOOGLE_HEALTH_TEST_ACCESS_TOKEN`
 * is absent or empty, prints a clear message to stderr and calls
 * `process.exit(1)` immediately — before any network call is attempted.
 *
 * Source authority: phase-e plan CU-040 §In-Scope Work §1 (config.ts).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Operating mode for the Google Health spike script. */
export type SpikeMode = 'mock' | 'live';

/**
 * Fully resolved runtime configuration for the spike script.
 *
 * Produced by `loadSpikeConfig()` after parsing CLI args and environment
 * variables.
 */
export interface SpikeConfig {
  /** Operating mode — mock uses synthetic fixtures; live calls the real API. */
  mode: SpikeMode;

  /**
   * Raw OAuth access token for live mode.
   *
   * Resolved from `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` before any network call.
   * Present only when `mode === 'live'`. NEVER log or include in fixtures.
   */
  accessToken?: string;

  /**
   * Primis user ID written into the archive path component.
   * Default: `'test-user-spike-001'`.
   */
  userId: string;

  /**
   * Number of days in the data look-back window.
   * Default: `7`.
   */
  windowDays: number;

  /**
   * Directory where the Markdown availability report is written.
   * Gitignored — never commit this directory or its contents.
   * Default: `'scripts/google-health-spike/output'` (relative to cwd).
   */
  outputDir: string;
}

// ---------------------------------------------------------------------------
// loadSpikeConfig
// ---------------------------------------------------------------------------

/**
 * Resolves the spike script configuration from CLI args and environment
 * variables.
 *
 * Mode resolution (first match wins):
 *   1. `--mode mock|live` CLI argument
 *   2. `PRIMIS_SPIKE_MODE=mock|live` environment variable
 *   3. Default: `'mock'`
 *
 * Live-mode guard: if `mode === 'live'` and `GOOGLE_HEALTH_TEST_ACCESS_TOKEN`
 * is absent or empty, writes a clear error to stderr and calls
 * `process.exit(1)` — before any network call is attempted.
 *
 * @returns Validated `SpikeConfig`. Never returns in live mode with missing
 *          credentials.
 */
export function loadSpikeConfig(): SpikeConfig {
  const mode = resolveSpikeMode();

  if (mode === 'live') {
    const rawToken = process.env['GOOGLE_HEALTH_TEST_ACCESS_TOKEN'];

    if (rawToken === undefined || rawToken.trim() === '') {
      process.stderr.write(
        '\n' +
          '  ✗  google-health-spike: GOOGLE_HEALTH_TEST_ACCESS_TOKEN is missing\n' +
          '\n' +
          '  Live mode requires a valid Google Health OAuth access token.\n' +
          '  Add it to your local .env file (never commit it) and run:\n' +
          '\n' +
          '    GOOGLE_HEALTH_TEST_ACCESS_TOKEN=<token> \\\n' +
          '      pnpm tsx scripts/google-health-spike/index.ts --mode live\n' +
          '\n' +
          '  See scripts/google-health-spike/README.md for setup instructions.\n' +
          '\n',
      );
      process.exit(1);
    }

    return {
      mode: 'live',
      accessToken: rawToken.trim(),
      userId: 'test-user-spike-001',
      windowDays: 7,
      outputDir: 'scripts/google-health-spike/output',
    };
  }

  return {
    mode: 'mock',
    userId: 'test-user-spike-001',
    windowDays: 7,
    outputDir: 'scripts/google-health-spike/output',
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the spike mode by checking the CLI `--mode` arg first, then the
 * `PRIMIS_SPIKE_MODE` env var, then defaulting to `'mock'`.
 */
function resolveSpikeMode(): SpikeMode {
  const cliMode = parseModeArg();
  if (cliMode !== undefined) return cliMode;

  const envMode = process.env['PRIMIS_SPIKE_MODE'];
  if (envMode === 'live') return 'live';
  if (envMode === 'mock') return 'mock';

  if (envMode !== undefined) {
    process.stderr.write(
      `google-health-spike: unknown PRIMIS_SPIKE_MODE value "${envMode}". ` +
        'Use "mock" or "live".\n',
    );
    process.exit(1);
  }

  return 'mock';
}

/**
 * Parses the `--mode` argument from `process.argv`.
 *
 * Returns `undefined` when the argument is absent.
 * Exits with code 1 if `--mode` is present but its value is unrecognised.
 */
function parseModeArg(): SpikeMode | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--mode');
  if (idx === -1) return undefined;

  const value: string | undefined = args[idx + 1];
  if (value === 'mock') return 'mock';
  if (value === 'live') return 'live';

  process.stderr.write(
    `google-health-spike: invalid --mode value "${value ?? '(none)'}". ` +
      'Use --mode mock or --mode live.\n',
  );
  process.exit(1);
}
