/**
 * SleepContributorsCard — the Sleep Score breakdown (CU-063 → CU-068).
 *
 * Thin wrapper around the shared {@link ScoreContributorList} so Sleep reuses the
 * one reusable score-explanation pattern (components, weights, contributions, and
 * a "See full breakdown" entry to the {@link ScoreDetailSheet}) instead of a
 * bespoke local breakdown. No scoring math runs here — every number is read from
 * the contract and formatted by `scoreExplanationModel`.
 */

import React from 'react';

import type { ScoreSnapshotDto } from '@primis/api-contracts';

import { ScoreContributorList } from '../../scores';

export interface SleepContributorsCardProps {
  score: ScoreSnapshotDto;
  testID?: string;
}

export function SleepContributorsCard({
  score,
  testID,
}: SleepContributorsCardProps): React.JSX.Element {
  return (
    <ScoreContributorList
      score={score}
      heading="WHAT SHAPED YOUR SCORE"
      {...(testID !== undefined ? { testID } : {})}
    />
  );
}
