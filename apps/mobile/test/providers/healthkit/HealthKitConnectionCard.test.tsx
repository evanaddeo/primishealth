import React from 'react';
import { renderWithAct } from '@testing-library/react-native/build/render-act';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));

vi.mock('@primis/design-system', () => ({
  Button: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) =>
    React.createElement('Button', { onPress, testID }, label),
  Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('View', { testID }, children),
  Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('Text', { testID }, children),
  useTheme: () => ({ spacing: { xs: 4, sm: 8, lg: 16 } }),
}));

import { FakeHealthKitAdapter } from '../../../src/providers/healthkit/FakeHealthKitAdapter';
import { HealthKitConnectionCard } from '../../../src/providers/healthkit/HealthKitConnectionCard';

describe('HealthKitConnectionCard', () => {
  it('shows default-off status with no action and never requests permission on render', async () => {
    const adapter = new FakeHealthKitAdapter({ featureEnabled: false });
    const view = renderWithAct(<HealthKitConnectionCard adapter={adapter} enabled={false} />);
    await React.act(async () => Promise.resolve());
    expect(adapter.authorizationRequestCount).toBe(0);
    expect(JSON.stringify(view.toJSON())).toContain('Off in this build');
    expect(() => view.root.findByProps({ testID: 'healthkit-connect' })).toThrow();
  });

  it('does not request on render and requests once on explicit press', async () => {
    const adapter = new FakeHealthKitAdapter();
    const view = renderWithAct(<HealthKitConnectionCard adapter={adapter} enabled />);
    await React.act(async () => Promise.resolve());
    expect(adapter.authorizationRequestCount).toBe(0);
    await React.act(async () => {
      view.root.findByProps({ testID: 'healthkit-connect' }).props.onPress();
      await Promise.resolve();
    });
    expect(adapter.authorizationRequestCount).toBe(1);
    expect(JSON.stringify(view.toJSON())).toContain('Apple may return limited or no data');
  });
});
