/**
 * BaselineScreen — step 8: building-baseline explainer + finish (UI/UX §7.4).
 *
 * Sets honest expectations before Home: scores are provisional until enough
 * recent data exists (PRD-FR-ONB-008). Uses the exact spec framing and never a
 * blank screen. Finishing persists selections (mock-aware) and routes to Home.
 *
 * The primary action runs the async `finish()`; it disables while saving so the
 * user can't double-submit.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { OnboardingScaffold } from '../components';
import { useOnboarding } from '../useOnboarding';

const BASELINE_POINTS: readonly string[] = [
  'Your scores start provisional and sharpen as recent data syncs.',
  'Adding context — workouts, sleep, manual notes — improves accuracy over time.',
  'You’ll always see why a score is provisional, never a blank screen.',
];

export function BaselineScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goBack, finish } = useOnboarding('baseline');
  const { colors, spacing, radius } = useTheme();
  const [saving, setSaving] = useState(false);

  const handleFinish = (): void => {
    if (saving) return;
    setSaving(true);
    void finish().catch(() => {
      // Local selections are already persisted in settingsStore; re-enable so
      // the user can retry the (mock-aware) submit if a remote write ever fails.
      setSaving(false);
    });
  };

  return (
    <OnboardingScaffold
      testID="onboarding-baseline"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="You’re set"
      title="Primis is building your baseline."
      subtitle="Your scores are provisional until enough recent data is available."
      primaryLabel={saving ? 'Setting up…' : 'Go to Primis'}
      onPrimary={handleFinish}
      primaryDisabled={saving}
    >
      <Card>
        <View style={{ gap: spacing.md }}>
          {BASELINE_POINTS.map((point) => (
            <View
              key={point}
              style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 7,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}
              />
              <Text variant="bodyMedium" color="secondary" style={{ flex: 1 }}>
                {point}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </OnboardingScaffold>
  );
}
