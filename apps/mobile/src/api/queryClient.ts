/**
 * TanStack Query client — centralized cache and fetching configuration.
 *
 * Configured for React Native stale-while-revalidate patterns:
 * - `refetchOnWindowFocus: false` is required for RN — the default `true`
 *   triggers unnecessary refetches on Android app foreground events.
 * - `staleTime: 5m` / `gcTime: 30m` matches ARCH-MOBILE-002 (stale-while-revalidate).
 *
 * @see TAD §6.1 — TanStack Query
 * @see TAD ARCH-MOBILE-002 — stale-while-revalidate requirement
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Data is considered fresh for 5 minutes before a background refetch is triggered. */
      staleTime: 5 * 60 * 1000,
      /**
       * Unused query results are kept in cache for 30 minutes before garbage collection.
       * Supports fast navigation back to previously loaded screens.
       */
      gcTime: 30 * 60 * 1000,
      /**
       * Retry failed queries up to 2 times before surfacing an error.
       * Back-off is handled by TanStack Query's default exponential strategy.
       */
      retry: 2,
      /**
       * Disable window-focus refetching — always false in React Native.
       * The equivalent RN lifecycle events are managed via AppState listeners if needed.
       */
      refetchOnWindowFocus: false,
    },
  },
});
