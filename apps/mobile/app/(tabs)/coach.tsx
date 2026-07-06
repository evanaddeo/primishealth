/**
 * AI Coach tab route (CU-084).
 *
 * Thin Expo Router entry that renders the AI Coach feature screen. All chat
 * logic, streaming, and state live in `src/features/coach`. Mobile never calls a
 * model provider — every AI request flows through the Primis backend.
 *
 * @see apps/mobile/src/features/coach/CoachScreen.tsx
 */

import { CoachScreen } from '../../src/features/coach';

export default function CoachRoute() {
  return <CoachScreen />;
}
