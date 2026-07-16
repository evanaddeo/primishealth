import React from 'react';

import { DataStatePanel, type DataStatePanelProps } from './DataStatePanel';
import { DataStatusBanner } from './DataStatusBanner';
import { resolveDataStateCopy } from './dataStateModel';

export type DataStateProps = DataStatePanelProps;

/** Chooses the common blocking panel or non-blocking banner from state semantics. */
export function DataState(props: DataStateProps): React.JSX.Element {
  return resolveDataStateCopy(props.state).placement === 'blocking' ? (
    <DataStatePanel {...props} />
  ) : (
    <DataStatusBanner {...props} />
  );
}

export { DataStatePanel } from './DataStatePanel';
export { DataStatusBanner } from './DataStatusBanner';
export type { DataStateKind } from './dataStateModel';
