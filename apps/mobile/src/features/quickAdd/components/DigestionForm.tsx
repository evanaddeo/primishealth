/**
 * DigestionForm — optional, discreet gut tracking (CU-074, UX-INPUT-002/003).
 *
 * Reached only when the user opens it (never a daily prompt). Framing is mature
 * and clinical: structured Bristol type + an optional bloating rating + optional
 * notes. No diagnosis, no disease language, no alarming copy anywhere.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  NumberStepper,
  SegmentedControl,
  Text,
  TextField,
  useTheme,
} from '@primis/design-system';

import { BRISTOL_OPTIONS, buildDigestionRequest } from '../quickAddModel';
import type { DigestionFormState } from '../quickAddModel';
import type { QuickAddFormProps } from './types';

export function DigestionForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [bristol, setBristol] = useState<number | null>(null);
  const [bloating, setBloating] = useState(0);
  const [notes, setNotes] = useState('');

  const isEmpty = bristol === null && bloating === 0 && notes.trim().length === 0;

  async function log(): Promise<void> {
    if (isEmpty) return;
    const state: DigestionFormState = {
      ...(bristol !== null && { bristolType: bristol }),
      ...(bloating > 0 && { bloatingLevel: bloating }),
      ...(notes.trim().length > 0 && { notes: notes.trim() }),
    };
    const ok = await controller.logDigestion(buildDigestionRequest(state, buildAnchors()));
    if (ok) onLogged('Logged');
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="bodySmall" color="muted">
        Optional. Stored privately to surface trends over time — never a diagnosis.
      </Text>

      <SegmentedControl<number>
        label="Bristol type"
        options={BRISTOL_OPTIONS.map((b) => ({ value: b, label: String(b) }))}
        value={bristol}
        onChange={(b) => setBristol(bristol === b ? null : b)}
        testID="digestion-bristol"
      />

      <NumberStepper
        label="Bloating"
        value={bloating}
        onChange={setBloating}
        min={0}
        max={5}
        step={1}
        testID="digestion-bloating"
      />

      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything worth noting"
        multiline
        maxLength={2000}
        testID="digestion-notes"
      />

      <Button
        label={controller.pending ? 'Saving digestion entry…' : 'Log digestion entry'}
        onPress={() => void log()}
        disabled={isEmpty || controller.pending}
        busy={controller.pending}
        {...(isEmpty
          ? { accessibilityHint: 'Choose or enter at least one value before saving' }
          : {})}
      />
    </View>
  );
}
