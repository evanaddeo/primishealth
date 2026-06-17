/**
 * @primis/mobile — auth feature public surface (CU-059).
 *
 * Route files under `app/auth/` are thin wrappers that render these screen
 * components. Pure helpers and the controller are exported for tests and the
 * navigation gate.
 */

export { SignInScreen } from './screens/SignInScreen';
export { SignUpScreen } from './screens/SignUpScreen';

export { useAuth } from './useAuth';
export type { AuthController, AuthCredentials } from './useAuth';

export {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  MIN_PASSWORD_LENGTH,
} from './validation';
export type { FieldValidation } from './validation';

export { isMockAuthEnabled, createMockToken, isMockToken, MOCK_TOKEN_PREFIX } from './devAuth';

export { SOCIAL_PROVIDERS } from './socialProviders';
export type { SocialProviderMeta } from './socialProviders';
