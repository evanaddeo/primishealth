/**
 * Fixture redaction helpers for @primis/core-types.
 *
 * Provides `redactFixture()` and `SENSITIVE_FIELD_PATTERNS` to strip or replace
 * sensitive fields from JSON fixtures before they are committed to the repository.
 *
 * Policy: if there is any uncertainty about whether a field is sensitive, treat it
 * as sensitive and redact it. Never commit real OAuth tokens, API keys, email
 * addresses, user UUIDs, real names, or device identifiers in fixture files.
 *
 * See `database/fixtures/README.md` for the full fixture redaction policy.
 * See `primis_data_model_health_metric_schema.md §5.4` for sensitivity level definitions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single redaction rule applied by `redactFixture()`.
 *
 * A field value is replaced when:
 *   - The JSON key matches at least one entry in `fieldNamePatterns`, AND
 *   - The string value matches at least one entry in `valuePatterns`.
 *
 * The `valuePatterns` array may include `/.+/` to redact any non-empty string
 * in a field whose name is inherently sensitive (e.g. `api_key`).
 */
export interface RedactionPattern {
  /** Human-readable identifier for this rule (used in test output). */
  readonly name: string;
  /** Regexes matched against the JSON object key. */
  readonly fieldNamePatterns: RegExp[];
  /** Regexes matched against the string value. A match on ANY pattern triggers redaction. */
  readonly valuePatterns: RegExp[];
  /** Replacement string written in place of the sensitive value. */
  readonly replacement: string;
}

// ---------------------------------------------------------------------------
// Canonical sensitive field patterns
// ---------------------------------------------------------------------------

/**
 * Canonical list of redaction patterns used by `redactFixture()`.
 *
 * Ordered from most-specific to least-specific. The first matching pattern wins.
 *
 * Sourced from:
 * - Data Model §5.4 (S3/S4 sensitivity fields)
 * - Phase B CU-013 fixture redaction plan
 */
export const SENSITIVE_FIELD_PATTERNS: RedactionPattern[] = [
  // S4 — OAuth access / refresh / identity tokens.
  // Redacts any non-empty value in a field whose name suggests a token.
  // Erring on the side of caution: a refresh_token field with any content is sensitive.
  {
    name: 'oauth_token',
    fieldNamePatterns: [
      /^access_token$/i,
      /^refresh_token$/i,
      /^id_token$/i,
      /^auth_token$/i,
      /^bearer_token$/i,
      /^token$/i,
    ],
    // Match any non-empty value — token formats vary by provider.
    // Also explicitly matches Google OAuth 2 access tokens (ya29. prefix).
    valuePatterns: [/^ya29\./, /.+/],
    replacement: '[REDACTED_TOKEN]',
  },

  // S4 — API keys and client secrets.
  // Redacts any non-empty value in a field named like an API key or secret.
  {
    name: 'api_key',
    fieldNamePatterns: [
      /api[_-]?key/i,
      /client[_-]?secret/i,
      /secret[_-]?key/i,
      /private[_-]?key/i,
    ],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_KEY]',
  },

  // S3 — Email addresses.
  // Matches fields named "email" (or similar) whose value looks like an email.
  // Uses the `.invalid` TLD convention for synthetic fixtures per database/fixtures/README.md §6.
  {
    name: 'email',
    fieldNamePatterns: [/email/i, /e_mail/i],
    valuePatterns: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/],
    replacement: '[REDACTED_EMAIL]',
  },

  // S3 — Real user / subject identifiers.
  // Redacts any non-empty value in a field whose name is a known user identity field.
  // The field name match (user_id, sub, subject, owner_id) is the primary guard;
  // we do not narrow further by value shape because:
  //   (a) the acceptance criteria (CU-013 plan) shows user_id:'abc-123' → [REDACTED_UUID], and
  //   (b) the general policy is "if uncertain, treat as sensitive".
  // Non-identity UUIDs (e.g. metric_definition_id) are safe because their key names
  // do not match these patterns.
  {
    name: 'user_id',
    fieldNamePatterns: [/^user[_-]?id$/i, /^sub$/i, /^subject$/i, /^owner[_-]?id$/i],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_UUID]',
  },

  // S3 — Real personal names.
  // Redacts any non-empty value in a field that stores a person's display name or
  // component names (first, last, full, given, family).
  {
    name: 'name',
    fieldNamePatterns: [
      /^(display_)?name$/i,
      /^(first|last|full|given|family)[_-]?name$/i,
      /^username$/i,
    ],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_NAME]',
  },

  // S3 — Precise device identifiers.
  // UDIDs, advertising IDs, and push notification tokens can identify a real device / person.
  {
    name: 'device_id',
    fieldNamePatterns: [
      /^device[_-]?id$/i,
      /^udid$/i,
      /^idfa$/i,
      /^idfv$/i,
      /^advertising[_-]?id$/i,
      /^push[_-]?token$/i,
      /^notification[_-]?token$/i,
      /^apns[_-]?token$/i,
      /^fcm[_-]?token$/i,
    ],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_DEVICE_ID]',
  },
];

// ---------------------------------------------------------------------------
// redactFixture()
// ---------------------------------------------------------------------------

/**
 * Recursively walks `input` and returns a new deep copy with all sensitive
 * field values replaced according to `SENSITIVE_FIELD_PATTERNS`.
 *
 * Rules:
 * - Objects are cloned; the original is never mutated.
 * - Arrays are recursed element-by-element.
 * - Primitive values (number, boolean, null, undefined) are returned as-is.
 * - String values in a field whose name matches a `fieldNamePatterns` entry AND
 *   whose value matches a `valuePatterns` entry are replaced with `replacement`.
 * - Numeric health values (steps, HRV, SpO2 %) are preserved — they are not
 *   personally identifying on their own (see B-Q-005 in the Phase B plan).
 *
 * @param input - The fixture object, array, or scalar to redact.
 * @returns A new value with all sensitive strings replaced.
 */
export function redactFixture(input: unknown): unknown {
  return redactNode(input);
}

/** Internal recursive worker. Processes a single node (any JSON-compatible value). */
function redactNode(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item));
  }

  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }

  // Numbers, booleans, symbols — return unchanged (non-identifying by themselves).
  return value;
}

/** Internal worker: processes a plain object, cloning it with sensitive values replaced. */
function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const rawValue = obj[key];

    if (typeof rawValue === 'string') {
      result[key] = redactStringValue(key, rawValue);
    } else {
      // Recurse into nested objects/arrays; pass through primitives.
      result[key] = redactNode(rawValue);
    }
  }

  return result;
}

/**
 * Checks `value` against all `SENSITIVE_FIELD_PATTERNS` using `fieldKey` as the
 * object key name. Returns the replacement string if any pattern matches, or the
 * original value otherwise.
 */
function redactStringValue(fieldKey: string, value: string): string {
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    const keyMatches = pattern.fieldNamePatterns.some((re) => re.test(fieldKey));
    if (!keyMatches) continue;

    const valueMatches = pattern.valuePatterns.some((re) => re.test(value));
    if (valueMatches) {
      return pattern.replacement;
    }
  }

  return value;
}
