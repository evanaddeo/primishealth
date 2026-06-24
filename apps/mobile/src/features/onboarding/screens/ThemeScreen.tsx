/**
 * ThemeScreen — step 6: theme mode + accent (PRD-FR-ONB-006/007, UI/UX §8).
 *
 * Both selections write straight to `settingsStore`, which drives the live
 * `ThemeProvider`, so the whole app re-themes instantly as the user chooses —
 * a true preview, not a mockup. Both have defaults, so the step is skippable.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { useSettingsStore } from '../../../state/settingsStore';
import { OnboardingScaffold, SelectableRow } from '../components';
import { ACCENT_OPTIONS, THEME_OPTIONS } from '../options';
import { useOnboarding } from '../useOnboarding';

export function ThemeScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('theme');
  const { colors, spacing, radius } = useTheme();

  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

  return (
    <OnboardingScaffold
      testID="onboarding-theme"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Appearance"
      title="Make it yours."
      subtitle="Changes apply instantly. Tune it now or later in Settings."
      primaryLabel="Continue"
      onPrimary={goNext}
      secondaryLabel="Skip — use the default"
      onSecondary={goNext}
    >
      <Text variant="bodySmall" color="muted" weight="semibold">
        THEME
      </Text>
      {THEME_OPTIONS.map((o) => (
        <SelectableRow
          key={o.value}
          testID={`theme-option-${o.value}`}
          label={o.label}
          description={o.description}
          selected={themeMode === o.value}
          onPress={() => setThemeMode(o.value)}
        />
      ))}

      <Text variant="bodySmall" color="muted" weight="semibold" style={{ marginTop: spacing.lg }}>
        ACCENT
      </Text>
      <View style={[styles.swatchRow, { gap: spacing.md }]}>
        {ACCENT_OPTIONS.map((o) => {
          const selected = accentColor === o.value;
          return (
            <Pressable
              key={o.value}
              testID={`accent-option-${o.value}`}
              onPress={() => setAccentColor(o.value)}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
              style={styles.swatchTarget}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: o.swatch,
                    borderRadius: radius.pill,
                    borderWidth: selected ? 3 : 0,
                    borderColor: colors.textPrimary,
                  },
                ]}
              />
              <Text
                variant="caption"
                color={selected ? 'primary' : 'muted'}
                weight={selected ? 'semibold' : 'regular'}
                style={styles.swatchLabel}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatchTarget: {
    width: 72,
    minHeight: 44,
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 44,
    height: 44,
  },
  swatchLabel: {
    textAlign: 'center',
  },
});
