import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * Whether the tab is on screen. Polling uses this instead of RTK Query's skipPollingIfUnfocused, because the
 * throttled focus handler in focusListeners.ts does not keep RTK's own focus state in step.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}
