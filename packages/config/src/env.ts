import { z } from 'zod';

// ---------------------------------------------------------------------------
// Public / mobile-safe schema
// ---------------------------------------------------------------------------

/**
 * Environment variables that are safe to include in client-side (mobile) builds.
 * These values contain no credentials or secrets.
 *
 * Extend this schema for any variable that is genuinely non-sensitive and
 * required at mobile build time. Never move backend secrets into this schema.
 *
 * `EXPO_PUBLIC_*` variables are inlined by Expo's Metro bundler at build time.
 * They must be present in the environment when `expo start` / `expo build` runs.
 * Do NOT use `EXPO_PUBLIC_*` for secrets — they are visible in the app bundle.
 */
const publicEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
  /**
   * Base URL for the Primis backend API, inlined into the mobile bundle by Metro.
   * Defaults to `http://localhost:3000` for local development.
   * Set to the real API gateway URL in staging/production builds.
   */
  EXPO_PUBLIC_API_BASE_URL: z.string().url().optional().default('http://localhost:3000'),
  /**
   * When `'true'`, the API client skips real network calls and throws MockModeError.
   * CU-023 mock data provider intercepts these errors for offline UI work.
   * Defaults to `'true'` so local development never requires a running backend.
   * Must be set to `'false'` in staging and production build pipelines.
   */
  EXPO_PUBLIC_MOCK_MODE: z.string().optional().default('true'),
});

// ---------------------------------------------------------------------------
// Backend-only schema (extends public)
// ---------------------------------------------------------------------------

/**
 * Full environment schema for backend services (API, workers, AI gateway).
 *
 * IMPORTANT: Variables defined here MUST NOT appear in any mobile bundle.
 * The mobile app must only ever call `loadPublicEnv`, never `loadBackendEnv`.
 *
 * In Phase A, provider and AI keys carry the literal string "PLACEHOLDER".
 * The schema validates presence and type only — it does not validate key
 * format or liveness. Real secrets are introduced in Phase Z.
 */
const backendEnvSchema = publicEnvSchema.extend({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Auth — AWS Cognito
  COGNITO_USER_POOL_ID: z.string().min(1, 'COGNITO_USER_POOL_ID is required'),
  COGNITO_CLIENT_ID: z.string().min(1, 'COGNITO_CLIENT_ID is required'),
  COGNITO_REGION: z.string().default('us-east-1'),

  // Provider OAuth (Google Health)
  GOOGLE_HEALTH_CLIENT_ID: z.string().min(1, 'GOOGLE_HEALTH_CLIENT_ID is required'),
  GOOGLE_HEALTH_CLIENT_SECRET: z.string().min(1, 'GOOGLE_HEALTH_CLIENT_SECRET is required'),

  // AI Gateway
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // AWS
  AWS_REGION: z.string().default('us-east-1'),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Validated shape of public / mobile-safe environment variables. */
export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Validated shape of all backend environment variables (superset of PublicEnv). */
export type BackendEnv = z.infer<typeof backendEnvSchema>;

// ---------------------------------------------------------------------------
// Loader functions
// ---------------------------------------------------------------------------

/**
 * Validates and returns the public (mobile-safe) environment variables.
 *
 * Safe to call from mobile app build-time configuration. Throws a descriptive
 * error if any required public variable is missing or has an invalid value.
 *
 * @param raw - Raw environment variable map; defaults to `process.env`.
 * @returns Validated public environment config.
 * @throws {Error} If any public variable fails schema validation.
 */
export function loadPublicEnv(raw: NodeJS.ProcessEnv = process.env): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[config] Invalid public environment variables:\n${result.error.toString()}`);
  }
  return result.data;
}

/**
 * Validates and returns all backend environment variables.
 *
 * MUST NOT be called from mobile code. Intended for use in backend services
 * (API server, workers, AI gateway) where secrets are available at runtime.
 *
 * Throws a descriptive error if any required variable is absent or invalid,
 * so misconfigured deployments fail immediately at startup rather than at
 * the point of first use.
 *
 * @param raw - Raw environment variable map; defaults to `process.env`.
 * @returns Validated backend environment config.
 * @throws {Error} If any backend variable fails schema validation.
 */
export function loadBackendEnv(raw: NodeJS.ProcessEnv = process.env): BackendEnv {
  const result = backendEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[config] Invalid backend environment variables:\n${result.error.toString()}`);
  }
  return result.data;
}
