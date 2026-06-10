#!/usr/bin/env node
/**
 * redact-fixture — CLI wrapper for the `redactFixture()` helper.
 *
 * Reads a JSON fixture from stdin, applies all `SENSITIVE_FIELD_PATTERNS`, and
 * writes the redacted JSON to stdout. Exits 1 on parse errors.
 *
 * Usage:
 *   pnpm tsx scripts/redact-fixture.ts < raw_fixture.json > redacted_fixture.json
 *
 * Or pipe inline:
 *   echo '{"access_token":"ya29.abc"}' | pnpm tsx scripts/redact-fixture.ts
 *
 * See `packages/core-types/src/redaction.ts` for the canonical `SENSITIVE_FIELD_PATTERNS`
 * list and the `redactFixture()` implementation.
 *
 * See `database/fixtures/README.md` for the full fixture redaction policy.
 */

import { redactFixture } from '@primis/core-types';

async function main(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    process.stderr.write('redact-fixture: no input received on stdin\n');
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`redact-fixture: failed to parse JSON: ${message}\n`);
    process.exit(1);
  }

  const redacted = redactFixture(parsed);

  process.stdout.write(JSON.stringify(redacted, null, 2) + '\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`redact-fixture: unexpected error: ${message}\n`);
  process.exit(1);
});
