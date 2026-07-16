/**
 * GoalsScreen — step 3: select and rank goals (PRD-FR-ONB-001/002, UI/UX §7.1).
 *
 * The user picks one or more goals (required) and orders them by priority.
 * Selected goals appear in a ranked list with up/down controls; the rest are
 * available to add below. Ranking order is persisted to `settingsStore.goals`
 * so it survives an app restart and feeds the onboarding-goals request.
 *
 * Ordering logic lives in pure helpers (`goalsRanking.ts`) — this screen only
 * wires them to the store.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { type GoalCode } from '@primis/api-contracts';
import { Card, IconButton, Text, useTheme } from '@primis/design-system';

import { useSettingsStore } from '../../../state/settingsStore';
import { OnboardingScaffold, SelectableRow } from '../components';
import { moveGoalDown, moveGoalUp, toggleGoal } from '../goalsRanking';
import { GOAL_OPTIONS } from '../options';
import { useOnboarding } from '../useOnboarding';

const GOAL_LABELS: Record<GoalCode, string> = GOAL_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.code]: o.label }),
  {} as Record<GoalCode, string>,
);

export function GoalsScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('goals');
  const { colors, spacing, radius } = useTheme();

  const goals = useSettingsStore((s) => s.goals);
  const setGoals = useSettingsStore((s) => s.setGoals);

  const selectedSet = new Set(goals);
  const remaining = GOAL_OPTIONS.filter((o) => !selectedSet.has(o.code));

  return (
    <OnboardingScaffold
      testID="onboarding-goals"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Your goals"
      title="What are you training for?"
      subtitle="Pick what matters most, then order them. Primis weights your scores and coaching toward the top."
      primaryLabel="Continue"
      onPrimary={goNext}
      primaryDisabled={goals.length === 0}
      footerNote={
        goals.length === 0
          ? 'Select at least one goal to continue.'
          : 'Highest priority sits at the top.'
      }
    >
      {goals.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodySmall" color="muted" weight="semibold">
            YOUR PRIORITIES
          </Text>
          {goals.map((code, index) => (
            <Card key={code} testID={`goal-ranked-${code}`}>
              <View style={[styles.rankRow, { gap: spacing.md }]}>
                <View
                  style={[
                    styles.rankBadge,
                    { backgroundColor: colors.accent, borderRadius: radius.pill },
                  ]}
                >
                  <Text variant="bodySmall" weight="bold" style={{ color: colors.bg }}>
                    {index + 1}
                  </Text>
                </View>
                <Text variant="bodyLarge" weight="semibold" style={{ flex: 1 }}>
                  {GOAL_LABELS[code]}
                </Text>
                <RankButton
                  label={`Move ${GOAL_LABELS[code]} up`}
                  glyph="↑"
                  disabled={index === 0}
                  color={colors.textPrimary}
                  mutedColor={colors.textMuted}
                  onPress={() => setGoals(moveGoalUp(goals, index))}
                />
                <RankButton
                  label={`Move ${GOAL_LABELS[code]} down`}
                  glyph="↓"
                  disabled={index === goals.length - 1}
                  color={colors.textPrimary}
                  mutedColor={colors.textMuted}
                  onPress={() => setGoals(moveGoalDown(goals, index))}
                />
                <RankButton
                  label={`Remove ${GOAL_LABELS[code]}`}
                  glyph="✕"
                  disabled={false}
                  color={colors.textSecondary}
                  mutedColor={colors.textMuted}
                  onPress={() => setGoals(toggleGoal(goals, code))}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {remaining.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: goals.length > 0 ? spacing.lg : 0 }}>
          <Text variant="bodySmall" color="muted" weight="semibold">
            {goals.length > 0 ? 'ADD ANOTHER' : 'CHOOSE YOUR GOALS'}
          </Text>
          {remaining.map((o) => (
            <SelectableRow
              key={o.code}
              testID={`goal-option-${o.code}`}
              label={o.label}
              description={o.description}
              selected={false}
              onPress={() => setGoals(toggleGoal(goals, o.code))}
              accessibilityHint="Adds this goal to your priorities"
            />
          ))}
        </View>
      )}
    </OnboardingScaffold>
  );
}

function RankButton({
  label,
  glyph,
  disabled,
  color,
  mutedColor,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  color: string;
  mutedColor: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <IconButton
      icon={
        <Text
          variant="bodyLarge"
          weight="bold"
          allowFontScaling={false}
          style={{ color: disabled ? mutedColor : color }}
        >
          {glyph}
        </Text>
      }
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={styles.rankButton}
    />
  );
}

const styles = StyleSheet.create({
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
