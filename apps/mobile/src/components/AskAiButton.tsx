/**
 * AskAiButton — contextual "Ask AI about this" entry point (CU-085).
 *
 * A shared, token-driven control placed near the AI summary card on a health
 * detail screen. On press it opens the AI Coach tab with a prefilled question
 * and advisory surface metadata (intent + surface + optional local date). It
 * makes NO network/AI call itself — the user still sends the prefilled message
 * on the Coach screen (CU-085 "no auto-trigger on render"; AI spec §22.1 mobile
 * assembles no health context).
 *
 * @see apps/mobile/src/features/coach/contextualNavigation.ts — the pure mapping
 */

import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { Button } from '@primis/design-system';

import {
  COACH_ROUTE,
  buildCoachPrefillParams,
  getAskAiSurfaceConfig,
  type AskAiSurface,
} from '../features/coach/contextualNavigation';

export interface AskAiButtonProps {
  /** Which health surface this entry point sits on. */
  surface: AskAiSurface;
  /** Local date (YYYY-MM-DD) the surface is showing, forwarded as metadata. */
  sourceDate?: string;
  /** Override the default per-surface button label. */
  label?: string;
  testID?: string;
}

export function AskAiButton({
  surface,
  sourceDate,
  label,
  testID,
}: AskAiButtonProps): React.JSX.Element {
  const router = useRouter();
  const config = getAskAiSurfaceConfig(surface);

  const handlePress = useCallback((): void => {
    router.navigate({
      pathname: COACH_ROUTE,
      params: {
        ...buildCoachPrefillParams(surface, sourceDate),
        // One-shot nonce so re-tapping the same surface re-seeds the composer
        // even when the previous prefill params are otherwise identical.
        askAiNonce: String(Date.now()),
      },
    });
  }, [router, surface, sourceDate]);

  return (
    <Button
      variant="secondary"
      label={label ?? config.buttonLabel}
      onPress={handlePress}
      accessibilityHint={config.accessibilityHint}
      {...(testID !== undefined ? { testID } : {})}
    />
  );
}
