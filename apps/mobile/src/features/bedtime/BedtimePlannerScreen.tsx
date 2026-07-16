/**
 * BedtimePlannerScreen — pick a wake time, see ranked bedtime windows (CU-064).
 *
 * The wake time anchors the screen (UX-BED-002); from it the planner returns
 * RANKED WINDOWS (best / good / latest-okay / emergency), each a time range with
 * its rationale, plus latency / sleep-debt / circadian / recovery notes and an
 * overall confidence — never a single exact "magic" bedtime (UX-BED-001).
 *
 * No scoring or AI runs on the render path: the plan is produced by the
 * `useBedtimePlan` adapter (mock today, future `/v1/bedtime` route) off the
 * render path when the request changes. Motion respects reduced-motion.
 *
 * @see apps/mobile/src/api/hooks/useBedtimePlan.ts — data seam (API/mock)
 * @see apps/mobile/src/features/bedtime/bedtimeModel.ts — pure formatting helpers
 * @see docs/source-of-truth/primis_ui_ux_design_system_spec.md §6.3 — UX rules
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';

import { useBedtimePlan } from '../../api/hooks/useBedtimePlan';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { BedtimePlanRequest, TrainingImportance, WakeFlexibility } from './bedtimeContract';
import { hasWindows, minutesToTime, resolveBedtimeBanner } from './bedtimeModel';
import {
  BedtimeNotesCard,
  BedtimeOptionsRow,
  BedtimeWindowCard,
  WakeTimePicker,
} from './components';

/** Default target wake time: 7:00 AM (minutes since midnight). */
const DEFAULT_WAKE_MINUTES = 7 * 60;

export function BedtimePlannerScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const { getTimingConfig } = useReducedMotion();

  const [wakeMinutes, setWakeMinutes] = useState(DEFAULT_WAKE_MINUTES);
  const [wakeFlexibility, setWakeFlexibility] = useState<WakeFlexibility>('flexible_15');
  const [trainingImportance, setTrainingImportance] = useState<TrainingImportance>('none');

  // Stable request object so the adapter only recomputes on a real input change.
  const request = useMemo<BedtimePlanRequest>(
    () => ({
      targetWakeTimeLocal: minutesToTime(wakeMinutes),
      wakeFlexibility,
      nextDayTrainingImportance: trainingImportance,
    }),
    [wakeMinutes, wakeFlexibility, trainingImportance],
  );

  const { plan, status, isRefreshing, hasRefreshError, refetch } = useBedtimePlan(request);

  // Subtle mount fade — token-driven duration, instant under reduced motion.
  const [fade] = useState(() => new Animated.Value(0));
  const fadeDuration = getTimingConfig('standard').duration;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [fade, fadeDuration]);

  const banner = plan !== null ? resolveBedtimeBanner(plan) : null;
  const showWindows = plan !== null && hasWindows(plan);

  return (
    <Screen testID="screen-bedtime-planner" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="titleLarge">Bedtime Planner</Text>
          <Text variant="bodySmall" color="muted">
            Set your wake time to see tonight’s bedtime windows.
          </Text>
        </View>

        <WakeTimePicker
          wakeMinutes={wakeMinutes}
          onChange={setWakeMinutes}
          testID="bedtime-wake-picker"
        />

        <BedtimeOptionsRow
          wakeFlexibility={wakeFlexibility}
          onWakeFlexibilityChange={setWakeFlexibility}
          trainingImportance={trainingImportance}
          onTrainingImportanceChange={setTrainingImportance}
          testID="bedtime-options"
        />

        {isRefreshing && (
          <DataStatusBanner
            state="refreshing"
            title="Updating bedtime windows"
            testID="bedtime-refreshing"
          />
        )}

        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update bedtime windows"
            body="Showing the last prepared windows for this plan."
            onAction={() => void refetch()}
            testID="bedtime-refresh-error"
          />
        )}

        {status === 'error' && plan === null && (
          <DataStatePanel
            state="api_error"
            title="Couldn’t prepare bedtime windows"
            onAction={() => void refetch()}
            testID="bedtime-error"
          />
        )}

        {status === 'loading' && plan === null && (
          <DataStatePanel
            state="initial_loading"
            title="Preparing bedtime windows"
            testID="bedtime-loading"
          />
        )}

        {banner !== null && (
          <Card
            testID="bedtime-banner"
            style={{ borderLeftWidth: 3, borderLeftColor: colors.accent }}
          >
            <Text variant="bodyMedium" color="secondary">
              {banner.message}
            </Text>
          </Card>
        )}

        {showWindows && plan !== null ? (
          <View style={{ gap: spacing.md }} testID="bedtime-windows">
            <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
              RECOMMENDED WINDOWS
            </Text>
            {plan.recommendations.map((window) => (
              <BedtimeWindowCard
                key={window.label}
                window={window}
                testID={`bedtime-window-${window.label}`}
              />
            ))}
          </View>
        ) : status === 'ready' ? (
          <DataStatePanel
            state="empty"
            title="No bedtime windows available"
            body="Adjust your target wake time to prepare a new set of recommended windows."
            testID="bedtime-empty"
          />
        ) : null}

        {plan !== null && <BedtimeNotesCard plan={plan} testID="bedtime-notes" />}

        {/* Reminder scheduling is out of scope for Phase G (no notifications);
            this disabled stub keeps the layout stable for a later phase. */}
        <Button
          variant="secondary"
          label="Set a reminder (coming soon)"
          onPress={() => undefined}
          disabled
          testID="bedtime-reminder-stub"
          accessibilityHint="Reminder scheduling arrives in a later update"
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
