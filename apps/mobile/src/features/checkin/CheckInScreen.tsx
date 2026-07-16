/**
 * CheckInScreen — the sub-20s daily check-in (CU-074).
 *
 * Energy / mood / stress / soreness are optional 1–5 (soreness 0–5) selectors
 * plus optional notes. Nothing is required; the user can log any subset and be
 * done in seconds (PRD §9.4, UX-INPUT-001). Copy never shames a missed check-in
 * and never implies a diagnosis (Phase H guardrail §7).
 *
 * The write goes through the mock-first `useCheckin` adapter. Notes (S2) live
 * only in ephemeral component state while editing — never persisted to device
 * storage — and are sent straight to the API on submit.
 *
 * @see apps/mobile/src/features/checkin/checkinModel.ts — pure builders
 * @see apps/mobile/src/api/hooks/useCheckin.ts — the write seam
 */

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text, TextField, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useCheckin } from '../../api/hooks/useCheckin';
import { getDeviceTimezone } from '../../api/hooks/useQuickAdd';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { resolveTimeAnchors } from '../quickAdd/quickAddModel';
import { ScaleSelector } from './components/ScaleSelector';
import {
  SCALE_1_TO_5,
  SCALE_ENDPOINTS,
  SORENESS_SCALE,
  buildCheckinRequest,
  elapsedSeconds,
  isCheckinEmpty,
  type CheckinFormState,
} from './checkinModel';

export function CheckInScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const { submit, status } = useCheckin();

  // Captured after mount (not during render) so the optional completionSeconds
  // signal reflects time on screen without an impure call on the render path.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const [form, setForm] = useState<CheckinFormState>({});
  const [done, setDone] = useState(false);

  const empty = isCheckinEmpty(form);
  const submitting = status === 'submitting';

  function set<K extends keyof CheckinFormState>(key: K, value: CheckinFormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(): Promise<void> {
    if (empty) return;
    const timezone = getDeviceTimezone();
    const anchors = resolveTimeAnchors(new Date(), timezone);
    const req = buildCheckinRequest(form, anchors, {
      ...(startedAt.current > 0 && {
        completionSeconds: elapsedSeconds(startedAt.current, Date.now()),
      }),
    });
    const result = await submit(req);
    if (result !== null) setDone(true);
  }

  if (done) {
    return (
      <Screen testID="screen-checkin" contentStyle={{ paddingTop: spacing.xl }}>
        <Card testID="checkin-success">
          <View style={{ gap: spacing.sm }}>
            <Text variant="titleSmall" weight="bold" accessibilityRole="header">
              Logged ✓
            </Text>
            <Text variant="bodyMedium" color="secondary">
              Thanks for checking in. This helps sharpen your trends over time.
            </Text>
            <Button label="Done" onPress={() => router.back()} testID="checkin-done" />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="screen-checkin" contentStyle={{ paddingTop: spacing.xl }}>
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="titleLarge" weight="bold" accessibilityRole="header">
            Daily check-in
          </Text>
          <Text variant="bodyMedium" color="secondary">
            Optional and quick — log whatever’s useful, skip the rest.
          </Text>
        </View>

        <ScaleSelector
          label="Energy"
          options={SCALE_1_TO_5}
          value={form.energy ?? null}
          onChange={(v) => set('energy', v)}
          lowLabel={SCALE_ENDPOINTS.energy.low}
          highLabel={SCALE_ENDPOINTS.energy.high}
          testID="checkin-energy"
        />
        <ScaleSelector
          label="Mood"
          options={SCALE_1_TO_5}
          value={form.mood ?? null}
          onChange={(v) => set('mood', v)}
          lowLabel={SCALE_ENDPOINTS.mood.low}
          highLabel={SCALE_ENDPOINTS.mood.high}
          testID="checkin-mood"
        />
        <ScaleSelector
          label="Stress"
          options={SCALE_1_TO_5}
          value={form.stress ?? null}
          onChange={(v) => set('stress', v)}
          lowLabel={SCALE_ENDPOINTS.stress.low}
          highLabel={SCALE_ENDPOINTS.stress.high}
          testID="checkin-stress"
        />
        <ScaleSelector
          label="Soreness"
          options={SORENESS_SCALE}
          value={form.soreness ?? null}
          onChange={(v) => set('soreness', v)}
          testID="checkin-soreness"
        />

        <TextField
          label="Notes (optional)"
          value={form.notes ?? ''}
          onChangeText={(t) => set('notes', t)}
          placeholder="Anything worth remembering about today"
          multiline
          maxLength={2000}
          testID="checkin-notes"
        />

        {status === 'error' && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t save just now"
            body="Your entries are still here. Use Save check-in to try again."
            testID="checkin-error"
          />
        )}

        {submitting && (
          <DataStatusBanner
            state="refreshing"
            title="Saving check-in"
            body="Your entries stay on screen until saving finishes."
            testID="checkin-saving"
          />
        )}

        <Button
          label={submitting ? 'Saving…' : 'Save check-in'}
          onPress={() => void onSubmit()}
          disabled={empty || submitting}
          busy={submitting}
          {...(empty
            ? { accessibilityHint: 'Choose at least one check-in value before saving' }
            : {})}
          testID="checkin-submit"
        />
      </View>
    </Screen>
  );
}
