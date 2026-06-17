/**
 * Bedtime Planner — placeholder route (CU-063).
 *
 * This is ONLY the navigation target for the Sleep screen's Bedtime Planner
 * entry point (UX-SLEEP-004). The real planner — wake-time selection and ranked
 * bedtime windows — is implemented in CU-064, which replaces this file.
 */

import { Screen, Text, useTheme } from '@primis/design-system';

export default function BedtimePlannerScreen() {
  const { spacing } = useTheme();
  return (
    <Screen
      testID="screen-bedtime-planner"
      contentStyle={{ paddingTop: spacing.xl, gap: spacing.sm }}
    >
      <Text variant="titleLarge">Bedtime Planner</Text>
      <Text variant="bodyMedium" color="secondary">
        Coming soon — choose a wake time to see your ranked bedtime windows.
      </Text>
    </Screen>
  );
}
