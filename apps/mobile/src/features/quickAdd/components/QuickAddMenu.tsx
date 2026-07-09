/**
 * QuickAddMenu — the quick-add category picker + "today so far" summary (CU-074).
 *
 * The summary reflects the optimistic local-first roll-up so a just-logged value
 * shows immediately. Copy is encouraging and never shaming — an empty day simply
 * reads as a calm prompt, not a missed-streak warning.
 */

import React from 'react';
import { Pressable, View } from 'react-native';

import { Card, Chip, ChipRow, Text, useTheme } from '@primis/design-system';

import type { QuickAddController } from '../../../api/hooks/useQuickAdd';
import { formatCaffeine, formatDrinks, formatHydration } from '../quickAddModel';

export type QuickAddCategory = 'water' | 'caffeine' | 'alcohol' | 'macros' | 'tag' | 'digestion';

export interface QuickAddMenuProps {
  controller: QuickAddController;
  onSelect: (category: QuickAddCategory) => void;
}

const PRIMARY: ReadonlyArray<{ category: QuickAddCategory; label: string; icon: string }> = [
  { category: 'water', label: 'Water', icon: '💧' },
  { category: 'caffeine', label: 'Caffeine', icon: '☕️' },
  { category: 'alcohol', label: 'Alcohol', icon: '🍷' },
  { category: 'macros', label: 'Macros', icon: '🍽️' },
  { category: 'tag', label: 'Tag', icon: '🏷️' },
];

export function QuickAddMenu({ controller, onSelect }: QuickAddMenuProps): React.JSX.Element {
  const { spacing } = useTheme();
  const summary = controller.lifestyle?.summary ?? null;
  const calories = controller.nutrition?.summary.caloriesInKcal ?? null;

  return (
    <View style={{ gap: spacing.lg }}>
      <Card variant="default">
        <Text variant="bodySmall" weight="semibold" color="secondary">
          Today so far
        </Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm }}
        >
          <SummaryStat label="Water" value={formatHydration(summary?.hydrationMl ?? null)} />
          <SummaryStat label="Caffeine" value={formatCaffeine(summary?.caffeineMg ?? null)} />
          <SummaryStat
            label="Alcohol"
            value={formatDrinks(summary?.alcoholStandardDrinks ?? null)}
          />
          <SummaryStat
            label="Calories"
            value={calories === null ? '—' : `${Math.round(calories)} kcal`}
          />
        </View>
      </Card>

      <ChipRow>
        {PRIMARY.map((item) => (
          <Chip
            key={item.category}
            label={item.label}
            icon={item.icon}
            onPress={() => onSelect(item.category)}
            testID={`quickadd-${item.category}`}
          />
        ))}
      </ChipRow>

      {/* Digestion is reachable but deliberately quiet — not a daily prompt. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log digestion"
        onPress={() => onSelect('digestion')}
        hitSlop={8}
        style={{ minHeight: 44, justifyContent: 'center' }}
        testID="quickadd-digestion"
      >
        <Text variant="bodySmall" color="muted">
          Digestion tracking
        </Text>
      </Pressable>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={{ minWidth: 72 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="titleSmall" weight="bold">
        {value}
      </Text>
    </View>
  );
}
