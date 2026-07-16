/**
 * TagForm — searchable, reusable custom tags (CU-074, UX-INPUT-004).
 *
 * Tapping a tag logs a tag event for now. If the search text matches no existing
 * tag, the user can create-and-log it in one action (idempotent upsert).
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Text, TextField, useTheme } from '@primis/design-system';

import { buildTagEventRequest, filterTags } from '../quickAddModel';
import type { QuickAddFormProps } from './types';

export function TagForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [query, setQuery] = useState('');

  const matches = filterTags(controller.tags, query);
  const trimmed = query.trim();
  const exactExists = controller.tags.some(
    (t) => t.displayName.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed.length > 0 && !exactExists;

  async function logTag(tagCode: string, displayName: string): Promise<void> {
    const ok = await controller.logTagEvent(buildTagEventRequest({ tagCode }, buildAnchors()));
    if (ok) onLogged(`Logged "${displayName}"`);
  }

  async function createAndLog(): Promise<void> {
    const tag = await controller.createTag({ displayName: trimmed });
    if (tag !== null) {
      await logTag(tag.tagCode, tag.displayName);
      setQuery('');
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <TextField
        label="Find or create a tag"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. Late caffeine"
        autoCapitalize="sentences"
        maxLength={60}
        testID="tag-search"
      />

      {matches.length > 0 ? (
        <ChipRow>
          {matches.map((t) => (
            <Chip
              key={t.id}
              label={t.displayName}
              onPress={() => void logTag(t.tagCode, t.displayName)}
              testID={`tag-${t.tagCode}`}
            />
          ))}
        </ChipRow>
      ) : (
        <Text variant="bodySmall" color="muted">
          No matching tags yet.
        </Text>
      )}

      {canCreate && (
        <Button
          variant="secondary"
          label={`Create & log “${trimmed}”`}
          onPress={() => void createAndLog()}
          disabled={controller.pending}
          busy={controller.pending}
        />
      )}
    </View>
  );
}
